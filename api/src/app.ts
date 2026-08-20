import cors from "@fastify/cors";
import { Decimal } from "decimal.js";
import Fastify from "fastify";
import {
  atualizarCenario,
  atualizarEmpreendimento,
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
  desfazerPermuta,
  excluirCenario,
  excluirEmpreendimento,
  excluirTipologia,
  registrarPermuta,
  type ModalidadeInput,
} from "../../src/db/cadastro.js";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { rodarMotorParaCenario } from "../../src/db/servicoMotor.js";

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
  await app.register(cors, { origin: true });

  app.get("/api/empreendimentos", async () => {
    const empreendimentos = await prisma.empreendimento.findMany({
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
    reply.code(201);
    return empreendimento;
  });

  app.get<{ Params: { id: string } }>("/api/empreendimentos/:id", async (req, reply) => {
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
        cenarios: { orderBy: { createdAt: "asc" } },
        categoriasCusto: { orderBy: { nome: "asc" } },
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
      cenarios: empreendimento.cenarios.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        horizonteProjecaoMeses: c.horizonteProjecaoMeses,
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
          modalidades: cp.modalidades.map((m) => ({ nome: m.nome, percentual: m.percentual, tipoDistribuicao: m.tipoDistribuicao })),
        })),
      })),
    };
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
      return atualizarEmpreendimento(req.params.id, { nome: nome?.trim(), incorporador, endereco });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/empreendimentos/:id", async (req, reply) => {
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
    const unidades = await prisma.unidade.findMany({
      where: { tipologiaId: req.params.id },
      include: { permuta: true },
      orderBy: [{ andar: "asc" }, { numero: "asc" }],
    });
    return unidades.map((u) => ({
      id: u.id,
      numero: u.numero,
      andar: u.andar,
      areaPrivativa: u.areaPrivativa,
      precoVenda: u.precoVenda,
      status: u.status,
      permuta: u.permuta ? { id: u.permuta.id, nomeContraparte: u.permuta.nomeContraparte, documento: u.permuta.documento, valorAtribuido: u.permuta.valorAtribuido } : null,
    }));
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

  app.delete<{ Params: { id: string } }>("/api/unidades/:id/permuta", async (req, reply) => {
    const erro = await desfazerPermuta(req.params.id);
    if (erro) {
      reply.code(404);
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
      return atualizarTipologia(req.params.id, { nome: nome?.trim(), areaPrivativaPadrao, precoUnitarioPadrao });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/tipologias/:id", async (req, reply) => {
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
      const categoria = await criarCategoriaCusto({
        empreendimentoId: req.params.id,
        nome: nome.trim(),
        tipoIncidencia: tipoIncidencia as "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao",
      });
      reply.code(201);
      return categoria;
    },
  );

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
        _count: { select: { vendas: true } },
      },
    });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
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
      return atualizarCenario(req.params.id, { nome: nome?.trim(), horizonteProjecaoMeses });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/cenarios/:id", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
    await excluirCenario(req.params.id);
    reply.code(204);
    return null;
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

  app.patch<{ Params: { id: string }; Body: { valorRealizado?: string } }>("/api/custos/:id", async (req, reply) => {
    const { valorRealizado } = req.body ?? {};
    if (!valorRealizado || !valorRealizado.trim()) {
      reply.code(400);
      return { erro: "Valor realizado é obrigatório" };
    }
    const custo = await prisma.custo.findUnique({ where: { id: req.params.id }, include: { categoria: true } });
    if (!custo) {
      reply.code(404);
      return { erro: "Custo não encontrado" };
    }
    if (custo.categoria.tipoIncidencia !== "fixo") {
      reply.code(400);
      return {
        erro:
          "Só é possível registrar valor realizado para custos de incidência fixa (com mês de competência definido) — custos percentuais são recalculados pelo motor a cada mês, sem uma única linha para marcar",
      };
    }
    return prisma.custo.update({ where: { id: req.params.id }, data: { valorRealizado: valorRealizado.trim(), status: "realizado" } });
  });

  app.get<{ Params: { id: string } }>("/api/cenarios/:id/recebimentos", async (req, reply) => {
    const cenario = await prisma.cenario.findUnique({ where: { id: req.params.id } });
    if (!cenario) {
      reply.code(404);
      return { erro: "Cenário não encontrado" };
    }
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

  app.patch<{ Params: { id: string }; Body: { valorRealizado?: string; status?: string } }>(
    "/api/recebimentos/:id",
    async (req, reply) => {
      const { valorRealizado, status } = req.body ?? {};
      if (!valorRealizado || !valorRealizado.trim()) {
        reply.code(400);
        return { erro: "Valor realizado é obrigatório" };
      }
      const tiposValidos = ["recebido", "atrasado"];
      if (status !== undefined && !tiposValidos.includes(status)) {
        reply.code(400);
        return { erro: `Status deve ser um de: ${tiposValidos.join(", ")}` };
      }
      const recebimento = await prisma.recebimentoProjetado.findUnique({ where: { id: req.params.id } });
      if (!recebimento) {
        reply.code(404);
        return { erro: "Recebimento não encontrado" };
      }
      return prisma.recebimentoProjetado.update({
        where: { id: req.params.id },
        data: { valorRealizado: valorRealizado.trim(), status: status ?? "recebido" },
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
      })),
      indicadores: {
        necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
        mesPico: resultado.indicadores.mesPico,
        mesRecuperacao: resultado.indicadores.mesRecuperacao,
        saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
        vpl: resultado.indicadores.vpl.toFixed(2),
      },
    };
  });

  return app;
}
