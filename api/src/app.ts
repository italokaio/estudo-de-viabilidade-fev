import cors from "@fastify/cors";
import Fastify from "fastify";
import { criarEmpreendimento, criarTipologia, criarUnidadesEmLote } from "../../src/db/cadastro.js";
import { prisma } from "../../src/db/client.js";
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
      include: { tipologias: { include: { _count: { select: { unidades: true } } }, orderBy: { createdAt: "asc" } } },
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
      tipologias: empreendimento.tipologias.map((t) => ({
        id: t.id,
        nome: t.nome,
        areaPrivativaPadrao: t.areaPrivativaPadrao,
        precoUnitarioPadrao: t.precoUnitarioPadrao,
        quantidadeUnidades: t._count.unidades,
      })),
    };
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
