import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { Decimal } from "decimal.js";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  atualizarCategoriaCusto,
  atualizarCenario,
  atualizarCondicaoPagamento,
  atualizarCusto,
  atualizarEmpreendimento,
  atualizarPermuta,
  atualizarTipologia,
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCronograma,
  criarCusto,
  criarEmpreendimento,
  criarPremissaVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
  criarUnidadesPorAndar,
  definirFinanciamento,
  definirPontoIndiceCorrecao,
  definirTerreno,
  desfazerDistrato,
  desfazerPermuta,
  duplicarCenario,
  excluirCategoriaCusto,
  excluirCenario,
  excluirCondicaoPagamento,
  excluirCronograma,
  excluirCusto,
  excluirEmpreendimento,
  excluirFinanciamento,
  excluirPontoIndiceCorrecao,
  excluirTipologia,
  registrarDistrato,
  registrarPermuta,
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
  temAcessoEmpreendimento,
  validarSessao,
  vincularUsuarioEmpreendimento,
} from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { calcularSensibilidadeCenario, rodarMotorParaCenario } from "../../src/db/servicoMotor.js";
import type { EixoSensibilidade } from "../../src/core/motorSensibilidade.js";

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
async function garantirAcesso(req: FastifyRequest, reply: FastifyReply, empreendimentoId: string | null): Promise<boolean> {
  if (empreendimentoId === null) return true;
  if (await temAcessoEmpreendimento(req.usuario!, empreendimentoId)) return true;
  reply.code(404);
  reply.send({ erro: "Empreendimento não encontrado" });
  return false;
}

/**
 * API — casca fina sobre o motor da Fase 0. Nenhuma regra de negocio vive
 * aqui: toda rota apenas le do banco e/ou chama rodarMotorParaCenario().
 * O motor em si (src/core) continua sem nenhuma dependencia desta camada.
 *
 * Exportado separado de server.ts para poder ser testado com app.inject()
 * (Fastify) sem precisar abrir uma porta real.
 */
