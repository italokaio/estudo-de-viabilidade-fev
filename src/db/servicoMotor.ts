import { Decimal } from "decimal.js";
import { executarMotorFinanceiro, type SaidaMotorFinanceiro } from "../core/motorFinanceiro.js";
import type { CondicaoPagamento, CustoInput, PontoCronograma, TipoDistribuicao, TipoIncidenciaCusto, VendaInput } from "../core/types.js";
import { prisma } from "./client.js";

/**
 * Fronteira entre banco e motor puro: le Venda/Custo/CronogramaFisicoFinanceiro
 * do cenario, converte para os tipos de src/core (string -> Decimal), roda o
 * pipeline determinístico, e persiste apenas RecebimentoProjetado — nunca um
 * MovimentoCaixa (achado F1): o fluxo de caixa em si nao e gravado em
 * lugar nenhum, e sempre recalculado por quem chamar esta funcao.
 */
export async function rodarMotorParaCenario(
  cenarioId: string,
  opcoes: { taxaDescontoMensal?: string } = {},
): Promise<SaidaMotorFinanceiro> {
  const cenario = await prisma.cenario.findUniqueOrThrow({ where: { id: cenarioId } });

  const vendasDb = await prisma.venda.findMany({
    where: { cenarioId, status: "ativa" },
    include: { condicaoPagamento: { include: { modalidades: true } } },
  });

  const vendas: VendaInput[] = vendasDb.map((v) => ({
    id: v.id,
    unidadeId: v.unidadeId,
    mesOrigem: v.mesOrigem,
    valorVenda: new Decimal(v.valorVenda),
    condicaoPagamento: mapCondicao(v.condicaoPagamento),
  }));

  const custosDb = await prisma.custo.findMany({
    where: { cenarioId },
    include: { categoria: true },
  });

  const custos: CustoInput[] = custosDb.map((c) => ({
    id: c.id,
    categoriaNome: c.categoria.nome,
    tipoIncidencia: c.categoria.tipoIncidencia as TipoIncidenciaCusto,
    valorPrevisto: c.valorPrevisto ? new Decimal(c.valorPrevisto) : undefined,
    percentual: c.percentual ? new Decimal(c.percentual) : undefined,
    competenciaMes: c.competenciaMes ?? undefined,
    recorrencia: c.recorrencia as "unico" | "mensal",
    participaFluxoCaixa: c.participaFluxoCaixa,
  }));

  const cronogramaDb = await prisma.cronogramaFisicoFinanceiro.findMany({
    where: { cenarioId },
    orderBy: { mes: "asc" },
  });
  const cronograma: PontoCronograma[] = cronogramaDb.map((p) => ({
    mes: p.mes,
    percentualExecucaoMensal: new Decimal(p.percentualExecucaoMensal),
  }));

  const resultado = executarMotorFinanceiro({
    vendas,
    custos,
    cronograma,
    horizonteMeses: cenario.horizonteProjecaoMeses,
    taxaDescontoMensal: new Decimal(opcoes.taxaDescontoMensal ?? "0"),
  });

  await persistirRecebimentos(cenarioId, resultado);

  return resultado;
}

async function persistirRecebimentos(cenarioId: string, resultado: SaidaMotorFinanceiro) {
  const vendaIds = (await prisma.venda.findMany({ where: { cenarioId }, select: { id: true } })).map((v) => v.id);

  // idempotente: recalcular um cenario sempre substitui os recebimentos anteriores.
  await prisma.recebimentoProjetado.deleteMany({ where: { vendaId: { in: vendaIds } } });

  if (resultado.recebimentos.length === 0) return;

  await prisma.recebimentoProjetado.createMany({
    data: resultado.recebimentos.map((r) => ({
      vendaId: r.vendaId,
      modalidadeId: r.modalidadeId,
      mesCompetencia: r.mesCompetencia,
      valorPrevisto: r.valorPrevisto.toString(),
      status: "previsto",
    })),
  });
}

function mapCondicao(condicaoDb: {
  id: string;
  nome: string;
  modalidades: {
    id: string;
    nome: string;
    percentual: string;
    tipoDistribuicao: string;
    periodicidadeMeses: number | null;
    mesFixo: number | null;
    repeticoesSobreTotal: number;
    geraEventoParcial: boolean;
    ordem: number;
  }[];
}): CondicaoPagamento {
  return {
    id: condicaoDb.id,
    nome: condicaoDb.nome,
    modalidades: condicaoDb.modalidades.map((m) => ({
      id: m.id,
      nome: m.nome,
      percentual: new Decimal(m.percentual),
      tipoDistribuicao: m.tipoDistribuicao as TipoDistribuicao,
      periodicidadeMeses: m.periodicidadeMeses ?? undefined,
      mesFixo: m.mesFixo ?? undefined,
      repeticoesSobreTotal: m.repeticoesSobreTotal,
      geraEventoParcial: m.geraEventoParcial,
      ordem: m.ordem,
    })),
  };
}
