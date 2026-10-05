import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Decimal } from "decimal.js";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  atualizarCategoriaCusto,
  atualizarCenario,
  atualizarCondicaoPagamento,
  atualizarCusto,
  atualizarDestinatarioComissao,
  atualizarEmpreendimento,
  atualizarContrapartePermuta,
  atualizarFaixaComissao,
  atualizarPermuta,
  atualizarTipologia,
  atualizarVenda,
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarContrapartePermuta,
  criarCronograma,
  criarCusto,
  criarDestinatarioComissao,
  criarFaixaComissao,
  criarEmpreendimento,
  atualizarPrecoUnidade,
  excluirVenda,
  impactoExclusaoVenda,
  substituirCronograma,
  atualizarPremissaVelocidade,
  criarPremissaVelocidade,
  excluirPremissaVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
  criarUnidadesPorAndar,
  definirFinanciamento,
  definirPontoIndiceCorrecao,
  atualizarTerreno,
  criarTerreno,
  excluirTerreno,
  desfazerDistrato,
  desfazerPermuta,
  duplicarCenario,
  excluirCategoriaCusto,
  excluirCenario,
  excluirCondicaoPagamento,
  excluirContrapartePermuta,
  excluirCronograma,
  excluirCusto,
  excluirDestinatarioComissao,
  excluirFaixaComissao,
  excluirEmpreendimento,
  excluirFinanciamento,
  excluirPontoIndiceCorrecao,
  excluirTipologia,
  listarRecebimentosDoCenario,
  listarVendasDoCenario,
  registrarDistrato,
  registrarPermuta,
  registrarRenegociacaoVenda,
  registrarVenda,
  impactoExclusao,
  resumoEstoque,
  type ModalidadeInput,
} from "../../src/db/cadastro.js";
import {
  autenticar,
  criarUsuario,
  desvincularUsuarioEmpreendimento,
  empreendimentosPermitidos,
  encerrarSessao,
  excluirUsuario,
  listarEmpreendimentosDoUsuario,
  listarUsuarios,
  redefinirSenha,
  nivelAcessoEmpreendimento,
  validarSessao,
  vincularUsuarioEmpreendimento,
  atualizarUsuario,} from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { confirmarConciliacao, montarCandidatosConciliacao, type ConfirmacaoConciliacao } from "../../src/db/conciliacao.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import {
  formatarTir,
  taxaDescontoEfetiva,
  calcularSensibilidadeCenario,
  montarComparacaoCenarios,
  montarCurvaCronogramaDoCenario,
  montarCustosResumoDoCenario,
  calcularAvisosPremissas,
  ehVendaDaPremissa,
  mensagemParcelasPagasSemBase,
  montarPremissasResumoCenario,
  parcelasPagasQuePerderiamBase,
  rodarMotorParaCenario,
} from "../../src/db/servicoMotor.js";
import { montarDadosRelatorioComparativo, montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";
import { gerarExcelComparativo, gerarExcelViabilidade } from "../../src/relatorios/excel.js";
import { gerarPdfComparativo, gerarPdfViabilidade } from "../../src/relatorios/pdf.js";
import { parseExtratoCSV, sugerirConciliacao } from "../../src/core/conciliacaoExtrato.js";
import type { EixoSensibilidade } from "../../src/core/motorSensibilidade.js";
import type { TipoIncidenciaCusto } from "../../src/core/types.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: { id: string; email: string; nome: string; papel: string };
  }
}

const NOME_COOKIE_SESSAO = "sessao";
const DURACAO_COOKIE_SEGUNDOS = 60 * 60 * 24 * 7;

/**
 * Permissão por empreendimento (achado F5, docs/DECISOES.md): checa acesso
 * e, se negado, já responde 404 (mesma mensagem de "não encontrado" — não
 * revela a um usuário sem vínculo que o empreendimento existe). Devolve
 * false quando a rota deve parar aqui.
 *
 * empreendimentoId null é usado para recursos globais (ex.: categoria de
 * custo reutilizável entre empreendimentos) — sempre acessíveis.
 */
/**
 * Estendido (achado F23, docs/DECISOES.md — "permissão por empreendimento
 * com papel próprio") para tambem bloquear escrita quando o vinculo do
 * usuario com este empreendimento e "leitura": qualquer metodo != GET
 * recebe 403. Deliberadamente lido de req.method em vez de um parametro
 * extra em cada uma das ~40 chamadas existentes -- Fastify ja garante que
 * o metodo da rota bate com o verbo HTTP real, entao isto cobre toda rota
 * escopada por empreendimento sem precisar tocar em nenhuma delas.
 */
async function garantirAcesso(req: FastifyRequest, reply: FastifyReply, empreendimentoId: string | null): Promise<boolean> {
  if (empreendimentoId === null) return true;
  const nivel = await nivelAcessoEmpreendimento(req.usuario!, empreendimentoId);
  if (nivel === null) {
    reply.code(404);
    reply.send({ erro: "Empreendimento não encontrado" });
    return false;
  }
  if (nivel === "leitura" && req.method !== "GET") {
    reply.code(403);
    reply.send({ erro: "Seu acesso a este empreendimento é somente leitura — peça a um administrador para conceder edição" });
    return false;
  }
  return true;
}

/**
 * API — casca fina sobre o motor da Fase 0. Nenhuma regra de negocio vive
 * aqui: toda rota apenas le do banco e/ou chama rodarMotorParaCenario().
 * O motor em si (src/core) continua sem nenhuma dependencia desta camada.
 *
 * Exportado separado de server.ts para poder ser testado com app.inject()
 * (Fastify) sem precisar abrir uma porta real.
 */
// Fechamento/hardening da Fase 1 (achado F29, docs/DECISOES.md): `origin:
// true` aceitava QUALQUER origem com `credentials: true` -- adequado
// enquanto o sistema só roda em localhost, mas uma vulnerabilidade real
// assim que a API for exposta além disso (qualquer site poderia fazer
// requisições autenticadas com o cookie de sessão do usuário). A lista é
// configurável por `CORS_ORIGINS` (separado por vírgula) para produção,
// com um padrão que cobre só as origens de desenvolvimento local
// conhecidas -- nunca "aceitar tudo" por omissão.
const ORIGENS_PERMITIDAS = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Valores monetários/percentuais chegam como texto (decimal-as-string). Um espaço
// ou vírgula sobrando gravava lixo no banco e o motor quebrava com 500 depois.
function lerDecimal(valor: string | undefined, rotulo: string, exemplo: string, maximo?: number, aceitaNegativo = false): { valor?: string; erro?: string } {
  if (valor === undefined) return {};
  const limpo = valor.trim();
  const formato = aceitaNegativo ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;
  if (!formato.test(limpo)) return { erro: `${rotulo} deve ser um número com ponto decimal (ex.: ${exemplo})` };
  if (maximo !== undefined && Number(limpo) > maximo) return { erro: `${rotulo} deve ficar entre 0 e ${maximo}` };
  return { valor: limpo };
}

function lerValorAtribuido(valor: string | null | undefined): { valor?: string | null; erro?: string } {
  if (valor === null) return { valor: null };
  return lerDecimal(valor, "Valor atribuído", "100000.00");
}

function lerModalidades(modalidades: ModalidadeInput[]): { modalidades?: ModalidadeInput[]; erro?: string } {
  const lidas: ModalidadeInput[] = [];
  for (const m of modalidades) {
    if (m.mesFinal !== undefined && m.mesFinal !== null && (m.tipoDistribuicao !== "nivelada" || !Number.isInteger(m.mesFinal) || m.mesFinal < 1)) {
      return { erro: `Mês final da modalidade "${m.nome}" só vale para nivelada e deve ser um inteiro maior ou igual a 1` };
    }
    const percentual = lerDecimal(m.percentual, `Percentual da modalidade "${m.nome}"`, "0.2", 1);
    if (percentual.erro) return { erro: percentual.erro };
    if (percentual.valor === undefined) return { erro: `Percentual da modalidade "${m.nome}" é obrigatório` };
    lidas.push({ ...m, nome: m.nome.trim(), percentual: percentual.valor });
  }
  return { modalidades: lidas };
}