export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

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

  app.post<{ Body: { email?: string; senha?: string } }>("/api/auth/login", async (req, reply) => {
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
  });

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
    if (papel !== undefined && papel !== "admin" && papel !== "usuario") {
      reply.code(400);
      return { erro: "Papel deve ser 'admin' ou 'usuario'" };
    }
    try {
      const usuario = await criarUsuario({ email: email.trim(), nome: nome.trim(), senha, papel: papel as "admin" | "usuario" | undefined });
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

  app.get<{ Params: { id: string } }>("/api/usuarios/:id/empreendimentos", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem ver vínculos de acesso" };
    }
    return listarEmpreendimentosDoUsuario(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: { empreendimentoId?: string } }>("/api/usuarios/:id/empreendimentos", async (req, reply) => {
    if (req.usuario!.papel !== "admin") {
      reply.code(403);
      return { erro: "Apenas administradores podem gerenciar vínculos de acesso" };
    }
    const { empreendimentoId } = req.body ?? {};
    if (!empreendimentoId) {
      reply.code(400);
      return { erro: "empreendimentoId é obrigatório" };
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) {
      reply.code(404);
      return { erro: "Usuário não encontrado" };
    }
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: empreendimentoId } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    await vincularUsuarioEmpreendimento(req.params.id, empreendimentoId);
    reply.code(201);
    return listarEmpreendimentosDoUsuario(req.params.id);
  });

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
    return empreendimentos;
  });

  app.post<{ Body: { nome?: string; incorporador?: string; endereco?: string } }>("/api/empreendimentos", async (req, reply) => {
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
        terreno: true,
      },
    });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    return {
      id: empreendimento.id,
      nome: empreendimento.nome,
      incorporador: empreendimento.incorporador,
      endereco: empreendimento.endereco,
      terreno: empreendimento.terreno
        ? {
            areaValor: empreendimento.terreno.areaValor,
            areaUnidade: empreendimento.terreno.areaUnidade,
            areaStatusValidacao: empreendimento.terreno.areaStatusValidacao,
            areaObservacao: empreendimento.terreno.areaObservacao,
            formaAquisicao: empreendimento.terreno.formaAquisicao,
          }
        : null,
      cenarios: empreendimento.cenarios.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        horizonteProjecaoMeses: c.horizonteProjecaoMeses,
        derivadoDeNome: c.derivadoDe?.nome ?? null,
      })),
      categoriasCusto: empreendimento.categoriasCusto.map((cc) => ({ id: cc.id, nome: cc.nome, tipoIncidencia: cc.tipoIncidencia })),
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
            repeticoesSobreTotal: m.repeticoesSobreTotal,
            geraEventoParcial: m.geraEventoParcial,
          })),
        })),
      })),
    };
  });

  app.post<{
    Params: { id: string };
    Body: {
      areaValor?: string | null;
      areaUnidade?: string;
      areaStatusValidacao?: "pendente" | "validado" | "conflitante";
      areaObservacao?: string | null;
      formaAquisicao?: "compra" | "permuta" | "misto" | null;
    };
  }>("/api/empreendimentos/:id/terreno", async (req, reply) => {
    if (!(await garantirAcesso(req, reply, req.params.id))) return;
    const empreendimento = await prisma.empreendimento.findUnique({ where: { id: req.params.id } });
    if (!empreendimento) {
      reply.code(404);
      return { erro: "Empreendimento não encontrado" };
    }
    const { areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao } = req.body ?? {};
    const terreno = await definirTerreno(req.params.id, { areaValor, areaUnidade, areaStatusValidacao, areaObservacao, formaAquisicao });
    reply.code(200);
    return terreno;
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
      include: { permuta: true, vendas: { orderBy: { createdAt: "desc" }, take: 1, include: { distrato: true } } },
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
        permuta: u.permuta ? { id: u.permuta.id, nomeContraparte: u.permuta.nomeContraparte, documento: u.permuta.documento, valorAtribuido: u.permuta.valorAtribuido } : null,
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
    const resultado = await registrarPermuta({
      unidadeId: req.params.id,
      nomeContraparte: nomeContraparte.trim(),
      documento,
      valorAtribuido,
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
    const resultado = await atualizarPermuta(req.params.id, {
      nomeContraparte: nomeContraparte?.trim(),
      documento,
      valorAtribuido,
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

  // Distrato (achado F7, docs/DECISOES.md): cancela uma venda. O motor ja
  // filtra vendas por status="ativa" (src/db/servicoMotor.ts), entao marcar
  // a venda como "distratada" e suficiente -- nenhuma rota de fluxo de
  // caixa precisou mudar.
  app.post<{ Params: { id: string }; Body: { percentualRetencao?: string; motivo?: string } }>(
    "/api/vendas/:id/distrato",
    async (req, reply) => {
      const { percentualRetencao, motivo } = req.body ?? {};
      const venda = await prisma.venda.findUnique({ where: { id: req.params.id } });
      if (!venda) {
        reply.code(404);
        return { erro: "Venda não encontrada" };
      }
      if (!(await garantirAcesso(req, reply, venda.empreendimentoId))) return;
      const resultado = await registrarDistrato({ vendaId: req.params.id, percentualRetencao, motivo });
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

  app.post<{ Params: { id: string }; Body: { nome?: string; tipoIncidencia?: string } }>(
    "/api/empreendimentos/:id/categorias-custo",
    async (req, reply) => {
      const { nome, tipoIncidencia } = req.body ?? {};
      const tiposValidos = ["fixo", "pct_vgv_vendido_no_mes", "pct_recebido_mes_anterior", "pct_execucao"];
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
        tipoIncidencia: tipoIncidencia as "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao",
      });
      reply.code(201);
      return categoria;
    },
  );

  app.patch<{ Params: { id: string }; Body: { nome?: string; tipoIncidencia?: string } }>(
    "/api/categorias-custo/:id",
    async (req, reply) => {
      const { nome, tipoIncidencia } = req.body ?? {};
      const tiposValidos = ["fixo", "pct_vgv_vendido_no_mes", "pct_recebido_mes_anterior", "pct_execucao"];
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
        tipoIncidencia: tipoIncidencia as "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao" | undefined,
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
      try {
        const condicao = await criarCondicaoPagamento({
          empreendimentoId: tipologia.empreendimentoId,
          tipologiaId: tipologia.id,
          nome: nome.trim(),
          modalidades,
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
      const resultado = await atualizarCondicaoPagamento(req.params.id, { nome: nome?.trim(), modalidades });
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
            categoriasCusto: { select: { id: true, nome: true, tipoIncidencia: true } },
          },
        },
        premissasVelocidade: { include: { tipologia: { select: { nome: true } } }, orderBy: { mes: "asc" } },
        custos: { include: { categoria: true }, orderBy: { createdAt: "asc" } },
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
      custos: cenario.custos.map((c) => ({
        id: c.id,
        categoriaNome: c.categoria.nome,
        tipoIncidencia: c.categoria.tipoIncidencia,
        valorPrevisto: c.valorPrevisto,
        percentual: c.percentual,
        competenciaMes: c.competenciaMes,
        recorrencia: c.recorrencia,
        valorRealizado: c.valorRealizado,
        status: c.status,
      })),
      cronograma: cenario.cronograma.map((p) => ({ mes: p.mes, percentualExecucaoMensal: p.percentualExecucaoMensal })),
      indicesCorrecao: cenario.indicesCorrecao.map((i) => ({ mes: i.mes, percentual: i.percentual })),
      financiamento: cenario.financiamento
        ? {
            valorContratado: cenario.financiamento.valorContratado,
            taxaJurosMensal: cenario.financiamento.taxaJurosMensal,
            mesAmortizacao: cenario.financiamento.mesAmortizacao,
          }
        : null,
      totalVendasGeradas: cenario._count.vendas,
    };
  });

  app.patch<{ Params: { id: string }; Body: { nome?: string; horizonteProjecaoMeses?: number } }>(
    "/api/cenarios/:id",
    async (req, reply) => {
      const { nome, horizonteProjecaoMeses } = req.body ?? {};
      if (nome !== undefined && !nome.trim()) {
        reply.code(400);
        return { erro: "Nome do cenário não pode ficar vazio" };
      }
      if (horizonteProjecaoMeses !== undefined && (horizonteProjecaoMeses < 1 || !Number.isInteger(horizonteProjecaoMeses))) {
        reply.code(400);
        return { erro: "Horizonte de projeção deve ser um número inteiro de meses maior que zero" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      return atualizarCenario(req.params.id, { nome: nome?.trim(), horizonteProjecaoMeses });
    },
  );

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
    Body: { categoriaId?: string; valorPrevisto?: string; percentual?: string; competenciaMes?: number; recorrencia?: string };
  }>("/api/cenarios/:id/custos", async (req, reply) => {
    const { categoriaId, valorPrevisto, percentual, competenciaMes, recorrencia } = req.body ?? {};
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
    if (incidenciaPorValor && (!valorPrevisto || !valorPrevisto.trim())) {
      reply.code(400);
      return { erro: "Valor previsto é obrigatório para esta categoria de custo" };
    }
    if (!incidenciaPorValor && (!percentual || !percentual.trim())) {
      reply.code(400);
      return { erro: "Percentual é obrigatório para esta categoria de custo" };
    }
    if (categoria.tipoIncidencia === "fixo" && (!competenciaMes || competenciaMes < 1)) {
      reply.code(400);
      return { erro: "Mês de competência é obrigatório para custo fixo" };
    }
    const custo = await criarCusto({
      empreendimentoId: cenario.empreendimentoId,
      cenarioId: cenario.id,
      categoriaId,
      valorPrevisto: incidenciaPorValor ? valorPrevisto : undefined,
      percentual: incidenciaPorValor ? undefined : percentual,
      competenciaMes: categoria.tipoIncidencia === "fixo" ? competenciaMes : undefined,
      recorrencia: (recorrencia as "unico" | "mensal") ?? "unico",
    });
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
    await excluirCusto(req.params.id);
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
      try {
        await criarCronograma({ empreendimentoId: cenario.empreendimentoId, cenarioId: cenario.id, pontos });
        reply.code(201);
        return { criados: pontos.length };
      } catch (e: any) {
        reply.code(400);
        return { erro: String(e.message ?? e) };
      }
    },
  );

  // Indice de correcao monetaria (achado F6, docs/DECISOES.md): ao contrario
  // do cronograma, cada mes e independente (sem soma obrigatoria) -- upsert
  // por mes em vez de "criar tudo de uma vez", para o usuario poder
  // completar a serie aos poucos conforme novos indices sao divulgados.
  app.post<{ Params: { id: string }; Body: { mes?: number; percentual?: string } }>(
    "/api/cenarios/:id/indices-correcao",
    async (req, reply) => {
      const { mes, percentual } = req.body ?? {};
      if (mes === undefined || !Number.isInteger(mes) || mes < 1) {
        reply.code(400);
        return { erro: "mês deve ser um número inteiro maior ou igual a 1" };
      }
      if (percentual === undefined || !percentual.trim() || Number.isNaN(Number(percentual))) {
        reply.code(400);
        return { erro: "percentual é obrigatório e deve ser numérico" };
      }
      const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
      if (!cenario) {
        reply.code(404);
        return { erro: "Cenário não encontrado" };
      }
      if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
      const ponto = await definirPontoIndiceCorrecao({ empreendimentoId: cenario.empreendimentoId, cenarioId: cenario.id, mes, percentual: percentual.trim() });
      reply.code(201);
      return ponto;
    },
  );

  app.delete<{ Params: { id: string; mes: string } }>("/api/cenarios/:id/indices-correcao/:mes", async (req, reply) => {
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
    await excluirPontoIndiceCorrecao(cenario.id, Number(req.params.mes));
    reply.code(204);
    return null;
  });

  // Financiamento de producao (achado F8, docs/DECISOES.md): diferente de
  // indice de correcao/sensibilidade, isto MUDA o fluxo de caixa de
  // verdade -- liberacoes e amortizacao entram na consolidacao real
  // (src/core/motorFinanceiro.ts). Upsert, um financiamento por cenario.
  app.post<{ Params: { id: string }; Body: { valorContratado?: string; taxaJurosMensal?: string; mesAmortizacao?: number } }>(
    "/api/cenarios/:id/financiamento",
    async (req, reply) => {
      const { valorContratado, taxaJurosMensal, mesAmortizacao } = req.body ?? {};
      if (!valorContratado || !valorContratado.trim() || Number.isNaN(Number(valorContratado))) {
        reply.code(400);
        return { erro: "valorContratado é obrigatório e deve ser numérico" };
      }
      if (!taxaJurosMensal || !taxaJurosMensal.trim() || Number.isNaN(Number(taxaJurosMensal))) {
        reply.code(400);
        return { erro: "taxaJurosMensal é obrigatório e deve ser numérico" };
      }
      if (mesAmortizacao === undefined || !Number.isInteger(mesAmortizacao) || mesAmortizacao < 1) {
        reply.code(400);
        return { erro: "mesAmortizacao deve ser um número inteiro maior ou igual a 1" };
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
        valorContratado: valorContratado.trim(),
        taxaJurosMensal: taxaJurosMensal.trim(),
        mesAmortizacao,
      });
      reply.code(200);
      return financiamento;
    },
  );

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
    };
  }>("/api/custos/:id", async (req, reply) => {
    const { valorRealizado, valorPrevisto, percentual, competenciaMes, recorrencia, estornar } = req.body ?? {};
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

    return atualizarCusto(req.params.id, { valorPrevisto, percentual, competenciaMes, recorrencia });
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/recebimentos", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    if (!(await garantirAcesso(req, reply, cenario.empreendimentoId))) return;
    const recebimentos = await prisma.recebimentoProjetado.findMany({
      where: { venda: { cenarioId: req.params.id } },
      include: { venda: { include: { unidade: { select: { numero: true } } } }, modalidade: { select: { nome: true } } },
      orderBy: [{ mesCompetencia: "asc" }],
    });
    return recebimentos.map((r) => ({
      id: r.id,
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
      await criarPremissaVelocidade(
        itens.map((item) => ({
          empreendimentoId: cenario.empreendimentoId,
          cenarioId: cenario.id,
          tipologiaId: item.tipologiaId,
          mes: item.mes,
          unidadesPrevistas: item.unidadesPrevistas,
        })),
      );
      reply.code(201);
      return { criadas: itens.length };
    },
  );

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

    const resultado = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });

    // "Realizado" nunca passa pelo motor (que so conhece "previsto") -- e uma
    // camada de leitura por cima, somando RecebimentoProjetado.valorRealizado
    // e Custo.valorRealizado (so custos fixos, que tem um mes de competencia
    // unico; custos percentuais sao recalculados pelo motor a cada mes, sem
    // uma linha por mes para marcar como realizada).
    const recebimentosRealizados = await prisma.recebimentoProjetado.findMany({
      where: { venda: { cenarioId }, status: "recebido" },
      select: { mesCompetencia: true, valorRealizado: true },
    });
    const custosRealizados = await prisma.custo.findMany({
      where: { cenarioId, status: "realizado", competenciaMes: { not: null } },
      select: { competenciaMes: true, valorRealizado: true },
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

    const entradasCorrigidasPorMes = new Map(resultado.entradasCorrigidas.map((e) => [e.mes, e.valor]));

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
      })),
      indicadores: {
        necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
        mesPico: resultado.indicadores.mesPico,
        mesRecuperacao: resultado.indicadores.mesRecuperacao,
        saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
        vpl: resultado.indicadores.vpl.toFixed(2),
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

      const pontos = await calcularSensibilidadeCenario(cenarioId, eixo as EixoSensibilidade, variacoes, { taxaDescontoMensal: "0.005" });
      return pontos.map((p) => ({
        variacao: p.variacao.toString(),
        vpl: p.vpl.toFixed(2),
        necessidadeMaximaCapital: p.necessidadeMaximaCapital.toFixed(2),
        mesPico: p.mesPico,
      }));
    },
  );

  return app;
}
