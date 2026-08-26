import { Decimal } from "decimal.js";
import { calcularCurvaCronograma } from "../core/motorCronograma.js";
import type { FinanciamentoInput } from "../core/motorFinanciamento.js";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro, type SaidaMotorFinanceiro } from "../core/motorFinanceiro.js";
import { calcularSensibilidade, type EixoSensibilidade, type PontoSensibilidade } from "../core/motorSensibilidade.js";
import type {
  CondicaoPagamento,
  CustoInput,
  PontoCronograma,
  PontoCurvaCronograma,
  PontoIndiceCorrecao,
  TipoDistribuicao,
  TipoIncidenciaCusto,
  VendaInput,
} from "../core/types.js";
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
    include: { categoria: true, faixas: true },
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
    // Faixas de comissao progressiva (achado F28) -- so preenchido quando
    // tipoIncidencia="faixas_vgv_acumulado"; a ordenacao e feita pelo
    // proprio motor (src/core/motorCustos.ts), nao aqui.
    faixas: c.faixas.map((f) => ({ volumeAte: f.volumeAte ? new Decimal(f.volumeAte) : undefined, percentual: new Decimal(f.percentual) })),
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

/**
 * Curva combinada do cronograma fisico-financeiro (Fase 2.3): para cada mes,
 * o percentual de execucao fisica (e seu acumulado) lado a lado com o
 * desembolso financeiro que aquele percentual gerou (e seu acumulado).
 * Roda o motor (mesmo padrao de custos-resumo/distribuicao-mensal), busca o
 * cronograma bruto do cenario e os ids dos Custo com
 * categoria.tipoIncidencia="pct_execucao" -- mesmo filtro de
 * persistirDesembolsosCusto, so que por "pct_execucao" em vez de "not fixo"
 * -- para isolar, dentre todos os desembolsos do cenario, so os que a curva
 * do cronograma realmente gerou. Nenhuma regra nova aqui, so traducao
 * Prisma -> motor (calcularCurvaCronograma, em src/core).
 */
export async function montarCurvaCronogramaDoCenario(cenarioId: string): Promise<PontoCurvaCronograma[]> {
  const resultado = await rodarMotorParaCenario(cenarioId);

  const cronogramaDb = await prisma.cronogramaFisicoFinanceiro.findMany({ where: { cenarioId }, orderBy: { mes: "asc" } });
  const cronograma: PontoCronograma[] = cronogramaDb.map((p) => ({ mes: p.mes, percentualExecucaoMensal: new Decimal(p.percentualExecucaoMensal) }));

  const custosObra = await prisma.custo.findMany({
    where: { cenarioId, categoria: { tipoIncidencia: "pct_execucao" } },
    select: { id: true },
  });
  const idsObra = new Set(custosObra.map((c) => c.id));
  const desembolsosObra = resultado.desembolsos.filter((d) => idsObra.has(d.custoId));

  return calcularCurvaCronograma(cronograma, desembolsosObra);
}

export interface PremissasResumoCenario {
  horizonteProjecaoMeses: number;
  limiteNecessidadeMaximaCapital: string | null;
  velocidadeVendas: {
    totalUnidadesPrevistas: string;
    porTipologia: { tipologiaId: string; tipologiaNome: string; totalUnidadesPrevistas: string }[];
  };
  custos: {
    categoriaId: string;
    categoriaNome: string;
    tipoIncidencia: TipoIncidenciaCusto;
    tipologiaNome: string | null;
    valorPrevisto: string | null;
    percentual: string | null;
  }[];
  /** null quando o cenario nao tem cronograma cadastrado (Fase 2.3). */
  cronograma: { quantidadeMeses: number; mesInicio: number | null; mesFim: number | null } | null;
  financiamento: { valorContratado: string; taxaJurosMensal: string; tipoAmortizacao: string; mesAmortizacao: number } | null;
}

export interface IndicadoresComparacaoCenario {
  /** soma de Venda.valorVenda (status="ativa") -- nao existe em SaidaMotorFinanceiro, e uma soma direta, nao uma regra do motor. */
  vgv: string;
  totalRecebimentosPrevisto: string;
  totalCustosPrevisto: string;
  saldoFinal: string;
  necessidadeMaximaCapital: string;
  mesPico: number | null;
  mesRecuperacao: number | null;
  vpl: string;
}

export interface ComparacaoCenario {
  id: string;
  nome: string;
  tipo: string;
  derivadoDeNome: string | null;
  indicadores: IndicadoresComparacaoCenario;
  fluxoMensal: { mes: number; entradas: string; saidas: string; fluxoMensal: string; fluxoAcumulado: string }[];
  premissas: PremissasResumoCenario;
}

