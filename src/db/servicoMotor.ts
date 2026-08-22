import { Decimal } from "decimal.js";
import type { FinanciamentoInput } from "../core/motorFinanciamento.js";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro, type SaidaMotorFinanceiro } from "../core/motorFinanceiro.js";
import { calcularSensibilidade, type EixoSensibilidade, type PontoSensibilidade } from "../core/motorSensibilidade.js";
import type { CondicaoPagamento, CustoInput, PontoCronograma, PontoIndiceCorrecao, TipoDistribuicao, TipoIncidenciaCusto, VendaInput } from "../core/types.js";
import { prisma } from "./client.js";

/**
 * Fronteira entre banco e motor puro: le Venda/Custo/CronogramaFisicoFinanceiro
 * do cenario e converte para os tipos de src/core (string -> Decimal).
 * Reaproveitada tanto pelo recalculo normal (rodarMotorParaCenario) quanto
 * pela simulacao de sensibilidade (calcularSensibilidadeCenario) — as duas
 * partem da mesma entrada real do cenario, so a sensibilidade perturba uma
 * copia antes de rodar o motor.
 */
async function montarEntradaMotor(cenarioId: string, opcoes: { taxaDescontoMensal?: string } = {}): Promise<EntradaMotorFinanceiro> {
  const cenario = await prisma.cenario.findUniqueOrThrow({ where: { id: cenarioId } });

  const vendasDb = await prisma.venda.findMany({
    where: { cenarioId, status: "ativa" },
    include: { condicaoPagamento: { include: { modalidades: true } }, unidade: { select: { tipologiaId: true } } },
  });

  const vendas: VendaInput[] = vendasDb.map((v) => ({
    id: v.id,
    unidadeId: v.unidadeId,
    tipologiaId: v.unidade.tipologiaId,
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
    tipologiaId: c.tipologiaId ?? undefined,
    grupoIndiceCorrecao: c.grupoIndiceCorrecao,
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
  const indiceCorrecao: PontoIndiceCorrecao[] = indicesDb.map((i) => ({ mes: i.mes, percentual: new Decimal(i.percentual), grupo: i.grupo }));

  const financiamentoDb = await prisma.financiamentoProducao.findUnique({ where: { cenarioId } });
  const financiamento: FinanciamentoInput | undefined = financiamentoDb
    ? {
        valorContratado: new Decimal(financiamentoDb.valorContratado),
        taxaJurosMensal: new Decimal(financiamentoDb.taxaJurosMensal),
        mesAmortizacao: financiamentoDb.mesAmortizacao,
        tipoAmortizacao: financiamentoDb.tipoAmortizacao as "unico" | "sac" | "price",
        numeroParcelas: financiamentoDb.numeroParcelas ?? undefined,
      }
    : undefined;

  return {
    vendas,
    custos,
    cronograma,
    horizonteMeses: cenario.horizonteProjecaoMeses,
    taxaDescontoMensal: new Decimal(opcoes.taxaDescontoMensal ?? "0"),
    indiceCorrecao,
    financiamento,
    limiteNecessidadeMaximaCapital: cenario.limiteNecessidadeMaximaCapital ? new Decimal(cenario.limiteNecessidadeMaximaCapital) : undefined,
  };
}

/**
 * Roda o motor puro para um cenario e persiste apenas RecebimentoProjetado
 * — nunca um MovimentoCaixa (achado F1): o fluxo de caixa em si nao e
 * gravado em lugar nenhum, e sempre recalculado por quem chamar esta
 * funcao.
 */
export async function rodarMotorParaCenario(
  cenarioId: string,
  opcoes: { taxaDescontoMensal?: string } = {},
): Promise<SaidaMotorFinanceiro> {
  const entrada = await montarEntradaMotor(cenarioId, opcoes);
  const resultado = executarMotorFinanceiro(entrada);
  await persistirRecebimentos(cenarioId, resultado);
  await persistirDesembolsosCusto(cenarioId, resultado);
  return resultado;
}

/**
 * Simulacao de sensibilidade: reaproveita a entrada real do cenario e
 * perturba um eixo (custo/vgv/velocidade de vendas) para cada variacao
 * pedida — nunca persiste nada (nem RecebimentoProjetado, nem qualquer
 * outra coisa), ao contrario de rodarMotorParaCenario.
 */
export async function calcularSensibilidadeCenario(
  cenarioId: string,
  eixo: EixoSensibilidade,
  variacoes: Decimal[],
  opcoes: { taxaDescontoMensal?: string } = {},
): Promise<PontoSensibilidade[]> {
  const entrada = await montarEntradaMotor(cenarioId, opcoes);
  return calcularSensibilidade(entrada, eixo, variacoes);
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

/**
 * Persiste DesembolsoCusto para custos de incidencia percentual (achado
 * F21, docs/DECISOES.md — "realizado para custos percentuais"). Custo
 * fixo continua usando Custo.valorRealizado/.status diretamente (achado
 * da setima fatia) -- nao entra aqui. Mesmo padrao diff-based de
 * persistirRecebimentos, upsert por (custoId, mes), para preservar id,
 * valorRealizado e status entre recalculos.
 */
async function persistirDesembolsosCusto(cenarioId: string, resultado: SaidaMotorFinanceiro) {
  const custosPercentuais = await prisma.custo.findMany({
    where: { cenarioId, categoria: { tipoIncidencia: { not: "fixo" } } },
    select: { id: true },
  });
  const custoIdsPercentuais = new Set(custosPercentuais.map((c) => c.id));
  const desembolsos = resultado.desembolsos.filter((d) => custoIdsPercentuais.has(d.custoId));

  const existentes = await prisma.desembolsoCusto.findMany({
    where: { custoId: { in: [...custoIdsPercentuais] } },
    select: { id: true, custoId: true, mes: true, valorPrevisto: true },
  });
  const existentePorChave = new Map(existentes.map((e) => [`${e.custoId}|${e.mes}`, e]));

  const chavesNovas = new Set(desembolsos.map((d) => `${d.custoId}|${d.mes}`));
  const idsObsoletos = existentes.filter((e) => !chavesNovas.has(`${e.custoId}|${e.mes}`)).map((e) => e.id);
  if (idsObsoletos.length > 0) {
    await prisma.desembolsoCusto.deleteMany({ where: { id: { in: idsObsoletos } } });
  }

  const aCriar = desembolsos.filter((d) => !existentePorChave.has(`${d.custoId}|${d.mes}`));
  if (aCriar.length > 0) {
    await prisma.desembolsoCusto.createMany({
      data: aCriar.map((d) => ({ custoId: d.custoId, mes: d.mes, valorPrevisto: d.valor.toString() })),
    });
  }

  const aAtualizar = desembolsos.filter((d) => {
    const existente = existentePorChave.get(`${d.custoId}|${d.mes}`);
    return existente && existente.valorPrevisto !== d.valor.toString();
  });
  for (const d of aAtualizar) {
    const existente = existentePorChave.get(`${d.custoId}|${d.mes}`)!;
    await prisma.desembolsoCusto.update({ where: { id: existente.id }, data: { valorPrevisto: d.valor.toString() } });
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
