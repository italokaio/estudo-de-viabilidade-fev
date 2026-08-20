import { Decimal } from "decimal.js";
import { executarMotorFinanceiro, type SaidaMotorFinanceiro } from "../core/motorFinanceiro.js";
import type { CondicaoPagamento, CustoInput, PontoCronograma, PontoIndiceCorrecao, TipoDistribuicao, TipoIncidenciaCusto, VendaInput } from "../core/types.js";
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

  const indicesDb = await prisma.indiceCorrecao.findMany({ where: { cenarioId }, orderBy: { mes: "asc" } });
  const indiceCorrecao: PontoIndiceCorrecao[] = indicesDb.map((i) => ({ mes: i.mes, percentual: new Decimal(i.percentual) }));

  const resultado = executarMotorFinanceiro({
    vendas,
    custos,
    cronograma,
    horizonteMeses: cenario.horizonteProjecaoMeses,
    taxaDescontoMensal: new Decimal(opcoes.taxaDescontoMensal ?? "0"),
    indiceCorrecao,
  });

  await persistirRecebimentos(cenarioId, resultado);

  return resultado;
}

async function persistirRecebimentos(cenarioId: string, resultado: SaidaMotorFinanceiro) {
  const vendaIds = (await prisma.venda.findMany({ where: { cenarioId }, select: { id: true } })).map((v) => v.id);

  // Recalcular um cenario sempre atualiza o "previsto" -- mas nunca pode
  // apagar um valorRealizado ja registrado (dado real, nao derivavel pelo
  // motor), nem trocar o id de uma linha que uma tela ja tem referenciada
  // (ver achado sobre realizado x projetado, docs/DECISOES.md). Por isso
  // upsert pela chave (vendaId, modalidadeId, mesCompetencia) -- que o
  // motor garante unica por venda (src/core/motorRecebimentos.ts) -- em vez
  // de delete+recreate. Em lote (createMany/deleteMany) sempre que possivel:
  // um cenario real tem centenas de vendas, e um upsert por linha e lento
  // demais para rodar a cada carregamento da tela.
  const existentes = await prisma.recebimentoProjetado.findMany({
    where: { vendaId: { in: vendaIds } },
    select: { id: true, vendaId: true, modalidadeId: true, mesCompetencia: true, valorPrevisto: true },
  });
  const existentePorChave = new Map(existentes.map((e) => [`${e.vendaId}|${e.modalidadeId}|${e.mesCompetencia}`, e]));

  const chavesNovas = new Set(resultado.recebimentos.map((r) => `${r.vendaId}|${r.modalidadeId}|${r.mesCompetencia}`));
  const idsObsoletos = existentes.filter((e) => !chavesNovas.has(`${e.vendaId}|${e.modalidadeId}|${e.mesCompetencia}`)).map((e) => e.id);
  if (idsObsoletos.length > 0) {
    await prisma.recebimentoProjetado.deleteMany({ where: { id: { in: idsObsoletos } } });
  }

  const aCriar = resultado.recebimentos.filter((r) => !existentePorChave.has(`${r.vendaId}|${r.modalidadeId}|${r.mesCompetencia}`));
  if (aCriar.length > 0) {
    await prisma.recebimentoProjetado.createMany({
      data: aCriar.map((r) => ({
        vendaId: r.vendaId,
        modalidadeId: r.modalidadeId,
        mesCompetencia: r.mesCompetencia,
        valorPrevisto: r.valorPrevisto.toString(),
      })),
    });
  }

  // so atualiza as linhas cujo previsto realmente mudou (ex.: condicao de
  // pagamento editada apos a venda) -- no caso comum (nada mudou) isto e zero updates.
  const aAtualizar = resultado.recebimentos.filter((r) => {
    const existente = existentePorChave.get(`${r.vendaId}|${r.modalidadeId}|${r.mesCompetencia}`);
    return existente && existente.valorPrevisto !== r.valorPrevisto.toString();
  });
  for (const r of aAtualizar) {
    const existente = existentePorChave.get(`${r.vendaId}|${r.modalidadeId}|${r.mesCompetencia}`)!;
    await prisma.recebimentoProjetado.update({ where: { id: existente.id }, data: { valorPrevisto: r.valorPrevisto.toString() } });
  }
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