/**
 * Comparacao de N cenarios do MESMO empreendimento (Fase 2.4), diferente
 * da comparacao de 1 nivel por derivacao (achado F18, GET
 * /cenarios/:id/comparacao) -- aqui o chamador escolhe livremente quais
 * cenarios comparar, nao so pai/filhos diretos. `cenarioIds` que nao
 * pertencam a `empreendimentoId` sao silenciosamente ignorados (nunca
 * cruza empreendimentos, regra R12) -- o resultado pode ter menos itens
 * que `cenarioIds.length`. Roda o motor (rodarMotorParaCenario, ja
 * existente, sem nenhuma mudanca) para cada cenario; todo o resto e soma
 * direta de dados ja existentes no banco/motor -- nenhuma regra
 * financeira nova (VGV, por exemplo, nao existe em SaidaMotorFinanceiro,
 * mas e so soma de Venda.valorVenda, nao um calculo novo).
 */
/**
 * Resumo de premissas de um cenario (Fase 2.4, extraido nesta forma na
 * Fase 2.5 para ser reaproveitado tambem pelo relatorio de viabilidade,
 * docs/DECISOES.md) -- so soma/le dados ja existentes (velocidade de
 * vendas, custos, cronograma, financiamento), nenhuma regra financeira
 * nova.
 */
export async function montarPremissasResumoCenario(cenario: {
  id: string;
  horizonteProjecaoMeses: number;
  limiteNecessidadeMaximaCapital: string | null;
}): Promise<PremissasResumoCenario> {
  const premissasVelocidadeDb = await prisma.premissaVelocidadeVendas.findMany({
    where: { cenarioId: cenario.id },
    include: { tipologia: { select: { nome: true } } },
  });
  const porTipologiaMap = new Map<string, { tipologiaNome: string; total: Decimal }>();
  for (const p of premissasVelocidadeDb) {
    const atual = porTipologiaMap.get(p.tipologiaId) ?? { tipologiaNome: p.tipologia.nome, total: new Decimal(0) };
    atual.total = atual.total.plus(p.unidadesPrevistas);
    porTipologiaMap.set(p.tipologiaId, atual);
  }
  const totalUnidadesPrevistas = [...porTipologiaMap.values()].reduce((acc, t) => acc.plus(t.total), new Decimal(0));

  const custosDb = await prisma.custo.findMany({
    where: { cenarioId: cenario.id },
    include: { categoria: true, tipologia: { select: { nome: true } } },
  });

  const cronogramaDb = await prisma.cronogramaFisicoFinanceiro.findMany({ where: { cenarioId: cenario.id }, orderBy: { mes: "asc" } });
  const mesesComExecucao = cronogramaDb.filter((p) => !new Decimal(p.percentualExecucaoMensal).isZero());
  const cronogramaResumo =
    cronogramaDb.length > 0
      ? {
          quantidadeMeses: cronogramaDb.length,
          mesInicio: mesesComExecucao.length > 0 ? Math.min(...mesesComExecucao.map((p) => p.mes)) : null,
          mesFim: mesesComExecucao.length > 0 ? Math.max(...mesesComExecucao.map((p) => p.mes)) : null,
        }
      : null;

  const financiamentoDb = await prisma.financiamentoProducao.findUnique({ where: { cenarioId: cenario.id } });

  return {
    horizonteProjecaoMeses: cenario.horizonteProjecaoMeses,
    limiteNecessidadeMaximaCapital: cenario.limiteNecessidadeMaximaCapital,
    velocidadeVendas: {
      totalUnidadesPrevistas: totalUnidadesPrevistas.toFixed(2),
      porTipologia: [...porTipologiaMap.entries()].map(([tipologiaId, t]) => ({
        tipologiaId,
        tipologiaNome: t.tipologiaNome,
        totalUnidadesPrevistas: t.total.toFixed(2),
      })),
    },
    custos: custosDb.map((c) => ({
      categoriaId: c.categoriaId,
      categoriaNome: c.categoria.nome,
      tipoIncidencia: c.categoria.tipoIncidencia as TipoIncidenciaCusto,
      tipologiaNome: c.tipologia?.nome ?? null,
      valorPrevisto: c.valorPrevisto,
      percentual: c.percentual,
    })),
    cronograma: cronogramaResumo,
    financiamento: financiamentoDb
      ? {
          valorContratado: financiamentoDb.valorContratado,
          taxaJurosMensal: financiamentoDb.taxaJurosMensal,
          tipoAmortizacao: financiamentoDb.tipoAmortizacao,
          mesAmortizacao: financiamentoDb.mesAmortizacao,
        }
      : null,
  };
}

