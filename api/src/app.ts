import cors from "@fastify/cors";
import Fastify from "fastify";
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