export async function buildApp() {
  const app = Fastify({ logger: false });
  // Limite de tentativas de login por minuto, por IP. Lido dentro de
  // buildApp() (não como constante de módulo) para que um teste possa
  // mudar process.env.RATE_LIMIT_LOGIN_MAX e chamar buildApp() de novo,
  // sem depender da ordem em que os módulos foram importados. Sob a suíte
  // de testes (Vitest, identificado por process.env.VITEST) toda chamada
  // de app.inject() compartilha o mesmo IP sintético, e a suíte inteira
  // faz centenas de logins -- por isso o padrão sob teste é bem mais alto,
  // nunca atingido pelo uso normal dos outros ~40 arquivos de teste.
  const LOGIN_RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? (process.env.VITEST ? 100000 : 20));
  await app.register(cors, { origin: ORIGENS_PERMITIDAS, credentials: true });
  await app.register(cookie);
  // Fechamento/hardening da Fase 1: sem isso, /api/auth/login aceitava
  // tentativas ilimitadas de senha -- um alvo óbvio de força bruta. 20
  // tentativas por minuto por IP é folgado o bastante para um usuário
  // real errar a senha algumas vezes, mas barra um script automatizado.
  await app.register(rateLimit, { global: false });

  // Toda rota /api/* exige sessao valida, exceto login (senao ninguem
  // consegue entrar) e logout (um cookie invalido ainda precisa poder ser
  // limpo). Permissao e propositalmente grossa nesta fase (achado, ver
  // docs/DECISOES.md): so "admin" x "usuario", sem controle por
  // empreendimento — checado rota a rota nas cinco rotas de exclusao.
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (req.url === "/api/auth/login" || req.url === "/api/auth/logout") return;
    const token = req.cookies[NOME_COOKIE_SESSAO];
    const usuario = token ? await validarSessao(token) : null;
    if (!usuario) {
      reply.code(401);
      return reply.send({ erro: "Não autenticado" });
    }
    req.usuario = usuario;
  });

  app.post<{ Body: { email?: string; senha?: string } }>(
    "/api/auth/login",
    { config: { rateLimit: { max: LOGIN_RATE_LIMIT_MAX, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { email, senha } = req.body ?? {};
      if (!email || !senha) {
        reply.code(400);
        return { erro: "Email e senha são obrigatórios" };
      }
      const resultado = await autenticar({ email, senha });
      if (!resultado) {
        reply.code(401);
        return { erro: "Email ou senha inválidos" };
      }
      reply.setCookie(NOME_COOKIE_SESSAO, resultado.token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: DURACAO_COOKIE_SEGUNDOS,
      });
      return resultado.usuario;
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[NOME_COOKIE_SESSAO];
    if (token) await encerrarSessao(token);
    reply.clearCookie(NOME_COOKIE_SESSAO, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    return req.usuario;
  });

  app.post<{ Body: { email?: string; nome?: string; senha?: string; papel?: string } }>("/api/usuarios", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem criar usuários" };
    }
    const { email, nome, senha, papel } = req.body ?? {};
    if (!email || !email.trim() || !nome || !nome.trim() || !senha || senha.length < 6) {
      reply.code(400);
      return { erro: "Email, nome e senha (mínimo 6 caracteres) são obrigatórios" };
    }
    if (papel !== undefined && papel !== "admin" && papel !== "usuario" && papel !== "stakeholder") {
      reply.code(400);
      return { erro: "Papel deve ser 'admin', 'usuario' ou 'stakeholder'" };
    }
    try {
      const usuario = await criarUsuario({ email: email.trim(), nome: nome.trim(), senha, papel: papel as "admin" | "usuario" | "stakeholder" | undefined });
      reply.code(201);
      return usuario;
    } catch (e: any) {
      reply.code(400);
      return { erro: "Já existe um usuário com este email" };
    }
  });

  app.get("/api/usuarios", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem listar usuários" };
    }
    return listarUsuarios();
  });

  app.patch<{ Params: { id: string }; Body: { nome?: string; papel?: string } }>("/api/usuarios/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem editar usuários" };
    }
    const { nome, papel } = req.body ?? {};
    const papeisValidos = ["admin", "usuario", "stakeholder"];
    if (papel !== undefined && !papeisValidos.includes(papel)) {
      reply.code(400);
      return { erro: `Papel deve ser um de: ${papeisValidos.join(", ")}` };
    }
    if (nome !== undefined && !nome.trim()) {
      reply.code(400);
      return { erro: "Nome não pode ficar vazio" };
    }
    const resultado = await atualizarUsuario(req.params.id, {
      nome: nome?.trim(),
      papel: papel as "admin" | "usuario" | "stakeholder" | undefined,
    });
    if ("erro" in resultado) {
      reply.code(resultado.erro === "Usuário não encontrado" ? 404 : 400);
      return { erro: resultado.erro };
    }
    return resultado.usuario;
  });

  app.delete<{ Params: { id: string } }>("/api/usuarios/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir usuários" };
    }
    if (req.usuario!.id === req.params.id) {
      reply.code(400);
      return { erro: "Não é possível excluir o próprio usuário" };
    }
    await excluirUsuario(req.params.id);
    reply.code(204);
    return null;
  });

  // Redefinicao de senha assistida por admin (achado F14, docs/DECISOES.md
  // — "seguranca de sessao"): sem infraestrutura de email neste projeto,
  // nao ha link de recuperacao autoatendido -- um admin define a nova
  // senha diretamente e comunica ao usuario por fora do sistema.
  app.patch<{ Params: { id: string }; Body: { senha?: string } }>("/api/usuarios/:id/senha", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem redefinir senha" };
    }
    const { senha } = req.body ?? {};
    if (!senha || senha.length < 6) {
      reply.code(400);
      return { erro: "Senha deve ter ao menos 6 caracteres" };
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) {
      reply.code(404);
      return { erro: "Usuário não encontrado" };
    }
    await redefinirSenha(req.params.id, senha);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/usuarios/:id/empreendimentos", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem ver vínculos de acesso" };
    }
    return listarEmpreendimentosDoUsuario(req.params.id);
  });

  // Vinculo em lote (achado F22, docs/DECISOES.md — "vinculo de usuario em
  // lote"): `empreendimentoIds` (plural) vincula varios de uma vez;
  // `empreendimentoId` (singular) continua funcionando, para nao quebrar
  // nenhum chamador existente -- e tratado como uma lista de um elemento.
  // `papel` (achado F23 — "permissao por empreendimento com papel proprio")
  // e aplicado a todos os ids desta chamada; omitido = "edicao" (mesmo
  // acesso total de antes desta fatia). Reenviar um id ja vinculado
  // atualiza o papel em vez de falhar (upsert, ver vincularUsuarioEmpreendimento).
  app.post<{ Params: { id: string }; Body: { empreendimentoId?: string; empreendimentoIds?: string[]; papel?: string } }>(
    "/api/usuarios/:id/empreendimentos",
    async (req, reply) => {
      if (req.usuario!.papel !== "admin") {
        reply.code(403);
        return { erro: "Apenas administradores podem gerenciar vínculos de acesso" };
      }
      const { empreendimentoId, empreendimentoIds, papel } = req.body ?? {};
      const ids = empreendimentoIds && empreendimentoIds.length > 0 ? empreendimentoIds : empreendimentoId ? [empreendimentoId] : [];
      if (ids.length === 0) {
        reply.code(400);
        return { erro: "empreendimentoId ou empreendimentoIds é obrigatório" };
      }
      if (papel !== undefined && papel !== "edicao" && papel !== "leitura") {
        reply.code(400);
        return { erro: "papel deve ser 'edicao' ou 'leitura'" };
      }
      const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
      if (!usuario) {
        reply.code(404);
        return { erro: "Usuário não encontrado" };
      }
      // Stakeholder (Fase 2.5, docs/DECISOES.md): so pode ter vinculo de
      // leitura -- nunca edicao. Verificado aqui, no unico ponto que grava
      // EmpreendimentoUsuario.papel, para nao depender de nenhuma tela
      // respeitar essa regra sozinha.
      if (usuario.papel === "stakeholder" && papel === "edicao") {
        reply.code(400);
        return { erro: "Stakeholder só pode ter acesso de leitura" };
      }
      const empreendimentos = await prisma.empreendimento.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const idsEncontrados = new Set(empreendimentos.map((e) => e.id));
      const idsInexistentes = ids.filter((id) => !idsEncontrados.has(id));
      if (idsInexistentes.length > 0) {
        reply.code(404);
        return { erro: `Empreendimento(s) não encontrado(s): ${idsInexistentes.join(", ")}` };
      }
      for (const id of ids) {
        await vincularUsuarioEmpreendimento(req.params.id, id, (papel as "edicao" | "leitura") ?? "edicao");
      }
      reply.code(201);
      return listarEmpreendimentosDoUsuario(req.params.id);
    },
  );

  app.delete<{ Params: { id: string; empreendimentoId: string } }>(
    "/api/usuarios/:id/empreendimentos/:empreendimentoId",
    async (req, reply) => {
      if (req.usuario!.papel !== "admin") {
        reply.code(403);
        return { erro: "Apenas administradores podem gerenciar vínculos de acesso" };
      }
      await desvincularUsuarioEmpreendimento(req.params.id, req.params.empreendimentoId);
      reply.code(204);
      return null;
    },
  );

  app.get("/api/empreendimentos", async (req) => {
    const permitidos = await empreendimentosPermitidos(req.usuario!);
    const empreendimentos = await prisma.empreendimento.findMany({
      where: permitidos === "todos" ? undefined : { id: { in: permitidos } },
      include: { cenarios: { select: { id: true, nome: true, tipo: true, horizonteProjecaoMeses: true } } },
      orderBy: { nome: "asc" },
    });
    const niveis = req.usuario!.papel === "admin" ? null : new Map((await prisma.empreendimentoUsuario.findMany({ where: { usuarioId: req.usuario!.id } })).map((v) => [v.empreendimentoId, v.papel]));
    return empreendimentos.map((e) => ({ ...e, nivelAcesso: niveis ? niveis.get(e.id) ?? "leitura" : "admin" }));
  });

  app.post<{ Body: { nome?: string; incorporador?: string; endereco?: string } }>("/api/empreendimentos", async (req, reply) => {
    // Stakeholder (Fase 2.5, docs/DECISOES.md): visualizacao apenas -- nunca
    // cria nada, nem o proprio empreendimento que o vincularia
    // automaticamente a si mesmo com edicao (fluxo abaixo, pensado para
    // "usuario" antes desta fatia).
    if (req.usuario!.papel === "stakeholder") {
      reply.code(403);
      return { erro: "Stakeholder não pode criar empreendimentos" };
    }
    const { nome, incorporador, endereco } = req.body ?? {};
    if (!nome || !nome.trim()) {
      reply.code(400);
      return { erro: "Nome do empreendimento é obrigatório" };
    }
    const empreendimento = await criarEmpreendimento({ nome: nome.trim(), incorporador, endereco });
    // quem cria (se nao for admin) precisa de um vinculo, senao criava algo que nao consegue mais ver.
    if (req.usuario!.papel !== "admin") {
      await vincularUsuarioEmpreendimento(req.usuario!.id, empreendimento.id);
    }
    reply.code(201);
    return empreendimento;
  });

  app.get<{ Params: { id: string } }>("/api/empreendimentos/:id", async (req, reply) => {
    if (!(await garantirAcesso(req, reply, req.params.id))) return;
    const empreendimento = await prisma.empreendimento.findUnique({
      where: { id: req.params.id },
      include: {
        tipologias: {
          include: {
            _count: { select: { unidades: true } },
            condicoesPagamento: { include: { modalidades: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "asc" },
        },
        cenarios: { include: { derivadoDe: { select: { nome: true } } }, orderBy: { createdAt: "asc" } },
        categoriasCusto: { orderBy: { nome: "asc" } },
        terrenos: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    return {
      id: empreendimento.id,
      nome: empreendimento.nome,
      nivelAcesso: await nivelAcessoEmpreendimento(req.usuario!, empreendimento.id),
      incorporador: empreendimento.incorporador,
      endereco: empreendimento.endereco,
      terrenos: empreendimento.terrenos.map((t) => ({
        id: t.id,
        numeroMatricula: t.numeroMatricula,
        areaValor: t.areaValor,
        areaUnidade: t.areaUnidade,
        areaStatusValidacao: t.areaStatusValidacao,
        areaObservacao: t.areaObservacao,
        formaAquisicao: t.formaAquisicao,
      })),
      cenarios: empreendimento.cenarios.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        horizonteProjecaoMeses: c.horizonteProjecaoMeses,
        derivadoDeNome: c.derivadoDe?.nome ?? null,
      })),
      categoriasCusto: empreendimento.categoriasCusto.map((cc) => ({ id: cc.id, nome: cc.nome, tipoIncidencia: cc.tipoIncidencia, papel: cc.papel })),
      tipologias: empreendimento.tipologias.map((t) => ({
        id: t.id,
        nome: t.nome,
        areaPrivativaPadrao: t.areaPrivativaPadrao,
        precoUnitarioPadrao: t.precoUnitarioPadrao,
        quantidadeUnidades: t._count.unidades,
        condicoesPagamento: t.condicoesPagamento.map((cp) => ({
          id: cp.id,
          nome: cp.nome,
          modalidades: cp.modalidades.map((m) => ({
            nome: m.nome,
            percentual: m.percentual,
            tipoDistribuicao: m.tipoDistribuicao,
            periodicidadeMeses: m.periodicidadeMeses,
            mesFixo: m.mesFixo,
            mesFinal: m.mesFinal,
            repeticoesSobreTotal: m.repeticoesSobreTotal,
            geraEventoParcial: m.geraEventoParcial,
          })),
        })),
      })),
    };
  });

  // Multiplas matriculas/areas por empreendimento (achado F26,
  // docs/DECISOES.md): ate essa fatia era um upsert 1:1 -- agora cada
  // chamada cria uma matricula nova; editar/excluir uma matricula
  // especifica usa o proprio id dela.
  app.post<{
    Params: { id: string };
    Body: {
      numeroMatricula?: string;
      areaValor?: string;
      areaUnidade?: string;
      areaStatusValidacao?: "pendente" | "validado" | "conflitante";
      areaObservacao?: string;
      formaAquisicao?: "compra" | "permuta" | "misto";
    };
  }>("/api/empreendimentos/:id/terrenos", async (req, reply) => {
    if (!(await garantirAcesso(req, reply, req.params.id))) return;
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    const { numeroMatricula, areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao } = req.body ?? {};
    const terreno = await criarTerreno({ empreendimentoId: req.params.id, numeroMatricula, areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao });
    reply.code(201);
    return terreno;
  });

  app.patch<{
    Params: { id: string };
    Body: {
      numeroMatricula?: string | null;
      areaValor?: string | null;
      areaUnidade?: string;
      areaStatusValidacao?: "pendente" | "validado" | "conflitante";
      areaObservacao?: string | null;
      formaAquisicao?: "compra" | "permuta" | "misto" | null;
    };
  }>("/api/terrenos/:id", async (req, reply) => {
    const terreno = await prisma.terreno.findUnique({ where: { id: req.params.id } });
    if (!terreno) {
      reply.code(404);
      return { erro: "Matrícula não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, terreno.empreendimentoId))) return;
    const { numeroMatricula, areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao } = req.body ?? {};
    const atualizado = await atualizarTerreno(req.params.id, { numeroMatricula, areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao });
    return atualizado;
  });

  app.delete<{ Params: { id: string } }>("/api/terrenos/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const terreno = await prisma.terreno.findUnique({ where: { id: req.params.id } });
    if (!terreno) {
      reply.code(404);
      return { erro: "Matrícula não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, terreno.empreendimentoId))) return;
    await excluirTerreno(req.params.id);
    reply.code(204);
    return null;
  });

  app.patch<{ Params: { id: string }; Body: { nome?: string; incorporador?: string | null; endereco?: string | null } }>(
    "/api/empreendimentos/:id",
    async (req, reply) => {
      const { nome, incorporador, endereco } = req.body ?? {};
      if (nome !== undefined && !nome.trim()) {
        reply.code(400);
        return { erro: "Nome do empreendimento não pode ficar vazio" };
      }
      const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
      if (!empreendimento) {
        reply.code(404);
        return { erro: "Empreendimento não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
      return atualizarEmpreendimento(req.params.id, { nome: nome?.trim(), incorporador, endereco });
    },
  );

  app.get<{ Params: { id: string } }>("/api/empreendimentos/:id/impacto-exclusao", async (req, reply) => {
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
    const cenarioIds = (await prisma.cenario.findMany({ where: { empreendimentoId: empreendimento.id }, select: { id: true } })).map((c) => c.id);
    return { cenarios: cenarioIds.length, ...(await impactoExclusao(cenarioIds)) };
  });

  app.delete<{ Params: { id: string } }>("/api/empreendimentos/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    await excluirEmpreendimento(req.params.id);
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string }; Body: { nome?: string; areaPrivativaPadrao?: string; precoUnitarioPadrao?: string } }>(
    "/api/empreendimentos/:id/tipologias",
    async (req, reply) => {
      const { nome, areaPrivativaPadrao, precoUnitarioPadrao } = req.body ?? {};
      if (!nome || !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da tipologia é obrigatório" };
      }
      const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
      if (!empreendimento) {
        reply.code(404);
        return { erro: "Empreendimento não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
      const tipologia = await criarTipologia({
        empreendimentoId: req.params.id,
        nome: nome.trim(),
        areaPrivativaPadrao,
        precoUnitarioPadrao,
      });
      reply.code(201);
      return tipologia;
    },
  );

  app.post<{ Params: { id: string }; Body: { quantidade?: number; precoVenda?: string; areaPrivativa?: string; prefixoNumero?: string } }>(
    "/api/tipologias/:id/unidades",
    async (req, reply) => {
      const { quantidade, precoVenda, areaPrivativa, prefixoNumero } = req.body ?? {};
      if (!quantidade || quantidade < 1 || !Number.isInteger(quantidade)) {
        reply.code(400);
        return { erro: "Quantidade deve ser um número inteiro maior que zero" };
      }
      if (!precoVenda || !precoVenda.trim()) {
        reply.code(400);
        return { erro: "Preço de venda é obrigatório" };
      }
      if (!prefixoNumero || !prefixoNumero.trim()) {
        reply.code(400);
        return { erro: "Prefixo do número da unidade é obrigatório" };
      }
      const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
      if (!tipologia) {
        reply.code(404);
        return { erro: "Tipologia não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, tipologia.empreendimentoId))) return;
      const unidades = await criarUnidadesEmLote({
        empreendimentoId: tipologia.empreendimentoId,
        tipologiaId: tipologia.id,
        quantidade,
        precoVenda: precoVenda.trim(),
        areaPrivativa,
        prefixoNumero: prefixoNumero.trim(),
      });
      reply.code(201);
      return unidades;
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      prefixoNumero?: string;
      areaPrivativa?: string;
      andares?: { andar: number; quantidade: number }[];
      precificacao?: { precoBase?: string; andarBase?: number; incremento?: string; tipoIncremento?: string };
    };
  }>("/api/tipologias/:id/unidades-por-andar", async (req, reply) => {
    const { prefixoNumero, areaPrivativa, andares, precificacao } = req.body ?? {};
    if (!prefixoNumero || !prefixoNumero.trim()) {
      reply.code(400);
      return { erro: "Prefixo do número da unidade é obrigatório" };
    }
    if (!andares || andares.length === 0) {
      reply.code(400);
      return { erro: "É preciso ao menos um andar" };
    }
    for (const a of andares) {
      if (!Number.isInteger(a.andar) || !Number.isInteger(a.quantidade) || a.quantidade < 1) {
        reply.code(400);
        return { erro: "Cada andar precisa de um número de andar e uma quantidade inteira maior que zero" };
      }
    }
    if (!precificacao?.precoBase || precificacao.andarBase === undefined || !precificacao.incremento) {
      reply.code(400);
      return { erro: "Preço base, andar de referência e incremento são obrigatórios" };
    }
    if (precificacao.tipoIncremento !== "fixo" && precificacao.tipoIncremento !== "percentual") {
      reply.code(400);
      return { erro: "Tipo de incremento deve ser 'fixo' ou 'percentual'" };
    }
    const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
    if (!tipologia) {
      reply.code(404);
      return { erro: "Tipologia não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, tipologia.empreendimentoId))) return;
    const unidades = await criarUnidadesPorAndar({
      empreendimentoId: tipologia.empreendimentoId,
      tipologiaId: tipologia.id,
      prefixoNumero: prefixoNumero.trim(),
      areaPrivativa,
      andares,
      precificacao: {
        precoBase: precificacao.precoBase,
        andarBase: precificacao.andarBase,
        incremento: precificacao.incremento,
        tipoIncremento: precificacao.tipoIncremento,
      },
    });
    reply.code(201);
    return unidades;
  });

  app.get<{ Params: { id: string } }>("/api/tipologias/:id/unidades", async (req, reply) => {
    const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
    if (!tipologia) {
      reply.code(404);
      return { erro: "Tipologia não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, tipologia.empreendimentoId))) return;
    const unidades = await prisma.unidade.findMany({
      where: { tipologiaId: req.params.id },
      include: {
        permuta: { include: { contrapartes: { orderBy: { createdAt: "asc" } } } },
        vendas: { orderBy: { createdAt: "desc" }, take: 1, include: { distrato: true, renegociacoes: { orderBy: { createdAt: "asc" } } } },
      },
      orderBy: [{ andar: "asc" }, { numero: "asc" }],
    });
    return unidades.map((u) => {
      const ultimaVenda = u.vendas[0];
      return {
        id: u.id,
        numero: u.numero,
        andar: u.andar,
        areaPrivativa: u.areaPrivativa,
        precoVenda: u.precoVenda,
        status: u.status,
        permuta: u.permuta
          ? {
              id: u.permuta.id,
              nomeContraparte: u.permuta.nomeContraparte,
              documento: u.permuta.documento,
              valorAtribuido: u.permuta.valorAtribuido,
              contrapartes: u.permuta.contrapartes.map((c) => ({
                id: c.id,
                nome: c.nome,
                documento: c.documento,
                percentualSplit: c.percentualSplit,
                valorAtribuido: c.valorAtribuido,
              })),
            }
          : null,
        venda: ultimaVenda
          ? {
              id: ultimaVenda.id,
              status: ultimaVenda.status,
              mesOrigem: ultimaVenda.mesOrigem,
              valorVenda: ultimaVenda.valorVenda,
              distrato: ultimaVenda.distrato
                ? {
                    valorRecebidoAteDistrato: ultimaVenda.distrato.valorRecebidoAteDistrato,
                    percentualRetencao: ultimaVenda.distrato.percentualRetencao,
                    valorRetido: ultimaVenda.distrato.valorRetido,
                    valorReembolsar: ultimaVenda.distrato.valorReembolsar,
                  }
                : null,
              renegociacoes: ultimaVenda.renegociacoes.map((r) => ({
                id: r.id,
                valorVendaAnterior: r.valorVendaAnterior,
                novoValorVenda: r.novoValorVenda,
                motivo: r.motivo,
              })),
            }
          : null,
      };
    });
  });

  app.post<{
    Params: { id: string };
    Body: { nomeContraparte?: string; documento?: string; valorAtribuido?: string; dataAcordo?: string; observacao?: string };
  }>("/api/unidades/:id/permuta", async (req, reply) => {
    const { nomeContraparte, documento, valorAtribuido, dataAcordo, observacao } = req.body ?? {};
    if (!nomeContraparte || !nomeContraparte.trim()) {
      reply.code(400);
      return { erro: "Nome da contraparte é obrigatório" };
    }
    const unidade = await prisma.unidade.findUnique({ where: { id: req.params.id } });
    if (!unidade) {
      reply.code(404);
      return { erro: "Unidade não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, unidade.empreendimentoId))) return;
    const valorLido = lerValorAtribuido(valorAtribuido);
    if (valorLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro };
    }
    const resultado = await registrarPermuta({
      unidadeId: req.params.id,
      nomeContraparte: nomeContraparte.trim(),
      documento,
      valorAtribuido: valorLido.valor ?? undefined,
      dataAcordo: dataAcordo ? new Date(dataAcordo) : undefined,
      observacao,
    });
    if ("erro" in resultado) {
      reply.code(resultado.erro === "Unidade não encontrada" ? 404 : 400);
      return { erro: resultado.erro };
    }
    reply.code(201);
    return resultado.permuta;
  });

  app.patch<{
    Params: { id: string };
    Body: { nomeContraparte?: string; documento?: string | null; valorAtribuido?: string | null; dataAcordo?: string | null; observacao?: string | null };
  }>("/api/unidades/:id/permuta", async (req, reply) => {
    const { nomeContraparte, documento, valorAtribuido, dataAcordo, observacao } = req.body ?? {};
    if (nomeContraparte !== undefined && !nomeContraparte.trim()) {
      reply.code(400);
      return { erro: "Nome da contraparte não pode ficar vazio" };
    }
    const unidade = await prisma.unidade.findUnique({ where: { id: req.params.id } });
    if (!unidade) {
      reply.code(404);
      return { erro: "Unidade não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, unidade.empreendimentoId))) return;
    const valorLido = lerValorAtribuido(valorAtribuido);
    if (valorLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro };
    }
    const resultado = await atualizarPermuta(req.params.id, {
      nomeContraparte: nomeContraparte?.trim(),
      documento,
      valorAtribuido: valorLido.valor,
      dataAcordo: dataAcordo === undefined ? undefined : dataAcordo === null ? null : new Date(dataAcordo),
      observacao,
    });
    if ("erro" in resultado) {
      reply.code(404);
      return { erro: resultado.erro };
    }
    return resultado.permuta;
  });

  app.delete<{ Params: { id: string } }>("/api/unidades/:id/permuta", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const erro = await desfazerPermuta(req.params.id);
    if (erro) {
      reply.code(404);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  // Contraparte adicional de uma permuta (achado F24, docs/DECISOES.md —
  // "permuta parcial"): cadastro nominal de quem mais divide a mesma
  // permuta com a contraparte principal. Nunca lido pelo motor, mesmo
  // espirito de DestinatarioComissao (achado F13).
  app.post<{
    Params: { permutaId: string };
    Body: { nome?: string; documento?: string; percentualSplit?: string; valorAtribuido?: string };
  }>("/api/permutas/:permutaId/contrapartes", async (req, reply) => {
    const { nome, documento, percentualSplit, valorAtribuido } = req.body ?? {};
    if (!nome || !nome.trim()) {
      reply.code(400);
      return { erro: "Nome da contraparte é obrigatório" };
    }
    if (!percentualSplit || !percentualSplit.trim()) {
      reply.code(400);
      return { erro: "Percentual de split é obrigatório" };
    }
    const permuta = await prisma.permuta.findUnique({ where: { id: req.params.permutaId } });
    if (!permuta) {
      reply.code(404);
      return { erro: "Permuta não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, permuta.empreendimentoId))) return;
    const splitLido = lerDecimal(percentualSplit, "Percentual de split", "0.5", 1);
    if (splitLido.erro) {
      reply.code(400);
      return { erro: splitLido.erro };
    }
    const valorLido = lerValorAtribuido(valorAtribuido);
    if (valorLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro };
    }
    const resultado = await criarContrapartePermuta(permuta.id, {
      nome: nome.trim(),
      documento: documento?.trim() || undefined,
      percentualSplit: splitLido.valor!,
      valorAtribuido: valorLido.valor ?? undefined,
    });
    if ("erro" in resultado) {
      reply.code(400);
      return resultado;
    }
    reply.code(201);
    return resultado.contraparte;
  });

  app.patch<{
    Params: { id: string };
    Body: { nome?: string; documento?: string | null; percentualSplit?: string; valorAtribuido?: string | null };
  }>("/api/contrapartes-permuta/:id", async (req, reply) => {
    const contraparte = await prisma.contrapartePermuta.findUnique({ where: { id: req.params.id }, include: { permuta: true } });
    if (!contraparte) {
      reply.code(404);
      return { erro: "Contraparte de permuta não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, contraparte.permuta.empreendimentoId))) return;
    const { nome, documento, percentualSplit, valorAtribuido } = req.body ?? {};
    const splitLido = lerDecimal(percentualSplit ?? undefined, "Percentual de split", "0.5", 1);
    if (splitLido.erro) {
      reply.code(400);
      return { erro: splitLido.erro };
    }
    const valorLido = lerValorAtribuido(valorAtribuido);
    if (valorLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro };
    }
    const resultado = await atualizarContrapartePermuta(req.params.id, {
      nome: nome?.trim() || undefined,
      documento,
      percentualSplit: splitLido.valor,
      valorAtribuido: valorLido.valor,
    });
    if ("erro" in resultado) {
      reply.code(400);
      return resultado;
    }
    return resultado.contraparte;
  });

  app.delete<{ Params: { id: string } }>("/api/contrapartes-permuta/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const contraparte = await prisma.contrapartePermuta.findUnique({ where: { id: req.params.id }, include: { permuta: true } });
    if (!contraparte) {
      reply.code(404);
      return { erro: "Contraparte de permuta não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, contraparte.permuta.empreendimentoId))) return;
    await excluirContrapartePermuta(req.params.id);
    reply.code(204);
    return null;
  });

  // Registro individual de venda (Fase 2, tela de Vendas) -- diferente de
  // POST /api/cenarios/:id/gerar-vendas (Fase 1, aloca unidades em lote a
  // partir de premissa de velocidade), aqui o usuario escolhe a unidade e
  // o comprador diretamente. Depois de criar a Venda, roda o motor para
  // este cenario (mesma funcao ja usada por GET /fluxo-caixa) para que os
  // recebimentos da venda ja existam quando a tela for consultar -- nao e
  // uma regra nova, e o mesmo recalculo que qualquer outra mudanca dispara.
  app.post<{
    Params: { cenarioId: string };
    Body: { unidadeId?: string; condicaoPagamentoId?: string; mesOrigem?: number; valorVenda?: string; comprador?: string; documentoComprador?: string };
  }>("/api/cenarios/:cenarioId/vendas", async (req, reply) => {
    const { unidadeId, condicaoPagamentoId, mesOrigem, valorVenda, comprador, documentoComprador } = req.body ?? {};
    if (!unidadeId) {
      reply.code(400);
      return { erro: "Unidade é obrigatória" };
    }
    if (!condicaoPagamentoId) {
      reply.code(400);
      return { erro: "Condição de pagamento é obrigatória" };
    }
    if (!mesOrigem) {
      reply.code(400);
      return { erro: "Mês da venda é obrigatório" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.cenarioId } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const resultado = await registrarVenda({
      cenarioId: cenario.id,
      unidadeId,
      condicaoPagamentoId,
      mesOrigem,
      valorVenda,
      comprador,
      documentoComprador,
    });
    if ("erro" in resultado) {
      reply.code(resultado.erro === "Unidade não encontrada" || resultado.erro === "Condição de pagamento não encontrada" ? 404 : 400);
      return { erro: resultado.erro };
    }
    await rodarMotorParaCenario(cenario.id);
    reply.code(201);
    return resultado.venda;
  });

  app.get<{ Params: { cenarioId: string } }>("/api/cenarios/:cenarioId/vendas", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.cenarioId } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const vendas = await listarVendasDoCenario(cenario.id);
    return vendas.map((v) => ({
      id: v.id,
      status: v.status,
      mesOrigem: v.mesOrigem,
      valorVenda: v.valorVenda,
      comprador: v.comprador,
      documentoComprador: v.documentoComprador,
      unidade: { id: v.unidade.id, numero: v.unidade.numero, andar: v.unidade.andar },
      tipologia: { id: v.unidade.tipologia.id, nome: v.unidade.tipologia.nome },
      condicaoPagamento: { id: v.condicaoPagamento.id, nome: v.condicaoPagamento.nome },
      distrato: v.distrato
        ? {
            valorRecebidoAteDistrato: v.distrato.valorRecebidoAteDistrato,
            percentualRetencao: v.distrato.percentualRetencao,
            valorRetido: v.distrato.valorRetido,
            valorReembolsar: v.distrato.valorReembolsar,
          }
        : null,
      renegociacoes: v.renegociacoes.map((r) => ({ id: r.id, valorVendaAnterior: r.valorVendaAnterior, novoValorVenda: r.novoValorVenda, motivo: r.motivo })),
    }));
  });

  app.patch<{
    Params: { id: string };
    Body: { comprador?: string | null; documentoComprador?: string | null; valorVenda?: string; mesOrigem?: number };
  }>("/api/vendas/:id", async (req, reply) => {
    const venda = await prisma.venda.findUnique({ where: { id: req.params.id } });
    if (!venda) {
      reply.code(404);
      return { erro: "Venda não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
    if (req.body?.mesOrigem !== undefined && req.body.mesOrigem !== venda.mesOrigem) {
      const novoMes = req.body.mesOrigem;
      const parcelasPerdidas = await parcelasPagasQuePerderiamBase(venda.cenarioId, (e) => ({
        ...e,
        vendas: e.vendas.map((v) => (v.id === venda.id ? { ...v, mesOrigem: novoMes } : v)),
      }));
      if (parcelasPerdidas.length > 0) {
        reply.code(400);
        return { erro: mensagemParcelasPagasSemBase("Mudar o mês desta venda", parcelasPerdidas) };
      }
    }
    const resultado = await atualizarVenda(req.params.id, req.body ?? {});
    if ("erro" in resultado) {
      reply.code(400);
      return { erro: resultado.erro };
    }
    if (req.body?.mesOrigem !== undefined || req.body?.valorVenda !== undefined) {
      await rodarMotorParaCenario(venda.cenarioId);
    }
    return resultado.venda;
  });

  // Estoque agregado por status de Unidade (Fase 2, tela de Vendas) -- por
  // empreendimento, nao por cenario: Unidade.status e compartilhado entre
  // todos os cenarios do mesmo empreendimento (ver excluirCenario).
  app.get<{ Params: { id: string } }>("/api/empreendimentos/:id/estoque", async (req, reply) => {
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
    return resumoEstoque(empreendimento.id);
  });

  // Distrato (achado F7, docs/DECISOES.md): cancela uma venda. O motor ja
  // filtra vendas por status="ativa" (src/db/servicoMotor.ts), entao marcar
  // a venda como "distratada" e suficiente -- nenhuma rota de fluxo de
  // caixa precisou mudar.
  app.post<{ Params: { id: string }; Body: { percentualRetencao?: string; motivo?: string; mesDistrato?: number } }>(
    "/api/vendas/:id/distrato",
    async (req, reply) => {
      const { percentualRetencao, motivo, mesDistrato } = req.body ?? {};
      const venda = await prisma.venda.findUnique({ where: { id: req.params.id }, include: { cenario: { select: { horizonteProjecaoMeses: true } } } });
      if (!venda) {
        reply.code(404);
        return { erro: "Venda não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
      if (mesDistrato === undefined || !Number.isInteger(mesDistrato) || mesDistrato < 1 || mesDistrato > venda.cenario.horizonteProjecaoMeses) {
        reply.code(400);
        return { erro: `Mês do distrato deve ser um inteiro entre 1 e ${venda.cenario.horizonteProjecaoMeses} (horizonte do cenário)` };
      }
      const taxaLida = percentualRetencao === undefined ? { valor: undefined } : lerDecimal(percentualRetencao, "Percentual de retenção", "0.1", 1);
      if (taxaLida.erro) {
        reply.code(400);
        return { erro: taxaLida.erro };
      }
      const resultado = await registrarDistrato({ vendaId: req.params.id, percentualRetencao: taxaLida.valor, motivo, mesDistrato });
      if ("erro" in resultado) {
        reply.code(400);
        return { erro: resultado.erro };
      }
      reply.code(201);
      return resultado.distrato;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/vendas/:id/distrato", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const venda = await prisma.venda.findUnique({ where: { id: req.params.id } });
    if (!venda) {
      reply.code(404);
      return { erro: "Venda não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
    const erro = await desfazerDistrato(req.params.id);
    if (erro) {
      reply.code(400);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  // Distrato parcial (achado F17, docs/DECISOES.md): reduz o valor de uma
  // venda ativa em vez de cancela-la -- a unidade continua vendida. Ao
  // contrario de /distrato, nao tem DELETE: uma renegociacao e um registro
  // permanente, nao um estado que se desfaz (ver docstring de
  // registrarRenegociacaoVenda em src/db/cadastro.ts).
  app.post<{ Params: { id: string }; Body: { novoValorVenda?: string; motivo?: string } }>(
    "/api/vendas/:id/renegociacoes",
    async (req, reply) => {
      const { novoValorVenda, motivo } = req.body ?? {};
      if (!novoValorVenda || !novoValorVenda.trim() || Number.isNaN(Number(novoValorVenda))) {
        reply.code(400);
        return { erro: "novoValorVenda é obrigatório e deve ser numérico" };
      }
      const venda = await prisma.venda.findUnique({ where: { id: req.params.id } });
      if (!venda) {
        reply.code(404);
        return { erro: "Venda não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
      const resultado = await registrarRenegociacaoVenda({ vendaId: req.params.id, novoValorVenda: novoValorVenda.trim(), motivo });
      if ("erro" in resultado) {
        reply.code(400);
        return { erro: resultado.erro };
      }
      reply.code(201);
      return resultado.renegociacao;
    },
  );

  app.patch<{ Params: { id: string }; Body: { nome?: string; areaPrivativaPadrao?: string | null; precoUnitarioPadrao?: string | null } }>(
    "/api/tipologias/:id",
    async (req, reply) => {
      const { nome, areaPrivativaPadrao, precoUnitarioPadrao } = req.body ?? {};
      if (nome !== undefined && !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da tipologia não pode ficar vazio" };
      }
      const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
      if (!tipologia) {
        reply.code(404);
        return { erro: "Tipologia não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, tipologia.empreendimentoId))) return;
      return atualizarTipologia(req.params.id, { nome: nome?.trim(), areaPrivativaPadrao, precoUnitarioPadrao });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/tipologias/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
    if (!tipologia) {
      reply.code(404);
      return { erro: "Tipologia não encontrada" };
    }
    const erro = await excluirTipologia(req.params.id);
    if (erro) {
      reply.code(400);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string }; Body: { nome?: string; tipoIncidencia?: string; papel?: string } }>(
    "/api/empreendimentos/:id/categorias-custo",
    async (req, reply) => {
      const { nome, tipoIncidencia, papel } = req.body ?? {};
      const papeisValidos = ["custo", "comissao_corretagem", "tributo"];
      if (papel !== undefined && !papeisValidos.includes(papel)) {
        reply.code(400);
        return { erro: `Papel da categoria deve ser um de: ${papeisValidos.join(", ")}` };
      }
      const tiposValidos = ["fixo", "pct_vgv_vendido_no_mes", "pct_recebido_mes_anterior", "pct_execucao", "pct_recebido_no_mes", "faixas_vgv_acumulado"];
      if (!nome || !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da categoria de custo é obrigatório" };
      }
      if (!tipoIncidencia || !tiposValidos.includes(tipoIncidencia)) {
        reply.code(400);
        return { erro: `Tipo de incidência deve ser um de: ${tiposValidos.join(", ")}` };
      }
      const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
      if (!empreendimento) {
        reply.code(404);
        return { erro: "Empreendimento não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
      const categoria = await criarCategoriaCusto({
        empreendimentoId: req.params.id,
        nome: nome.trim(),
        tipoIncidencia: tipoIncidencia as TipoIncidenciaCusto,
        papel: (papel as "custo" | "comissao_corretagem" | "tributo" | undefined) ?? "custo",
      });
      reply.code(201);
      return categoria;
    },
  );

  app.patch<{ Params: { id: string }; Body: { nome?: string; tipoIncidencia?: string; papel?: string } }>(
    "/api/categorias-custo/:id",
    async (req, reply) => {
      const { nome, tipoIncidencia, papel } = req.body ?? {};
      const papeisValidos = ["custo", "comissao_corretagem", "tributo"];
      if (papel !== undefined && !papeisValidos.includes(papel)) {
        reply.code(400);
        return { erro: `Papel da categoria deve ser um de: ${papeisValidos.join(", ")}` };
      }
      const tiposValidos = ["fixo", "pct_vgv_vendido_no_mes", "pct_recebido_mes_anterior", "pct_execucao", "pct_recebido_no_mes", "faixas_vgv_acumulado"];
      if (nome !== undefined && !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da categoria de custo não pode ficar vazio" };
      }
      if (tipoIncidencia !== undefined && !tiposValidos.includes(tipoIncidencia)) {
        reply.code(400);
        return { erro: `Tipo de incidência deve ser um de: ${tiposValidos.join(", ")}` };
      }
      const categoria = await prisma.categoriaCusto.findUnique({ where: { id: req.params.id } });
      if (!categoria) {
        reply.code(404);
        return { erro: "Categoria de custo não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, categoria.empreendimentoId))) return;
      const resultado = await atualizarCategoriaCusto(req.params.id, {
        nome: nome?.trim(),
        tipoIncidencia: tipoIncidencia as TipoIncidenciaCusto | undefined,
        papel: papel as "custo" | "comissao_corretagem" | "tributo" | undefined,
      });
      if ("erro" in resultado) {
        reply.code(400);
        return { erro: resultado.erro };
      }
      return resultado.categoria;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/categorias-custo/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const categoria = await prisma.categoriaCusto.findUnique({ where: { id: req.params.id } });
    if (!categoria) {
      reply.code(404);
      return { erro: "Categoria de custo não encontrada" };
    }
    const erro = await excluirCategoriaCusto(req.params.id);
    if (erro) {
      reply.code(400);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string }; Body: { tipo?: string; nome?: string; horizonteProjecaoMeses?: number } }>(
    "/api/empreendimentos/:id/cenarios",
    async (req, reply) => {
      const { tipo, nome, horizonteProjecaoMeses } = req.body ?? {};
      const tiposValidos = ["base", "otimista", "pessimista", "personalizado"];
      if (!nome || !nome.trim()) {
        reply.code(400);
        return { erro: "Nome do cenário é obrigatório" };
      }
      if (!tipo || !tiposValidos.includes(tipo)) {
        reply.code(400);
        return { erro: `Tipo do cenário deve ser um de: ${tiposValidos.join(", ")}` };
      }
      if (!horizonteProjecaoMeses || horizonteProjecaoMeses < 1 || !Number.isInteger(horizonteProjecaoMeses)) {
        reply.code(400);
        return { erro: "Horizonte de projeção deve ser um número inteiro de meses maior que zero" };
      }
      const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
      if (!empreendimento) {
        reply.code(404);
        return { erro: "Empreendimento não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
      const cenario = await criarCenario({
        empreendimentoId: req.params.id,
        tipo: tipo as "base" | "otimista" | "pessimista" | "personalizado",
        nome: nome.trim(),
        horizonteProjecaoMeses,
      });
      reply.code(201);
      return cenario;
    },
  );

  app.post<{ Params: { id: string }; Body: { nome?: string; modalidades?: ModalidadeInput[] } }>(
    "/api/tipologias/:id/condicoes-pagamento",
    async (req, reply) => {
      const { nome, modalidades } = req.body ?? {};
      if (!nome || !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da condição de pagamento é obrigatório" };
      }
      if (!modalidades || modalidades.length === 0) {
        reply.code(400);
        return { erro: "É preciso ao menos uma modalidade de pagamento" };
      }
      const tipologia = await prisma.tipologia.findUnique({ where: { id: req.params.id } });
      if (!tipologia) {
        reply.code(404);
        return { erro: "Tipologia não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, tipologia.empreendimentoId))) return;
      const modalidadesLidas = lerModalidades(modalidades);
      if (modalidadesLidas.erro) {
        reply.code(400);
        return { erro: modalidadesLidas.erro };
      }
      try {
        const condicao = await criarCondicaoPagamento({
          empreendimentoId: tipologia.empreendimentoId,
          tipologiaId: tipologia.id,
          nome: nome.trim(),
          modalidades: modalidadesLidas.modalidades!,
        });
        reply.code(201);
        return condicao;
      } catch (e: any) {
        reply.code(400);
        return { erro: String(e.message ?? e) };
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { nome?: string; modalidades?: ModalidadeInput[] } }>(
    "/api/condicoes-pagamento/:id",
    async (req, reply) => {
      const { nome, modalidades } = req.body ?? {};
      if (nome !== undefined && !nome.trim()) {
        reply.code(400);
        return { erro: "Nome da condição de pagamento não pode ficar vazio" };
      }
      if (modalidades !== undefined && modalidades.length === 0) {
        reply.code(400);
        return { erro: "É preciso ao menos uma modalidade de pagamento" };
      }
      const condicao = await prisma.condicaoPagamento.findUnique({ where: { id: req.params.id } });
      if (!condicao) {
        reply.code(404);
        return { erro: "Condição de pagamento não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, condicao.empreendimentoId))) return;
      const modalidadesLidas = modalidades === undefined ? undefined : lerModalidades(modalidades);
      if (modalidadesLidas?.erro) {
        reply.code(400);
        return { erro: modalidadesLidas.erro };
      }
      const resultado = await atualizarCondicaoPagamento(req.params.id, { nome: nome?.trim(), modalidades: modalidadesLidas?.modalidades });
      if ("erro" in resultado) {
        reply.code(400);
        return { erro: resultado.erro };
      }
      return resultado.condicao;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/condicoes-pagamento/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const condicao = await prisma.condicaoPagamento.findUnique({ where: { id: req.params.id } });
    if (!condicao) {
      reply.code(404);
      return { erro: "Condição de pagamento não encontrada" };
    }
    const erro = await excluirCondicaoPagamento(req.params.id);
    if (erro) {
      reply.code(400);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({
      where: { id: req.params.id },
      include: {
        empreendimento: {
          select: {
            id: true,
            nome: true,
            tipologias: { select: { id: true, nome: true } },
            categoriasCusto: { select: { id: true, nome: true, tipoIncidencia: true, papel: true } },
          },
        },
        premissasVelocidade: { include: { tipologia: { select: { nome: true } } }, orderBy: { mes: "asc" } },
        custos: {
          include: {
            categoria: true,
            tipologia: { select: { nome: true } },
            destinatarios: { orderBy: { createdAt: "asc" } },
            faixas: { orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "asc" },
        },
        cronograma: { orderBy: { mes: "asc" } },
        indicesCorrecao: { orderBy: { mes: "asc" } },
        financiamento: true,
        _count: { select: { vendas: true } },
      },
    });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimento.id))) return;
    return {
      id: cenario.id,
      nome: cenario.nome,
      tipo: cenario.tipo,
      horizonteProjecaoMeses: cenario.horizonteProjecaoMeses,
      limiteNecessidadeMaximaCapital: cenario.limiteNecessidadeMaximaCapital,
      taxaDescontoMensal: cenario.taxaDescontoMensal,
      dataMesUm: cenario.dataMesUm ? cenario.dataMesUm.toISOString().slice(0, 10) : null,
      empreendimento: { id: cenario.empreendimento.id, nome: cenario.empreendimento.nome },
      tipologiasDisponiveis: cenario.empreendimento.tipologias,
      categoriasCustoDisponiveis: cenario.empreendimento.categoriasCusto,
      premissasVelocidade: cenario.premissasVelocidade.map((p) => ({
        id: p.id,
        tipologiaId: p.tipologiaId,
        tipologiaNome: p.tipologia.nome,
        mes: p.mes,
        unidadesPrevistas: p.unidadesPrevistas,
      })),
      avisos: await calcularAvisosPremissas(cenario.id),
      custos: cenario.custos.map((c) => ({
        id: c.id,
        categoriaNome: c.categoria.nome,
        tipoIncidencia: c.categoria.tipoIncidencia,
        tipologiaId: c.tipologiaId,
        tipologiaNome: c.tipologia?.nome ?? null,
        valorPrevisto: c.valorPrevisto,
        percentual: c.percentual,
        competenciaMes: c.competenciaMes,
        recorrencia: c.recorrencia,
        valorRealizado: c.valorRealizado,
        status: c.status,
        grupoIndiceCorrecao: c.grupoIndiceCorrecao,
        destinatariosComissao: c.destinatarios.map((d) => ({ id: d.id, nome: d.nome, percentualSplit: d.percentualSplit })),
        faixasComissao: c.faixas.map((f) => ({ id: f.id, volumeAte: f.volumeAte, percentual: f.percentual })),
      })),
      cronograma: cenario.cronograma.map((p) => ({ mes: p.mes, percentualExecucaoMensal: p.percentualExecucaoMensal })),
      indicesCorrecao: cenario.indicesCorrecao.map((i) => ({ grupo: i.grupo, mes: i.mes, percentual: i.percentual })),
      financiamento: cenario.financiamento
        ? {
            valorContratado: cenario.financiamento.valorContratado,
            taxaJurosMensal: cenario.financiamento.taxaJurosMensal,
            mesAmortizacao: cenario.financiamento.mesAmortizacao,
            tipoAmortizacao: cenario.financiamento.tipoAmortizacao,
            numeroParcelas: cenario.financiamento.numeroParcelas,
          }
        : null,
      totalVendasGeradas: cenario._count.vendas,
    };
  });

  app.patch<{
    Params: { id: string };
    Body: { nome?: string; horizonteProjecaoMeses?: number; limiteNecessidadeMaximaCapital?: string | null; dataMesUm?: string | null; taxaDescontoMensal?: string | null };
  }>("/api/cenarios/:id", async (req, reply) => {
    const { nome, horizonteProjecaoMeses, limiteNecessidadeMaximaCapital, dataMesUm, taxaDescontoMensal } = req.body ?? {};
    const taxaLida: { valor?: string | null; erro?: string } = taxaDescontoMensal === undefined || taxaDescontoMensal === null ? { valor: taxaDescontoMensal } : lerDecimal(taxaDescontoMensal.trim() === "" ? undefined : taxaDescontoMensal, "Taxa de desconto (TMA)", "0.008", 1);
    if (taxaLida.erro) {
      reply.code(400);
      return { erro: taxaLida.erro };
    }
    if (nome !== undefined && !nome.trim()) {
      reply.code(400);
      return { erro: "Nome do cenário não pode ficar vazio" };
    }
    if (horizonteProjecaoMeses !== undefined && (horizonteProjecaoMeses < 1 || !Number.isInteger(horizonteProjecaoMeses))) {
      reply.code(400);
      return { erro: "Horizonte de projeção deve ser um número inteiro de meses maior que zero" };
    }
    // Achado F15 (docs/DECISOES.md — "alertas de risco configuraveis"):
    // null explicito volta a usar o padrao de 30% do motor; string vazia
    // e tratada como o mesmo "voltar ao padrao", nao como erro.
    if (limiteNecessidadeMaximaCapital !== undefined && limiteNecessidadeMaximaCapital !== null && limiteNecessidadeMaximaCapital.trim() !== "") {
      const valor = Number(limiteNecessidadeMaximaCapital);
      if (Number.isNaN(valor) || valor < 0) {
        reply.code(400);
        return { erro: "Limite de risco deve ser um percentual válido, maior ou igual a zero" };
      }
    }
    // Ancora de calendario (achado F27, docs/DECISOES.md — "importacao em
    // lote de extrato bancario"): null explicito remove a ancora.
    if (dataMesUm !== undefined && dataMesUm !== null && Number.isNaN(Date.parse(dataMesUm))) {
      reply.code(400);
      return { erro: "dataMesUm deve ser uma data válida (AAAA-MM-DD)" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    return atualizarCenario(req.params.id, {
      nome: nome?.trim(),
      horizonteProjecaoMeses,
      limiteNecessidadeMaximaCapital: limiteNecessidadeMaximaCapital === undefined ? undefined : limiteNecessidadeMaximaCapital?.trim() || null,
      dataMesUm: dataMesUm === undefined ? undefined : dataMesUm === null ? null : new Date(dataMesUm),
      taxaDescontoMensal: taxaDescontoMensal === undefined ? undefined : taxaLida.valor ?? null,
    });
  });

  // Importacao em lote de extrato bancario (achado F27, docs/DECISOES.md):
  // "sugerir e confirmar", nunca "marcar automatico" -- esta rota so le e
  // devolve sugestoes, nunca escreve nada. CSV enviado como texto no corpo
  // (nao multipart) -- o navegador ja le o arquivo local via FileReader.
  app.post<{ Params: { id: string }; Body: { csv?: string } }>("/api/cenarios/:id/extrato/sugestoes", async (req, reply) => {
    const { csv } = req.body ?? {};
    if (!csv || !csv.trim()) {
      reply.code(400);
      return { erro: "Conteúdo do CSV é obrigatório" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    let linhas;
    try {
      linhas = parseExtratoCSV(csv);
    } catch (e: any) {
      reply.code(400);
      return { erro: String(e.message ?? e) };
    }
    const candidatos = await montarCandidatosConciliacao(cenario.id);
    const sugestoes = sugerirConciliacao(linhas, candidatos, cenario.dataMesUm ?? undefined);
    return {
      sugestoes: sugestoes.map((s) => ({
        linha: { data: s.linha.data, descricao: s.linha.descricao, valor: s.linha.valor.toFixed(2) },
        candidatos: s.candidatos.map((c) => ({ tipo: c.tipo, id: c.id, descricao: c.descricao, valorPrevisto: c.valorPrevisto.toFixed(2), mes: c.mes })),
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: { confirmacoes?: ConfirmacaoConciliacao[] } }>(
    "/api/cenarios/:id/extrato/confirmar",
    async (req, reply) => {
      const { confirmacoes } = req.body ?? {};
      if (!confirmacoes || confirmacoes.length === 0) {
        reply.code(400);
        return { erro: "Nenhuma confirmação enviada" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const resultado = await confirmarConciliacao(cenario.id, confirmacoes);
      if ("erro" in resultado) {
        reply.code(400);
        return resultado;
      }
      return resultado;
    },
  );

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/impacto-exclusao", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    return impactoExclusao([cenario.id]);
  });

  app.delete<{ Params: { id: string } }>("/api/cenarios/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    await excluirCenario(req.params.id);
    reply.code(204);
    return null;
  });

  // Duplicar cenario (achado F10, docs/DECISOES.md — "versao de cenario"):
  // copia premissas/custos/cronograma/indice/financiamento para um cenario
  // novo e independente. Deliberadamente nao copia Venda -- ver
  // duplicarCenario em src/db/cadastro.ts para o raciocinio completo.
  app.post<{ Params: { id: string }; Body: { nome?: string } }>("/api/cenarios/:id/duplicar", async (req, reply) => {
    const { nome } = req.body ?? {};
    if (!nome || !nome.trim()) {
      reply.code(400);
      return { erro: "Nome do novo cenário é obrigatório" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const novo = await duplicarCenario(req.params.id, nome.trim());
    reply.code(201);
    return novo;
  });

  app.post<{
    Params: { id: string };
    Body: { categoriaId?: string; tipologiaId?: string; valorPrevisto?: string; percentual?: string; competenciaMes?: number; recorrencia?: string; grupoIndiceCorrecao?: string };
  }>("/api/cenarios/:id/custos", async (req, reply) => {
    const { categoriaId, tipologiaId, valorPrevisto, percentual, competenciaMes, recorrencia, grupoIndiceCorrecao } = req.body ?? {};
    if (!categoriaId) {
      reply.code(400);
      return { erro: "Categoria de custo é obrigatória" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const categoria = await prisma.categoriaCusto.findUnique({ where: { id: categoriaId } });
    if (!categoria) {
      reply.code(404);
      return { erro: "Categoria de custo não encontrada" };
    }
    const incidenciaPorValor = categoria.tipoIncidencia === "fixo" || categoria.tipoIncidencia === "pct_execucao";
    // Faixas de comissao progressiva (achado F28, docs/DECISOES.md): o
    // percentual nao e um unico valor no Custo, e sim uma tabela cadastrada
    // depois via POST /api/custos/:custoId/faixas-comissao -- nem
    // valorPrevisto nem percentual sao pedidos na criacao.
    const usaFaixas = categoria.tipoIncidencia === "faixas_vgv_acumulado";
    if (incidenciaPorValor && (!valorPrevisto || !valorPrevisto.trim())) {
      reply.code(400);
      return { erro: "Valor previsto é obrigatório para esta categoria de custo" };
    }
    if (!incidenciaPorValor && !usaFaixas && (!percentual || !percentual.trim())) {
      reply.code(400);
      return { erro: "Percentual é obrigatório para esta categoria de custo" };
    }
    if (categoria.tipoIncidencia === "fixo" && (!competenciaMes || competenciaMes < 1)) {
      reply.code(400);
      return { erro: "Mês de competência é obrigatório para custo fixo" };
    }
    const valorLido = lerDecimal(valorPrevisto, "Valor previsto", "500000");
    const percentualLido = lerDecimal(percentual, "Percentual", "0.04");
    if (valorLido.erro || percentualLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro ?? percentualLido.erro };
    }
    // Escopo por tipologia (achado F11, docs/DECISOES.md — "estrutura de
    // comissao") so faz sentido para pct_vgv_vendido_no_mes,
    // pct_recebido_no_mes (achado F25) ou faixas_vgv_acumulado (achado F28)
    // -- nas outras incidencias (fixo, pct_execucao, pct_recebido_mes_anterior)
    // nao ha como um valor/percentual "incidir sobre uma tipologia".
    const suportaTipologia =
      categoria.tipoIncidencia === "pct_vgv_vendido_no_mes" || categoria.tipoIncidencia === "pct_recebido_no_mes" || usaFaixas;
    if (tipologiaId && !suportaTipologia) {
      reply.code(400);
      return { erro: "Escopo por tipologia só é aplicável a custos de incidência sobre valor vendido ou recebido" };
    }
    if (tipologiaId) {
      const tipologia = await prisma.tipologia.findUnique({ where: { id: tipologiaId } });
      if (!tipologia) {
        reply.code(404);
        return { erro: "Tipologia não encontrada" };
      }
    }
    const custo = await criarCusto({
      empreendimentoId: cenario.empreendimentoId,
      cenarioId: cenario.id,
      categoriaId,
      tipologiaId: tipologiaId || undefined,
      valorPrevisto: incidenciaPorValor ? valorLido.valor : undefined,
      percentual: incidenciaPorValor || usaFaixas ? undefined : percentualLido.valor,
      competenciaMes: categoria.tipoIncidencia === "fixo" ? competenciaMes : undefined,
      recorrencia: (recorrencia as "unico" | "mensal") ?? "unico",
      grupoIndiceCorrecao: grupoIndiceCorrecao?.trim() || undefined,
    });
    // Fase 2.2 — Custos: recalcula na hora, mesmo padrao de POST
    // /api/cenarios/:cenarioId/vendas, para que o previsto (e, para
    // incidencias percentuais, o DesembolsoCusto por mes) ja exista sem
    // depender de uma chamada separada a /fluxo-caixa.
    await rodarMotorParaCenario(cenario.id);
    reply.code(201);
    return custo;
  });

  app.delete<{ Params: { id: string } }>("/api/custos/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const custo = await prisma.custo.findUnique({ where: { id: req.params.id } });
    if (!custo) {
      reply.code(404);
      return { erro: "Custo não encontrado" };
    }
    // Achado F31 (Fase 2.2, docs/DECISOES.md): faltava garantirAcesso aqui
    // -- unica rota de exclusao de Custo sem checagem de vinculo, apesar de
    // ja checar papel==="admin" (sem risco pratico hoje, ja que admin tem
    // acesso universal, mas inconsistente com o resto das rotas de custo).
    if (!(await garantirAcesso(req, reply, custo.empreendimentoId))) return;
    const categoriaDoCusto = await prisma.categoriaCusto.findUniqueOrThrow({ where: { id: custo.categoriaId } });
    const parcelasPerdidas = await parcelasPagasQuePerderiamBase(custo.cenarioId, (e) => ({
      ...e,
      custos: e.custos.filter((c) => c.id !== custo.id),
    }));
    if (custo.status === "realizado" && categoriaDoCusto.tipoIncidencia === "fixo") {
      parcelasPerdidas.push({ categoriaNome: categoriaDoCusto.nome, mes: custo.competenciaMes ?? 0, valorRealizado: custo.valorRealizado ?? "0" });
    }
    if (parcelasPerdidas.length > 0) {
      reply.code(400);
      return { erro: mensagemParcelasPagasSemBase("Excluir este custo", parcelasPerdidas) };
    }
    await excluirCusto(req.params.id);
    reply.code(204);
    return null;
  });

  // Destinatario de comissao (achado F13, docs/DECISOES.md — "split nominal
  // de comissao"): cadastro nominal de quem recebe a comissao de um custo e
  // como ela se divide. Nunca lido pelo motor, mesmo espirito de
  // Permuta/Distrato -- so aparece na API/tela de cadastro.
  app.post<{ Params: { custoId: string }; Body: { nome?: string; percentualSplit?: string } }>(
    "/api/custos/:custoId/destinatarios-comissao",
    async (req, reply) => {
      const { nome, percentualSplit } = req.body ?? {};
      if (!nome || !nome.trim()) {
        reply.code(400);
        return { erro: "Nome do destinatário é obrigatório" };
      }
      if (!percentualSplit || !percentualSplit.trim()) {
        reply.code(400);
        return { erro: "Percentual de split é obrigatório" };
      }
      const custo = await prisma.custo.findUnique({ where: { id: req.params.custoId } });
      if (!custo) {
        reply.code(404);
        return { erro: "Custo não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, custo.empreendimentoId))) return;
      const splitLido = lerDecimal(percentualSplit, "Percentual de split", "0.5", 1);
      if (splitLido.erro) {
        reply.code(400);
        return { erro: splitLido.erro };
      }
      const resultado = await criarDestinatarioComissao(custo.id, nome.trim(), splitLido.valor!);
      if ("erro" in resultado) {
        reply.code(400);
        return resultado;
      }
      reply.code(201);
      return resultado.destinatario;
    },
  );

  app.patch<{ Params: { id: string }; Body: { nome?: string; percentualSplit?: string } }>(
    "/api/destinatarios-comissao/:id",
    async (req, reply) => {
      const destinatario = await prisma.destinatarioComissao.findUnique({ where: { id: req.params.id }, include: { custo: true } });
      if (!destinatario) {
        reply.code(404);
        return { erro: "Destinatário de comissão não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, destinatario.custo.empreendimentoId))) return;
      const { nome, percentualSplit } = req.body ?? {};
      const splitLido = lerDecimal(percentualSplit ?? undefined, "Percentual de split", "0.5", 1);
      if (splitLido.erro) {
        reply.code(400);
        return { erro: splitLido.erro };
      }
      const resultado = await atualizarDestinatarioComissao(req.params.id, {
        nome: nome?.trim() || undefined,
        percentualSplit: splitLido.valor,
      });
      if ("erro" in resultado) {
        reply.code(400);
        return resultado;
      }
      return resultado.destinatario;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/destinatarios-comissao/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const destinatario = await prisma.destinatarioComissao.findUnique({ where: { id: req.params.id }, include: { custo: true } });
    if (!destinatario) {
      reply.code(404);
      return { erro: "Destinatário de comissão não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, destinatario.custo.empreendimentoId))) return;
    await excluirDestinatarioComissao(req.params.id);
    reply.code(204);
    return null;
  });

  // Faixas de uma tabela de comissao progressiva por VGV acumulado (achado
  // F28, docs/DECISOES.md — "faixas de comissao progressivas por volume
  // vendido"): diferente de destinatarios-comissao, o motor le esta lista
  // (src/core/motorCustos.ts) -- so faz sentido para um Custo cuja
  // categoria tem tipoIncidencia="faixas_vgv_acumulado".
  app.post<{ Params: { custoId: string }; Body: { volumeAte?: string | null; percentual?: string } }>(
    "/api/custos/:custoId/faixas-comissao",
    async (req, reply) => {
      const { volumeAte, percentual } = req.body ?? {};
      if (!percentual || !percentual.trim()) {
        reply.code(400);
        return { erro: "Percentual da faixa é obrigatório" };
      }
      const custo = await prisma.custo.findUnique({ where: { id: req.params.custoId } });
      if (!custo) {
        reply.code(404);
        return { erro: "Custo não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, custo.empreendimentoId))) return;
      const percentualLido = lerDecimal(percentual, "Percentual da faixa", "0.04", 1);
      const volumeLido = volumeAte?.trim() ? lerDecimal(volumeAte, "Volume até", "1000000") : { valor: undefined };
      if (percentualLido.erro || volumeLido.erro) {
        reply.code(400);
        return { erro: percentualLido.erro ?? volumeLido.erro };
      }
      const resultado = await criarFaixaComissao(custo.id, volumeLido.valor ?? null, percentualLido.valor!);
      if ("erro" in resultado) {
        reply.code(400);
        return resultado;
      }
      reply.code(201);
      return resultado.faixa;
    },
  );

  app.patch<{ Params: { id: string }; Body: { volumeAte?: string | null; percentual?: string } }>(
    "/api/faixas-comissao/:id",
    async (req, reply) => {
      const faixa = await prisma.faixaComissao.findUnique({ where: { id: req.params.id }, include: { custo: true } });
      if (!faixa) {
        reply.code(404);
        return { erro: "Faixa de comissão não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, faixa.custo.empreendimentoId))) return;
      const { volumeAte, percentual } = req.body ?? {};
      const percentualLido = lerDecimal(percentual ?? undefined, "Percentual da faixa", "0.04", 1);
      const volumeLido = volumeAte?.trim() ? lerDecimal(volumeAte, "Volume até", "1000000") : { valor: undefined };
      if (percentualLido.erro || volumeLido.erro) {
        reply.code(400);
        return { erro: percentualLido.erro ?? volumeLido.erro };
      }
      const resultado = await atualizarFaixaComissao(req.params.id, {
        volumeAte: volumeAte === undefined ? undefined : volumeLido.valor ?? null,
        percentual: percentualLido.valor,
      });
      if ("erro" in resultado) {
        reply.code(400);
        return resultado;
      }
      return resultado.faixa;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/faixas-comissao/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const faixa = await prisma.faixaComissao.findUnique({ where: { id: req.params.id }, include: { custo: true } });
    if (!faixa) {
      reply.code(404);
      return { erro: "Faixa de comissão não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, faixa.custo.empreendimentoId))) return;
    await excluirFaixaComissao(req.params.id);
    reply.code(204);
    return null;
  });

  app.delete<{ Params: { id: string } }>("/api/cenarios/:id/cronograma", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    await excluirCronograma(req.params.id);
    reply.code(204);
    return null;
  });

  app.patch<{ Params: { id: string }; Body: { pontos?: { mes: number; percentualExecucaoMensal: string }[] } }>(
    "/api/cenarios/:id/cronograma",
    async (req, reply) => {
      const { pontos } = req.body ?? {};
      if (!pontos || pontos.length === 0) {
        reply.code(400);
        return { erro: "É preciso ao menos um ponto de cronograma" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const lidos = pontos.map((p) => ({ mes: Number(p.mes), percentual: lerDecimal(p.percentualExecucaoMensal, `Percentual do mês ${p.mes}`, "0.1", 1) }));
      const primeiroErro = lidos.find((l) => l.percentual.erro);
      if (primeiroErro) {
        reply.code(400);
        return { erro: primeiroErro.percentual.erro };
      }
      const erro = await substituirCronograma(
        cenario.id,
        lidos.map((l) => ({ mes: l.mes, percentualExecucaoMensal: l.percentual.valor! })),
      );
      if (erro) {
        reply.code(400);
        return { erro };
      }
      return { pontos: pontos.length };
    },
  );

  app.post<{ Params: { id: string }; Body: { pontos?: { mes: number; percentualExecucaoMensal: string }[] } }>(
    "/api/cenarios/:id/cronograma",
    async (req, reply) => {
      const { pontos } = req.body ?? {};
      if (!pontos || pontos.length === 0) {
        reply.code(400);
        return { erro: "É preciso ao menos um ponto de cronograma" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const existentes = await prisma.cronogramaFisicoFinanceiro.count({ where: { cenarioId: cenario.id } });
      if (existentes > 0) {
        reply.code(400);
        return { erro: "Este cenário já tem um cronograma cadastrado" };
      }
      const pontosLidos = pontos.map((p) => lerDecimal(p.percentualExecucaoMensal, `Percentual do mês ${p.mes}`, "0.05", 1));
      const primeiroErro = pontosLidos.find((p) => p.erro);
      if (primeiroErro) {
        reply.code(400);
        return { erro: primeiroErro.erro };
      }
      const pontosNormalizados = pontos.map((p, i) => ({ mes: p.mes, percentualExecucaoMensal: pontosLidos[i]!.valor! }));
      try {
        await criarCronograma({ empreendimentoId: cenario.empreendimentoId, cenarioId: cenario.id, pontos: pontosNormalizados });
        reply.code(201);
        return { criados: pontos.length };
      } catch (e: any) {
        reply.code(400);
        return { erro: String(e.message ?? e) };
      }
    },
  );

  // Curva combinada do cronograma fisico-financeiro (Fase 2.3): percentual
  // fisico e acumulado lado a lado com o desembolso financeiro (e seu
  // acumulado) que aquele percentual gerou nos Custo com
  // tipoIncidencia="pct_execucao" do cenario. Toda a agregacao acontece em
  // montarCurvaCronogramaDoCenario/calcularCurvaCronograma (src/db,
  // src/core) -- esta rota so serializa Decimal -> string.
  app.get<{ Params: { id: string } }>("/api/cenarios/:id/cronograma-curva", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const curva = await montarCurvaCronogramaDoCenario(cenario.id);
    return {
      pontos: curva.map((p) => ({
        mes: p.mes,
        percentualExecucaoMensal: p.percentualExecucaoMensal.toString(),
        percentualAcumulado: p.percentualAcumulado.toString(),
        desembolsoMensal: p.desembolsoMensal.toFixed(2),
        desembolsoAcumulado: p.desembolsoAcumulado.toFixed(2),
      })),
    };
  });

  // Indice de correcao monetaria (achado F6, docs/DECISOES.md): ao contrario
  // do cronograma, cada mes e independente (sem soma obrigatoria) -- upsert
  // por mes em vez de "criar tudo de uma vez", para o usuario poder
  // completar a serie aos poucos conforme novos indices sao divulgados.
  app.post<{ Params: { id: string }; Body: { grupo?: string; mes?: number; percentual?: string } }>(
    "/api/cenarios/:id/indices-correcao",
    async (req, reply) => {
      const { grupo, mes, percentual } = req.body ?? {};
      if (mes === undefined || !Number.isInteger(mes) || mes < 1) {
        reply.code(400);
        return { erro: "mês deve ser um número inteiro maior ou igual a 1" };
      }
      if (percentual === undefined || !percentual.trim()) {
        reply.code(400);
        return { erro: "percentual é obrigatório e deve ser numérico" };
      }
      const percentualLido = lerDecimal(percentual, "Variação", "0.005", undefined, true);
      if (percentualLido.erro) {
        reply.code(400);
        return { erro: percentualLido.erro };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const ponto = await definirPontoIndiceCorrecao({
        empreendimentoId: cenario.empreendimentoId,
        cenarioId: cenario.id,
        grupo: grupo?.trim() || undefined,
        mes,
        percentual: percentualLido.valor!,
      });
      reply.code(201);
      return ponto;
    },
  );

  app.delete<{ Params: { id: string; mes: string }; Querystring: { grupo?: string } }>("/api/cenarios/:id/indices-correcao/:mes", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    await excluirPontoIndiceCorrecao(cenario.id, req.query?.grupo?.trim() || "padrao", Number(req.params.mes));
    reply.code(204);
    return null;
  });

  // Financiamento de producao (achado F8, docs/DECISOES.md): diferente de
  // indice de correcao/sensibilidade, isto MUDA o fluxo de caixa de
  // verdade -- liberacoes e amortizacao entram na consolidacao real
  // (src/core/motorFinanceiro.ts). Upsert, um financiamento por cenario.
  app.post<{
    Params: { id: string };
    Body: { valorContratado?: string; taxaJurosMensal?: string; mesAmortizacao?: number; tipoAmortizacao?: string; numeroParcelas?: number };
  }>("/api/cenarios/:id/financiamento", async (req, reply) => {
    const { valorContratado, taxaJurosMensal, mesAmortizacao, numeroParcelas } = req.body ?? {};
    const tipoAmortizacao = (req.body?.tipoAmortizacao as "unico" | "sac" | "price" | undefined) ?? "unico";
    if (!valorContratado || !valorContratado.trim()) {
      reply.code(400);
      return { erro: "valorContratado é obrigatório e deve ser numérico" };
    }
    if (!taxaJurosMensal || !taxaJurosMensal.trim()) {
      reply.code(400);
      return { erro: "taxaJurosMensal é obrigatório e deve ser numérico" };
    }
    const valorContratadoLido = lerDecimal(valorContratado, "Valor contratado", "1000000");
    const taxaLida = lerDecimal(taxaJurosMensal, "Juros mensal", "0.01", 1);
    if (valorContratadoLido.erro || taxaLida.erro) {
      reply.code(400);
      return { erro: valorContratadoLido.erro ?? taxaLida.erro };
    }
    if (mesAmortizacao === undefined || !Number.isInteger(mesAmortizacao) || mesAmortizacao < 1) {
      reply.code(400);
      return { erro: "mesAmortizacao deve ser um número inteiro maior ou igual a 1" };
    }
    if (tipoAmortizacao !== "unico" && tipoAmortizacao !== "sac" && tipoAmortizacao !== "price") {
      reply.code(400);
      return { erro: "tipoAmortizacao deve ser 'unico', 'sac' ou 'price'" };
    }
    // Achado F16 (docs/DECISOES.md — "amortizacao SAC/Price"): a tabela so
    // faz sentido com uma quantidade de parcelas definida; "unico" nunca
    // precisa dela (o proprio nome ja diz: pagamento unico).
    if (tipoAmortizacao !== "unico" && (numeroParcelas === undefined || !Number.isInteger(numeroParcelas) || numeroParcelas < 1)) {
      reply.code(400);
      return { erro: "numeroParcelas é obrigatório (inteiro ≥ 1) para tipoAmortizacao 'sac' ou 'price'" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const financiamento = await definirFinanciamento({
      empreendimentoId: cenario.empreendimentoId,
      cenarioId: cenario.id,
      valorContratado: valorContratadoLido.valor!,
      taxaJurosMensal: taxaLida.valor!,
      mesAmortizacao,
      tipoAmortizacao,
      numeroParcelas: tipoAmortizacao === "unico" ? null : numeroParcelas,
    });
    reply.code(200);
    return financiamento;
  });

  app.delete<{ Params: { id: string } }>("/api/cenarios/:id/financiamento", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    await excluirFinanciamento(cenario.id);
    reply.code(204);
    return null;
  });

  // Uma unica rota PATCH cobre duas acoes distintas, despachadas pela
  // presenca de valorRealizado no corpo: registrar o realizado (Fase 1,
  // fluxo de realizado x projetado) ou editar os campos previstos
  // (competenciaMes, valorPrevisto, percentual, recorrencia).
  app.patch<{
    Params: { id: string };
    Body: {
      valorRealizado?: string;
      valorPrevisto?: string | null;
      percentual?: string | null;
      competenciaMes?: number | null;
      recorrencia?: "unico" | "mensal";
      estornar?: boolean;
      grupoIndiceCorrecao?: string;
    };
  }>("/api/custos/:id", async (req, reply) => {
    const { valorRealizado, valorPrevisto, percentual, competenciaMes, recorrencia, estornar, grupoIndiceCorrecao } = req.body ?? {};
    const custo = await prisma.custo.findUnique({ where: { id: req.params.id }, include: { categoria: true } });
    if (!custo) {
      reply.code(404);
      return { erro: "Custo não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, custo.empreendimentoId))) return;

    if (estornar) {
      return prisma.custo.update({ where: { id: req.params.id }, data: { valorRealizado: null, status: "previsto" } });
    }

    if (valorRealizado !== undefined) {
      if (!valorRealizado.trim()) {
        reply.code(400);
        return { erro: "Valor realizado é obrigatório" };
      }
      if (custo.categoria.tipoIncidencia !== "fixo") {
        reply.code(400);
        return {
          erro:
            "Só é possível registrar valor realizado para custos de incidência fixa (com mês de competência definido) — custos percentuais são recalculados pelo motor a cada mês, sem uma única linha para marcar",
        };
      }
      return prisma.custo.update({ where: { id: req.params.id }, data: { valorRealizado: valorRealizado.trim(), status: "realizado" } });
    }

    const valorLido = lerDecimal(valorPrevisto ?? undefined, "Valor previsto", "500000");
    const percentualLido = lerDecimal(percentual ?? undefined, "Percentual", "0.04");
    if (valorLido.erro || percentualLido.erro) {
      reply.code(400);
      return { erro: valorLido.erro ?? percentualLido.erro };
    }
    const parcelasPerdidas = await parcelasPagasQuePerderiamBase(custo.cenarioId, (e) => ({
      ...e,
      custos: e.custos.map((c) =>
        c.id !== custo.id
          ? c
          : {
              ...c,
              valorPrevisto: valorPrevisto === undefined ? c.valorPrevisto : valorPrevisto === null ? undefined : new Decimal(valorPrevisto),
              percentual: percentual === undefined ? c.percentual : percentual === null ? undefined : new Decimal(percentual),
              competenciaMes: competenciaMes === undefined ? c.competenciaMes : competenciaMes ?? undefined,
              recorrencia: recorrencia ?? c.recorrencia,
            },
      ),
    }));
    if (parcelasPerdidas.length > 0) {
      reply.code(400);
      return { erro: mensagemParcelasPagasSemBase("Editar este custo", parcelasPerdidas) };
    }
    const atualizado = await atualizarCusto(req.params.id, {
      valorPrevisto: valorPrevisto === null ? null : valorLido.valor,
      percentual: percentual === null ? null : percentualLido.valor,
      competenciaMes,
      recorrencia,
      grupoIndiceCorrecao: grupoIndiceCorrecao?.trim() || undefined,
    });
    // Editar um campo do previsto muda o valor que o motor projeta -- mesma
    // logica de recalcular na hora de POST /api/cenarios/:id/custos (Fase 2.2).
    await rodarMotorParaCenario(custo.cenarioId);
    return atualizado;
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/recebimentos", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const recebimentos = await listarRecebimentosDoCenario(req.params.id);
    return recebimentos.map((r) => ({
      id: r.id,
      // vendaId (Fase 2, tela de Vendas): campo aditivo -- permite a tela
      // filtrar client-side "os recebimentos desta venda" sem precisar de
      // uma rota nova, reaproveitando esta lista que ja existe.
      vendaId: r.vendaId,
      unidadeNumero: r.venda.unidade.numero,
      modalidadeNome: r.modalidade.nome,
      mesCompetencia: r.mesCompetencia,
      valorPrevisto: r.valorPrevisto,
      valorRealizado: r.valorRealizado,
      status: r.status,
    }));
  });

  app.patch<{ Params: { id: string }; Body: { valorRealizado?: string; status?: string; estornar?: boolean } }>(
    "/api/recebimentos/:id",
    async (req, reply) => {
      const { valorRealizado, status, estornar } = req.body ?? {};
      if (!estornar) {
        if (!valorRealizado || !valorRealizado.trim()) {
          reply.code(400);
          return { erro: "Valor realizado é obrigatório" };
        }
        const tiposValidos = ["recebido", "atrasado"];
        if (status !== undefined && !tiposValidos.includes(status)) {
          reply.code(400);
          return { erro: `Status deve ser um de: ${tiposValidos.join(", ")}` };
        }
      }
      const recebimento = await prisma.recebimentoProjetado.findUnique({
        where: { id: req.params.id },
        include: { venda: { select: { empreendimentoId: true } } },
      });
      if (!recebimento) {
        reply.code(404);
        return { erro: "Recebimento não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, recebimento.venda.empreendimentoId))) return;
      if (estornar) {
        return prisma.recebimentoProjetado.update({ where: { id: req.params.id }, data: { valorRealizado: null, status: "previsto" } });
      }
      return prisma.recebimentoProjetado.update({
        where: { id: req.params.id },
        data: { valorRealizado: valorRealizado!.trim(), status: status ?? "recebido" },
      });
    },
  );

  // Desembolsos de custo percentual (achado F21, docs/DECISOES.md —
  // "realizado para custos percentuais"): mesmo espirito de
  // GET/PATCH .../recebimentos, mas para as parcelas de um Custo de
  // incidencia nao-fixa, persistidas em DesembolsoCusto por
  // rodarMotorParaCenario (src/db/servicoMotor.ts). Depende de o fluxo de
  // caixa do cenario ja ter sido calculado ao menos uma vez (mesma
  // dependencia implicita de GET .../recebimentos com RecebimentoProjetado).
  app.get<{ Params: { id: string } }>("/api/cenarios/:id/desembolsos-custos", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const desembolsos = await prisma.desembolsoCusto.findMany({
      where: { custo: { cenarioId: req.params.id } },
      include: { custo: { include: { categoria: { select: { nome: true } } } } },
      orderBy: [{ mes: "asc" }],
    });
    return desembolsos.map((d) => ({
      id: d.id,
      custoId: d.custoId,
      categoriaNome: d.custo.categoria.nome,
      mes: d.mes,
      valorPrevisto: d.valorPrevisto,
      valorRealizado: d.valorRealizado,
      status: d.status,
    }));
  });

  app.patch<{ Params: { id: string }; Body: { valorRealizado?: string; estornar?: boolean } }>(
    "/api/desembolsos-custos/:id",
    async (req, reply) => {
      const { valorRealizado, estornar } = req.body ?? {};
      if (!estornar && (!valorRealizado || !valorRealizado.trim())) {
        reply.code(400);
        return { erro: "Valor realizado é obrigatório" };
      }
      const desembolso = await prisma.desembolsoCusto.findUnique({
        where: { id: req.params.id },
        include: { custo: { select: { empreendimentoId: true } } },
      });
      if (!desembolso) {
        reply.code(404);
        return { erro: "Desembolso não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, desembolso.custo.empreendimentoId))) return;
      if (estornar) {
        if (new Decimal(desembolso.valorPrevisto).isZero()) {
          await prisma.desembolsoCusto.delete({ where: { id: req.params.id } });
          return { id: req.params.id, removido: true };
        }
        return prisma.desembolsoCusto.update({ where: { id: req.params.id }, data: { valorRealizado: null, status: "previsto" } });
      }
      return prisma.desembolsoCusto.update({
        where: { id: req.params.id },
        data: { valorRealizado: valorRealizado!.trim(), status: "realizado" },
      });
    },
  );

  // Visao gerencial de custos (Fase 2.2, docs/DECISOES.md — achado F31):
  // previsto/realizado/saldo/desvio por custo, calculados aqui (nao no
  // frontend) para nao duplicar regra financeira. O previsto total de CADA
  // custo -- inclusive fixo -- vem da soma de resultado.desembolsos, a
  // mesma saida que o motor ja calcula para o fluxo de caixa (nao um
  // recalculo paralelo); o realizado usa Custo.valorRealizado para
  // incidencia "fixo" (unico valor agregado) e a soma de
  // DesembolsoCusto.valorRealizado para as demais (granular por mes).
  app.get<{ Params: { id: string } }>("/api/cenarios/:id/custos-resumo", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    return montarCustosResumoDoCenario(cenario.id);
  });

  // Distribuicao mensal de um custo (Fase 2.2): filtra resultado.desembolsos
  // -- ja calculado por rodarMotorParaCenario para o fluxo de caixa -- por
  // custoId, sem nenhuma logica nova em src/core. Para custos de incidencia
  // "fixo" o realizado continua sendo um unico valor agregado (limitacao
  // real do modelo, achado F31): "granular" indica se ha realizado por mes
  // (DesembolsoCusto, incidencias percentuais) ou nao.
  app.get<{ Params: { id: string } }>("/api/custos/:id/distribuicao-mensal", async (req, reply) => {
    const custo = await prisma.custo.findUnique({ where: { id: req.params.id }, include: { categoria: true } });
    if (!custo) {
      reply.code(404);
      return { erro: "Custo não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, custo.empreendimentoId))) return;

    const resultado = await rodarMotorParaCenario(custo.cenarioId);
    const granular = custo.categoria.tipoIncidencia !== "fixo";
    const realizadoPorMes = granular
      ? (await prisma.desembolsoCusto.findMany({ where: { custoId: custo.id }, orderBy: { mes: "asc" } })).map((d) => ({
          mes: d.mes,
          valorRealizado: d.valorRealizado,
          status: d.status,
          desembolsoId: d.id,
        }))
      : [];
    const mesesComBase = resultado.desembolsos.filter((d) => d.custoId === custo.id).map((d) => ({ mes: d.mes, valorPrevisto: d.valor.toString(), semBase: false }));
    const mesesSemBase = realizadoPorMes
      .filter((r) => r.status === "realizado" && !mesesComBase.some((m) => m.mes === r.mes))
      .map((r) => ({ mes: r.mes, valorPrevisto: "0", semBase: true }));
    const meses = [...mesesComBase, ...mesesSemBase].sort((a, b) => a.mes - b.mes);

    return {
      custoId: custo.id,
      tipoIncidencia: custo.categoria.tipoIncidencia as TipoIncidenciaCusto,
      recorrencia: custo.recorrencia,
      granular,
      meses,
      realizadoPorMes,
    };
  });

  app.post<{ Params: { id: string }; Body: { itens?: { tipologiaId: string; mes: number; unidadesPrevistas: string }[] } }>(
    "/api/cenarios/:id/premissas-velocidade",
    async (req, reply) => {
      const { itens } = req.body ?? {};
      if (!itens || itens.length === 0) {
        reply.code(400);
        return { erro: "É preciso ao menos um item de premissa de velocidade" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const unidadesLidas = itens.map((item) => lerDecimal(item.unidadesPrevistas, `Unidades previstas (mês ${item.mes})`, "10"));
      const primeiroErro = unidadesLidas.find((u) => u.erro);
      if (primeiroErro) {
        reply.code(400);
        return { erro: primeiroErro.erro };
      }
      await criarPremissaVelocidade(
        itens.map((item, i) => ({
          empreendimentoId: cenario.empreendimentoId,
          cenarioId: cenario.id,
          tipologiaId: item.tipologiaId,
          mes: item.mes,
          unidadesPrevistas: unidadesLidas[i]!.valor!,
        })),
      );
      reply.code(201);
      return { criadas: itens.length, avisos: await calcularAvisosPremissas(cenario.id) };
    },
  );

  app.get<{ Params: { id: string } }>("/api/vendas/:id/impacto-exclusao", async (req, reply) => {
    const venda = await prisma.venda.findUnique({ where: { id: req.params.id }, select: { empreendimentoId: true } });
    if (!venda) {
      reply.code(404);
      return { erro: "Venda não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
    const impacto = await impactoExclusaoVenda(req.params.id);
    if ("erro" in impacto) {
      reply.code(404);
      return impacto;
    }
    return impacto;
  });

  app.delete<{ Params: { id: string } }>("/api/vendas/:id", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const vendaAlvo = await prisma.venda.findUnique({ where: { id: req.params.id }, select: { cenarioId: true, status: true } });
    if (vendaAlvo?.status === "ativa") {
      const parcelasPerdidas = await parcelasPagasQuePerderiamBase(vendaAlvo.cenarioId, (e) => ({
        ...e,
        vendas: e.vendas.filter((v) => v.id !== req.params.id),
      }));
      if (parcelasPerdidas.length > 0) {
        reply.code(400);
        return { erro: mensagemParcelasPagasSemBase("Excluir esta venda", parcelasPerdidas) };
      }
    }
    const erro = await excluirVenda(req.params.id);
    if (erro) {
      reply.code(erro === "Venda não encontrada" ? 404 : 400);
      return { erro };
    }
    reply.code(204);
    return null;
  });

  app.patch<{ Params: { id: string }; Body: { precoVenda?: string } }>("/api/unidades/:id", async (req, reply) => {
    const unidade = await prisma.unidade.findUnique({ where: { id: req.params.id } });
    if (!unidade) {
      reply.code(404);
      return { erro: "Unidade não encontrada" };
    }
    if (!(await garantirAcesso(req, reply, unidade.empreendimentoId))) return;
    const lido = lerDecimal(req.body?.precoVenda, "Preço de venda", "510000.00");
    if (lido.erro || lido.valor === undefined) {
      reply.code(400);
      return { erro: lido.erro ?? "Preço de venda é obrigatório" };
    }
    if (Number(lido.valor) <= 0) {
      reply.code(400);
      return { erro: "Preço de venda deve ser maior que zero" };
    }
    const resultado = await atualizarPrecoUnidade(unidade.id, lido.valor);
    if ("erro" in resultado) {
      reply.code(400);
      return { erro: resultado.erro };
    }
    return { id: resultado.unidade.id, precoVenda: resultado.unidade.precoVenda };
  });

  // Editar e excluir uma linha da premissa. O POST continua somando linhas iguais;
  // cada linha segue sendo um registro separado, e aqui só se mexe na linha pedida.
  app.patch<{ Params: { id: string; premissaId: string }; Body: { unidadesPrevistas?: string } }>(
    "/api/cenarios/:id/premissas-velocidade/:premissaId",
    async (req, reply) => {
      const lida = lerDecimal(req.body?.unidadesPrevistas, "Unidades previstas", "10");
      if (lida.erro || lida.valor === undefined) {
        reply.code(400);
        return { erro: lida.erro ?? "Unidades previstas é obrigatório" };
      }
      const premissa = await prisma.premissaVelocidadeVendas.findUnique({ where: { id: req.params.premissaId } });
      if (!premissa || premissa.cenarioId !== req.params.id) {
        reply.code(404);
        return { erro: "Premissa de velocidade não encontrada neste cenário" };
      }
      if (!(await garantirAcesso(req, reply, premissa.empreendimentoId))) return;
      await atualizarPremissaVelocidade(premissa.id, lida.valor);
      return { id: premissa.id, avisos: await calcularAvisosPremissas(req.params.id) };
    },
  );

  app.delete<{ Params: { id: string; premissaId: string } }>("/api/cenarios/:id/premissas-velocidade/:premissaId", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem excluir" };
    }
    const premissa = await prisma.premissaVelocidadeVendas.findUnique({ where: { id: req.params.premissaId } });
    if (!premissa || premissa.cenarioId !== req.params.id) {
      reply.code(404);
      return { erro: "Premissa de velocidade não encontrada neste cenário" };
    }
    const parcelasPerdidas = await parcelasPagasQuePerderiamBase(req.params.id, (e) => ({
      ...e,
      vendas: e.vendas.filter((v) => !ehVendaDaPremissa(v.id, premissa.id)),
    }));
    if (parcelasPerdidas.length > 0) {
      reply.code(400);
      return { erro: mensagemParcelasPagasSemBase("Excluir esta linha de premissa de velocidade", parcelasPerdidas) };
    }
    await excluirPremissaVelocidade(premissa.id);
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string } }>("/api/cenarios/:id/gerar-vendas", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    try {
      const resultado = await gerarVendasDePremissaVelocidade(req.params.id);
      return resultado;
    } catch (e: any) {
      reply.code(400);
      return { erro: String(e.message ?? e) };
    }
  });

  app.get<{ Params: { cenarioId: string } }>("/api/cenarios/:cenarioId/fluxo-caixa", async (req, reply) => {
    const { cenarioId } = req.params;

    const cenario = await prisma.cenario.findUnique({
      where: { id: cenarioId },
      include: { empreendimento: { select: { nome: true } } },
    });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const resultado = await rodarMotorParaCenario(cenarioId);

    // "Realizado" nunca passa pelo motor (que so conhece "previsto") -- e uma
    // camada de leitura por cima, somando RecebimentoProjetado.valorRealizado
    // e Custo.valorRealizado (custos fixos, que tem um mes de competencia
    // unico) mais DesembolsoCusto.valorRealizado (achado F21, docs/DECISOES.md
    // — custos percentuais geram varias parcelas por mes, sem um unico lugar
    // na linha do Custo para marcar como realizada).
    const recebimentosRealizados = await prisma.recebimentoProjetado.findMany({
      where: { venda: { cenarioId }, status: "recebido" },
      select: { mesCompetencia: true, valorRealizado: true },
    });
    const custosRealizados = await prisma.custo.findMany({
      where: { cenarioId, status: "realizado", competenciaMes: { not: null } },
      select: { competenciaMes: true, valorRealizado: true },
    });
    const desembolsosRealizados = await prisma.desembolsoCusto.findMany({
      where: { custo: { cenarioId }, status: "realizado" },
      select: { mes: true, valorRealizado: true },
    });
    const entradasRealizadasPorMes = new Map<number, Decimal>();
    for (const r of recebimentosRealizados) {
      const atual = entradasRealizadasPorMes.get(r.mesCompetencia) ?? new Decimal(0);
      entradasRealizadasPorMes.set(r.mesCompetencia, atual.plus(new Decimal(r.valorRealizado ?? "0")));
    }
    const saidasRealizadasPorMes = new Map<number, Decimal>();
    for (const c of custosRealizados) {
      const mes = c.competenciaMes as number;
      const atual = saidasRealizadasPorMes.get(mes) ?? new Decimal(0);
      saidasRealizadasPorMes.set(mes, atual.plus(new Decimal(c.valorRealizado ?? "0")));
    }
    for (const d of desembolsosRealizados) {
      const atual = saidasRealizadasPorMes.get(d.mes) ?? new Decimal(0);
      saidasRealizadasPorMes.set(d.mes, atual.plus(new Decimal(d.valorRealizado ?? "0")));
    }

    const entradasCorrigidasPorMes = new Map(resultado.entradasCorrigidas.map((e) => [e.mes, e.valor]));
    const saidasCorrigidasPorMes = new Map(resultado.saidasCorrigidas.map((s) => [s.mes, s.valor]));

    return {
      empreendimento: cenario.empreendimento.nome,
      cenario: cenario.nome,
      horizonteProjecaoMeses: cenario.horizonteProjecaoMeses,
      fluxo: resultado.fluxo.map((f) => ({
        mes: f.mes,
        entradas: f.entradas.toFixed(2),
        saidas: f.saidas.toFixed(2),
        fluxoMensal: f.fluxoMensal.toFixed(2),
        fluxoAcumulado: f.fluxoAcumulado.toFixed(2),
        entradasRealizadas: entradasRealizadasPorMes.get(f.mes)?.toFixed(2) ?? null,
        saidasRealizadas: saidasRealizadasPorMes.get(f.mes)?.toFixed(2) ?? null,
        entradasCorrigidas: (entradasCorrigidasPorMes.get(f.mes) ?? new Decimal(0)).toFixed(2),
        saidasCorrigidas: (saidasCorrigidasPorMes.get(f.mes) ?? new Decimal(0)).toFixed(2),
      })),
      indicadores: {
        necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
        mesPico: resultado.indicadores.mesPico,
        mesRecuperacao: resultado.indicadores.mesRecuperacao,
        mesRecuperacaoDescontado: resultado.indicadores.mesRecuperacaoDescontado,
        saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
        vpl: resultado.indicadores.vpl.toFixed(2),
        taxaDescontoMensal: taxaDescontoEfetiva(cenario),
        tir: formatarTir(resultado.indicadores.tir),
        margemLiquida: resultado.indicadores.margemLiquida?.toFixed(10) ?? null,
      },
      financiamento: resultado.financiamento.map((f) => ({
        mes: f.mes,
        liberacao: f.liberacao.toFixed(2),
        amortizacao: f.amortizacao.toFixed(2),
        saldoDevedor: f.saldoDevedor.toFixed(2),
      })),
      alertas: resultado.alertas,
    };
  });

  const EIXOS_SENSIBILIDADE: EixoSensibilidade[] = ["custo", "vgv", "velocidadeVendas"];
  const VARIACOES_PADRAO: Record<EixoSensibilidade, string[]> = {
    custo: ["-0.2", "-0.1", "0", "0.1", "0.2"],
    vgv: ["-0.2", "-0.1", "0", "0.1", "0.2"],
    velocidadeVendas: ["0", "1", "2", "3", "6"],
  };

  // Simulacao de sensibilidade: reroda o motor (ja existente, sem nenhuma
  // mudanca nele) com uma premissa perturbada, para cada variacao pedida.
  // Nunca persiste nada -- diferente de /fluxo-caixa, que roda o motor E
  // grava RecebimentoProjetado (achado F1), esta rota so le.
  app.get<{ Params: { cenarioId: string }; Querystring: { eixo?: string; variacoes?: string } }>(
    "/api/cenarios/:cenarioId/sensibilidade",
    async (req, reply) => {
      const { cenarioId } = req.params;
      const eixo = req.query.eixo ?? "custo";
      if (!EIXOS_SENSIBILIDADE.includes(eixo as EixoSensibilidade)) {
        reply.code(400);
        return { erro: `eixo deve ser um de: ${EIXOS_SENSIBILIDADE.join(", ")}` };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: cenarioId } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

      const variacoesStr = req.query.variacoes ? req.query.variacoes.split(",") : VARIACOES_PADRAO[eixo as EixoSensibilidade];
      let variacoes: Decimal[];
      try {
        variacoes = variacoesStr.map((v) => new Decimal(v.trim()));
      } catch {
        reply.code(400);
        return { erro: "variacoes deve ser uma lista de números separados por vírgula" };
      }

      const pontos = await calcularSensibilidadeCenario(cenarioId, eixo as EixoSensibilidade, variacoes);
      return pontos.map((p) => ({
        variacao: p.variacao.toString(),
        vpl: p.vpl.toFixed(2),
        necessidadeMaximaCapital: p.necessidadeMaximaCapital.toFixed(2),
        mesPico: p.mesPico,
      }));
    },
  );

  // Comparacao de cenarios derivados (achado F18, docs/DECISOES.md —
  // "versao de cenario" ganha comparacao real): roda o motor para o
  // cenario atual, o cenario do qual ele deriva (se houver) e todos os
  // seus derivados diretos -- so um nivel para cada lado, nao a arvore
  // inteira. Cada rodada persiste RecebimentoProjetado normalmente (mesmo
  // comportamento de /fluxo-caixa para cada cenario individualmente).
  app.get<{ Params: { id: string } }>("/api/cenarios/:id/comparacao", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({
      where: { id: req.params.id },
      include: {
        derivadoDe: { select: { id: true, nome: true, tipo: true } },
        derivados: { select: { id: true, nome: true, tipo: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const familia: { id: string; nome: string; tipo: string; relacao: "atual" | "original" | "derivado" }[] = [
      { id: cenario.id, nome: cenario.nome, tipo: cenario.tipo, relacao: "atual" },
      ...(cenario.derivadoDe ? [{ id: cenario.derivadoDe.id, nome: cenario.derivadoDe.nome, tipo: cenario.derivadoDe.tipo, relacao: "original" as const }] : []),
      ...cenario.derivados.map((d) => ({ id: d.id, nome: d.nome, tipo: d.tipo, relacao: "derivado" as const })),
    ];

    const versoes = await Promise.all(
      familia.map(async (f) => {
        const resultado = await rodarMotorParaCenario(f.id);
        return {
          id: f.id,
          nome: f.nome,
          tipo: f.tipo,
          relacao: f.relacao,
          necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
          mesPico: resultado.indicadores.mesPico,
          mesRecuperacao: resultado.indicadores.mesRecuperacao,
          vpl: resultado.indicadores.vpl.toFixed(2),
        };
      }),
    );

    return { versoes };
  });

  // Comparacao de N cenarios do mesmo empreendimento, escolhidos livremente
  // pelo usuario (Fase 2.4) -- diferente da comparacao de 1 nivel por
  // derivacao acima (achado F18): aqui nao ha restricao de
  // pai/filho-direto, o chamador escolhe qualquer subconjunto de cenarios
  // do mesmo empreendimento. Toda a agregacao (VGV, recebimentos, custos,
  // fluxo mensal, resumo de premissas) acontece em
  // montarComparacaoCenarios (src/db/servicoMotor.ts) -- esta rota so
  // parseia a querystring e delega. IDs que nao pertencam a este
  // empreendimento sao silenciosamente ignorados (R12).
  app.get<{ Params: { id: string }; Querystring: { ids?: string } }>("/api/empreendimentos/:id/cenarios/comparacao", async (req, reply) => {
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, empreendimento.id))) return;

    const cenarioIds = (req.query.ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (cenarioIds.length === 0) {
      reply.code(400);
      return { erro: "Informe ao menos um cenário em ?ids=" };
    }

    const cenarios = await montarComparacaoCenarios(empreendimento.id, cenarioIds);
    return { cenarios };
  });

  // Fase 2.5 — Relatorios (PDF/Excel), fonte unica de verdade
  // (docs/DECISOES.md, achado F34): montarDadosRelatorioViabilidade/
  // montarDadosRelatorioComparativo so agregam o que o motor/banco ja
  // produzem; gerarPdf*/gerarExcel* so formatam, nenhum calculo novo.
  // Leitura apenas -- Stakeholder (vinculo sempre "leitura") tem acesso
  // aos relatorios de qualquer empreendimento vinculado, como qualquer
  // outra rota GET.
  function parseIdsCsv(valor: string | undefined): string[] {
    return (valor ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
  function nomeArquivoBase(...partes: string[]): string {
    return partes
      .join("-")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/relatorios/viabilidade.pdf", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id }, include: { empreendimento: { select: { nome: true } } } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const dados = await montarDadosRelatorioViabilidade(cenario.id);
    const pdf = await gerarPdfViabilidade(dados);
    reply.header("Content-Disposition", `attachment; filename="relatorio-viabilidade-${nomeArquivoBase(cenario.empreendimento.nome, cenario.nome)}.pdf"`);
    reply.type("application/pdf");
    return pdf;
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/relatorios/viabilidade.xlsx", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id }, include: { empreendimento: { select: { nome: true } } } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const dados = await montarDadosRelatorioViabilidade(cenario.id);
    const excel = await gerarExcelViabilidade(dados);
    reply.header("Content-Disposition", `attachment; filename="relatorio-viabilidade-${nomeArquivoBase(cenario.empreendimento.nome, cenario.nome)}.xlsx"`);
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return excel;
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/relatorios/viabilidade-resumido.pdf", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id }, include: { empreendimento: { select: { nome: true } } } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const dados = await montarDadosRelatorioViabilidade(cenario.id);
    const pdf = await gerarPdfViabilidade(dados, { resumido: true });
    reply.header("Content-Disposition", `attachment; filename="relatorio-viabilidade-resumido-${nomeArquivoBase(cenario.empreendimento.nome, cenario.nome)}.pdf"`);
    reply.type("application/pdf");
    return pdf;
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/relatorios/viabilidade-resumido.xlsx", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id }, include: { empreendimento: { select: { nome: true } } } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;

    const dados = await montarDadosRelatorioViabilidade(cenario.id);
    const excel = await gerarExcelViabilidade(dados, { resumido: true });
    reply.header("Content-Disposition", `attachment; filename="relatorio-viabilidade-resumido-${nomeArquivoBase(cenario.empreendimento.nome, cenario.nome)}.xlsx"`);
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return excel;
  });

  app.get<{ Params: { id: string }; Querystring: { ids?: string } }>("/api/empreendimentos/:id/relatorios/comparacao.pdf", async (req, reply) => {
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
    const cenarioIds = parseIdsCsv(req.query.ids);
    if (cenarioIds.length === 0) {
      reply.code(400);
      return { erro: "Informe ao menos um cenário em ?ids=" };
    }

    const dados = await montarDadosRelatorioComparativo(empreendimento.id, cenarioIds);
    const pdf = await gerarPdfComparativo(dados);
    reply.header("Content-Disposition", `attachment; filename="relatorio-comparativo-${nomeArquivoBase(empreendimento.nome)}.pdf"`);
    reply.type("application/pdf");
    return pdf;
  });

  app.get<{ Params: { id: string }; Querystring: { ids?: string } }>("/api/empreendimentos/:id/relatorios/comparacao.xlsx", async (req, reply) => {
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, empreendimento.id))) return;
    const cenarioIds = parseIdsCsv(req.query.ids);
    if (cenarioIds.length === 0) {
      reply.code(400);
      return { erro: "Informe ao menos um cenário em ?ids=" };
    }

    const dados = await montarDadosRelatorioComparativo(empreendimento.id, cenarioIds);
    const excel = await gerarExcelComparativo(dados);
    reply.header("Content-Disposition", `attachment; filename="relatorio-comparativo-${nomeArquivoBase(empreendimento.nome)}.xlsx"`);
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return excel;
  });

  return app;
}