export async function montarComparacaoCenarios(empreendimentoId: string, cenarioIds: string[]): Promise<ComparacaoCenario[]> {
  const cenarios = await prisma.cenario.findMany({
    where: { id: { in: cenarioIds }, empreendimentoId },
    include: { derivadoDe: { select: { nome: true } } },
  });

  return Promise.all(
    cenarios.map(async (cenario) => {
      const resultado = await rodarMotorParaCenario(cenario.id);

      const vendas = await prisma.venda.findMany({ where: { cenarioId: cenario.id, status: "ativa" }, select: { valorVenda: true } });
      const vgv = vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
      const totalRecebimentosPrevisto = resultado.recebimentos.reduce((acc, r) => acc.plus(r.valorPrevisto), new Decimal(0));
      const totalCustosPrevisto = resultado.desembolsos.reduce((acc, d) => acc.plus(d.valor), new Decimal(0));

      const premissas = await montarPremissasResumoCenario(cenario);

      return {
        id: cenario.id,
        nome: cenario.nome,
        tipo: cenario.tipo,
        derivadoDeNome: cenario.derivadoDe?.nome ?? null,
        indicadores: {
          vgv: vgv.toFixed(2),
          totalRecebimentosPrevisto: totalRecebimentosPrevisto.toFixed(2),
          totalCustosPrevisto: totalCustosPrevisto.toFixed(2),
          saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
          necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
          mesPico: resultado.indicadores.mesPico,
          mesRecuperacao: resultado.indicadores.mesRecuperacao,
          vpl: resultado.indicadores.vpl.toFixed(2),
        },
        fluxoMensal: resultado.fluxo.map((f) => ({
          mes: f.mes,
          entradas: f.entradas.toFixed(2),
          saidas: f.saidas.toFixed(2),
          fluxoMensal: f.fluxoMensal.toFixed(2),
          fluxoAcumulado: f.fluxoAcumulado.toFixed(2),
        })),
        premissas,
      };
    }),
  );
}

export interface CustoResumoGerencial {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  tipoIncidencia: TipoIncidenciaCusto;
  tipologiaId: string | null;
  tipologiaNome: string | null;
  recorrencia: string;
  competenciaMes: number | null;
  status: string;
  totalPrevisto: string;
  totalRealizado: string;
  saldoARealizar: string;
  desvio: string;
  desvioPercentual: string | null;
}

/**
 * Visao gerencial de custos (Fase 2.2, achado F31) -- extraida da rota
 * GET /cenarios/:id/custos-resumo nesta forma na Fase 2.5 para ser
 * reaproveitada tambem pelo relatorio de viabilidade (docs/DECISOES.md).
 * Mesmo comportamento de antes da extracao: o previsto de cada custo vem
 * da soma de resultado.desembolsos (nunca um recalculo paralelo), o
 * realizado usa Custo.valorRealizado para incidencia "fixo" e a soma de
 * DesembolsoCusto.valorRealizado para as demais.
 */
export async function montarCustosResumoDoCenario(cenarioId: string): Promise<CustoResumoGerencial[]> {
  const resultado = await rodarMotorParaCenario(cenarioId);
  const previstoPorCusto = new Map<string, Decimal>();
  for (const d of resultado.desembolsos) {
    previstoPorCusto.set(d.custoId, (previstoPorCusto.get(d.custoId) ?? new Decimal(0)).plus(d.valor));
  }

  const [custos, desembolsos] = await Promise.all([
    prisma.custo.findMany({ where: { cenarioId }, include: { categoria: true, tipologia: { select: { nome: true } } } }),
    prisma.desembolsoCusto.findMany({ where: { custo: { cenarioId } }, select: { custoId: true, valorRealizado: true, status: true } }),
  ]);
  const realizadoPercentualPorCusto = new Map<string, Decimal>();
  for (const d of desembolsos) {
    if (d.status === "realizado" && d.valorRealizado) {
      realizadoPercentualPorCusto.set(d.custoId, (realizadoPercentualPorCusto.get(d.custoId) ?? new Decimal(0)).plus(d.valorRealizado));
    }
  }

  return custos.map((c) => {
    const previsto = previstoPorCusto.get(c.id) ?? new Decimal(0);
    const realizado =
      c.categoria.tipoIncidencia === "fixo"
        ? c.status === "realizado" && c.valorRealizado
          ? new Decimal(c.valorRealizado)
          : new Decimal(0)
        : (realizadoPercentualPorCusto.get(c.id) ?? new Decimal(0));
    const desvio = realizado.minus(previsto);
    return {
      id: c.id,
      categoriaId: c.categoriaId,
      categoriaNome: c.categoria.nome,
      tipoIncidencia: c.categoria.tipoIncidencia as TipoIncidenciaCusto,
      tipologiaId: c.tipologiaId,
      tipologiaNome: c.tipologia?.nome ?? null,
      recorrencia: c.recorrencia,
      competenciaMes: c.competenciaMes,
      status: c.status,
      totalPrevisto: previsto.toFixed(2),
      totalRealizado: realizado.toFixed(2),
      saldoARealizar: previsto.minus(realizado).toFixed(2),
      desvio: desvio.toFixed(2),
      desvioPercentual: previsto.isZero() ? null : desvio.dividedBy(previsto).times(100).toFixed(2),
    };
  });
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
