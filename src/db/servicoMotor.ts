import { Decimal } from "decimal.js";
import { calcularCurvaCronograma } from "../core/motorCronograma.js";
import { TAXA_DESCONTO_MENSAL_PADRAO } from "../core/motorFluxoCaixa.js";
import type { FinanciamentoInput } from "../core/motorFinanciamento.js";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro, type SaidaMotorFinanceiro } from "../core/motorFinanceiro.js";
import { calcularSensibilidade, type EixoSensibilidade, type PontoSensibilidade } from "../core/motorSensibilidade.js";
import { gerarRecebimentos } from "../core/motorRecebimentos.js";
import type {
  CondicaoPagamento,
  CustoInput,
  PontoCronograma,
  PontoCurvaCronograma,
  PontoIndiceCorrecao,
  RecebimentoGerado,
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

  const vendas: VendaInput[] = [...vendasDb.map(mapearVendaParaMotor), ...(await montarVendasProjetadasDoCenario(cenarioId))];

  const distratadasDb = await prisma.venda.findMany({
    where: { cenarioId, status: "distratada", distrato: { is: { mesDistrato: { not: null } } } },
    include: { condicaoPagamento: { include: { modalidades: true } }, unidade: { select: { tipologiaId: true } }, distrato: true },
  });
  const recebimentosPreDistrato: RecebimentoGerado[] = [];
  const reembolsos: { mes: number; valor: Decimal }[] = [];
  for (const v of distratadasDb) {
    const mesDistrato = v.distrato!.mesDistrato!;
    const venda = mapearVendaParaMotor(v);
    recebimentosPreDistrato.push(...gerarRecebimentos(venda, cenario.horizonteProjecaoMeses).filter((r) => r.mesCompetencia < mesDistrato));
    reembolsos.push({ mes: mesDistrato, valor: new Decimal(v.distrato!.valorReembolsar) });
  }

  const permutas = await prisma.permuta.findMany({ where: { empreendimentoId: cenario.empreendimentoId }, select: { valorAtribuido: true } });
  const vgvNaoCaixa = permutas.reduce((acc, p) => acc.plus(p.valorAtribuido ?? 0), new Decimal(0));

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
    taxaDescontoMensal: new Decimal(opcoes.taxaDescontoMensal ?? cenario.taxaDescontoMensal ?? TAXA_DESCONTO_MENSAL_PADRAO),
    indiceCorrecao,
    financiamento,
    limiteNecessidadeMaximaCapital: cenario.limiteNecessidadeMaximaCapital ? new Decimal(cenario.limiteNecessidadeMaximaCapital) : undefined,
    vgvNaoCaixa,
    recebimentosPreDistrato,
    reembolsos,
  };
}

function mapearVendaParaMotor(v: {
  id: string;
  unidadeId: string;
  mesOrigem: number;
  valorVenda: string;
  unidade: { tipologiaId: string };
  condicaoPagamento: Parameters<typeof mapCondicao>[0];
}): VendaInput {
  return {
    id: v.id,
    unidadeId: v.unidadeId,
    tipologiaId: v.unidade.tipologiaId,
    mesOrigem: v.mesOrigem,
    valorVenda: new Decimal(v.valorVenda),
    condicaoPagamento: mapCondicao(v.condicaoPagamento),
  };
}

export const PREFIXO_VENDA_PROJETADA = "projetada:";

export function ehVendaProjetada(vendaId: string): boolean {
  return vendaId.startsWith(PREFIXO_VENDA_PROJETADA);
}

function somarValores(vendas: VendaInput[]): Decimal {
  return vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
}

/**
 * Vendas projetadas: cada unidade prevista na PremissaVelocidadeVendas vira uma venda
 * em memoria, sem registro Venda e sem consumir o estoque real. So entra para tipologias
 * que nao tem nenhuma venda registrada no cenario -- assim um cenario ja vendido de
 * verdade nunca muda de resultado.
 */
export async function montarVendasProjetadasDoCenario(cenarioId: string): Promise<VendaInput[]> {
  const cenario = await prisma.cenario.findUniqueOrThrow({
    where: { id: cenarioId },
    select: { empreendimentoId: true, horizonteProjecaoMeses: true },
  });
  const premissas = await prisma.premissaVelocidadeVendas.findMany({ where: { cenarioId } });
  const comQuantidade = premissas.filter(
    (p) => Math.round(Number(p.unidadesPrevistas)) > 0 && p.mes >= 1 && p.mes <= cenario.horizonteProjecaoMeses,
  );
  if (comQuantidade.length === 0) return [];

  const vendasDoCenario = await prisma.venda.findMany({ where: { cenarioId }, select: { unidade: { select: { tipologiaId: true } } } });
  const comVendaReal = new Set(vendasDoCenario.map((v) => v.unidade.tipologiaId));
  const tipologiasAProjetar = [...new Set(comQuantidade.map((p) => p.tipologiaId))].filter((t) => !comVendaReal.has(t));

  const projetadas: VendaInput[] = [];
  for (const tipologiaId of tipologiasAProjetar) {
    const valorVenda = await precoProjetadoDaTipologia(cenario.empreendimentoId, tipologiaId);
    const condicao = await prisma.condicaoPagamento.findFirst({
      where: { empreendimentoId: cenario.empreendimentoId, tipologiaId },
      include: { modalidades: true },
    });
    if (!condicao) {
      throw new Error(`Nao existe CondicaoPagamento cadastrada para a tipologia ${tipologiaId} — nao e possivel projetar vendas sem condicao de pagamento.`);
    }
    const condicaoPagamento = mapCondicao(condicao);
    for (const premissa of comQuantidade.filter((p) => p.tipologiaId === tipologiaId)) {
      const quantidade = Math.round(Number(premissa.unidadesPrevistas));
      for (let k = 1; k <= quantidade; k++) {
        const id = `${PREFIXO_VENDA_PROJETADA}${tipologiaId}:${premissa.mes}:${premissa.id}:${k}`;
        projetadas.push({ id, unidadeId: id, tipologiaId, mesOrigem: premissa.mes, valorVenda, condicaoPagamento });
      }
    }
  }
  return projetadas;
}

/** Preco de uma venda projetada: media das vendas reais da tipologia no empreendimento, ou preco padrao sem nenhuma venda real. */
async function precoProjetadoDaTipologia(empreendimentoId: string, tipologiaId: string): Promise<Decimal> {
  const reais = await prisma.venda.findMany({
    where: { empreendimentoId, status: "ativa", unidade: { tipologiaId } },
    select: { valorVenda: true },
  });
  if (reais.length > 0) {
    return reais.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0)).dividedBy(reais.length);
  }
  const tipologia = await prisma.tipologia.findUniqueOrThrow({ where: { id: tipologiaId }, select: { nome: true, precoUnitarioPadrao: true } });
  if (!tipologia.precoUnitarioPadrao) {
    throw new Error(`Tipologia "${tipologia.nome}" não tem preço padrão nem vendas reais para projetar a receita.`);
  }
  return new Decimal(tipologia.precoUnitarioPadrao);
}

/** Soma do valor atribuido a todas as permutas do empreendimento (VGV e custo nao-caixa). */
export async function somarValorPermutas(empreendimentoId: string): Promise<Decimal> {
  const permutas = await prisma.permuta.findMany({ where: { empreendimentoId }, select: { valorAtribuido: true } });
  return permutas.reduce((acc, p) => acc.plus(p.valorAtribuido ?? 0), new Decimal(0));
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

export interface ParcelaPagaSemBase {
  categoriaNome: string;
  mes: number;
  valorRealizado: string;
}

/**
 * Roda o motor puro antes e depois de uma alteracao em memoria da entrada e devolve as
 * parcelas de custo percentual ja pagas que perderiam a base (o mes sai do resultado).
 * Nada e gravado: a pre-checagem usa a mesma entrada e o mesmo motor da persistencia.
 */
export async function parcelasPagasQuePerderiamBase(
  cenarioId: string,
  alterar: (entrada: EntradaMotorFinanceiro) => EntradaMotorFinanceiro,
): Promise<ParcelaPagaSemBase[]> {
  const entrada = await montarEntradaMotor(cenarioId);
  const comBaseAntes = new Set(executarMotorFinanceiro(entrada).desembolsos.map((d) => `${d.custoId}|${d.mes}`));
  const comBaseDepois = new Set(executarMotorFinanceiro(alterar(entrada)).desembolsos.map((d) => `${d.custoId}|${d.mes}`));
  const pagas = await prisma.desembolsoCusto.findMany({
    where: { custo: { cenarioId }, status: "realizado" },
    include: { custo: { select: { categoria: { select: { nome: true } } } } },
    orderBy: { mes: "asc" },
  });
  return pagas
    .filter((p) => comBaseAntes.has(`${p.custoId}|${p.mes}`) && !comBaseDepois.has(`${p.custoId}|${p.mes}`))
    .map((p) => ({ categoriaNome: p.custo.categoria.nome, mes: p.mes, valorRealizado: p.valorRealizado ?? "0" }));
}

export function mensagemParcelasPagasSemBase(operacao: string, parcelas: ParcelaPagaSemBase[]): string {
  const lista = parcelas
    .map((p) => `"${p.categoriaNome}" no mês ${p.mes} (R$ ${Number(p.valorRealizado).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pagos)`)
    .join("; ");
  return `${operacao} deixaria sem base parcela(s) de custo já paga(s): ${lista}. Para fazer isso, estorne o pagamento dessa(s) parcela(s) (Estornar na tela de Custos), faça a alteração e marque o pagamento de novo. Assim o valor realizado não se perde em silêncio.`;
}

export function ehVendaDaPremissa(vendaId: string, premissaId: string): boolean {
  return ehVendaProjetada(vendaId) && vendaId.includes(`:${premissaId}:`);
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
  /** Unidades com venda real ativa no cenario, e unidades projetadas pela premissa (ver montarVendasProjetadasDoCenario). */
  vendas: {
    reais: number;
    projetadas: number;
    projetadasPorTipologia: { tipologiaId: string; tipologiaNome: string; unidades: number; vgv: string; ticketMedio: string | null }[];
  };
  /** Avisos nao bloqueantes sobre as premissas (ex.: premissa soma mais unidades do que a tipologia tem). */
  avisos: string[];
}

/** VGV liquido = VGV bruto - comissoes de corretagem (categorias papel=comissao_corretagem) - permutas. So exibicao. */
export function calcularVgvLiquido(vgvBruto: Decimal, custos: { papel: string; totalPrevisto: string }[], vgvPermutado: Decimal): Decimal {
  const comissoes = custos.filter((c) => c.papel === "comissao_corretagem").reduce((acc, c) => acc.plus(c.totalPrevisto), new Decimal(0));
  return vgvBruto.minus(comissoes).minus(vgvPermutado);
}

/** Taxa de desconto mensal de um cenario: a propria, ou o padrao do sistema quando nula. */
export function taxaDescontoEfetiva(cenario: { taxaDescontoMensal: string | null }): string {
  return cenario.taxaDescontoMensal ?? TAXA_DESCONTO_MENSAL_PADRAO.toString();
}

export function formatarTir(tir: Decimal | null): string | null {
  return tir ? tir.toFixed(6) : null;
}

export interface IndicadoresComparacaoCenario {
  /** VGV = soma de Venda.valorVenda (status="ativa") + valor atribuido das permutas do empreendimento. */
  vgv: string;
  /** parte do VGV que vem de permutas (nao-caixa) */
  vgvPermutado: string;
  totalRecebimentosPrevisto: string;
  totalCustosPrevisto: string;
  saldoFinal: string;
  necessidadeMaximaCapital: string;
  mesPico: number | null;
  mesRecuperacao: number | null;
  mesRecuperacaoDescontado: number | null;
  vgvLiquido: string;
  vpl: string;
  /** taxa de desconto mensal efetivamente usada no VPL deste cenario */
  taxaDescontoMensal: string;
  /** TIR mensal (a.m.), null quando nao aplicavel */
  tir: string | null;
  /** Resultado (margem liquida = saldo final / VGV), null sem VGV */
  margemLiquida: string | null;
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
/** Avisos nao bloqueantes: premissa de velocidade que soma mais unidades do que a tipologia tem. Nao altera nenhum resultado. */
export async function calcularAvisosPremissas(cenarioId: string): Promise<string[]> {
  const premissas = await prisma.premissaVelocidadeVendas.findMany({ where: { cenarioId }, include: { tipologia: { select: { nome: true } } } });
  const porTipologia = new Map<string, { nome: string; total: Decimal }>();
  for (const p of premissas) {
    const g = porTipologia.get(p.tipologiaId) ?? { nome: p.tipologia.nome, total: new Decimal(0) };
    g.total = g.total.plus(p.unidadesPrevistas);
    porTipologia.set(p.tipologiaId, g);
  }
  const avisos: string[] = [];
  for (const [tipologiaId, g] of porTipologia) {
    const totalUnidades = await prisma.unidade.count({ where: { tipologiaId } });
    if (g.total.greaterThan(totalUnidades)) {
      avisos.push(`Premissa de velocidade da tipologia "${g.nome}" soma ${g.total.toFixed(0)} unidades, mas a tipologia tem ${totalUnidades}. A projeção não é limitada pelo estoque; ajuste a premissa.`);
    }
  }
  return avisos;
}

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

  const reais = await prisma.venda.count({ where: { cenarioId: cenario.id, status: "ativa" } });
  const projetadas = await montarVendasProjetadasDoCenario(cenario.id);
  const projecaoPorTipologia = new Map<string, { unidades: number; vgv: Decimal }>();
  for (const v of projetadas) {
    const g = projecaoPorTipologia.get(v.tipologiaId) ?? { unidades: 0, vgv: new Decimal(0) };
    g.unidades += 1;
    g.vgv = g.vgv.plus(v.valorVenda);
    projecaoPorTipologia.set(v.tipologiaId, g);
  }
  const avisos = await calcularAvisosPremissas(cenario.id);

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
    vendas: {
      reais,
      projetadas: projetadas.length,
      projetadasPorTipologia: [...projecaoPorTipologia.entries()].map(([tipologiaId, g]) => ({
        tipologiaId,
        tipologiaNome: porTipologiaMap.get(tipologiaId)?.tipologiaNome ?? tipologiaId,
        unidades: g.unidades,
        vgv: g.vgv.toFixed(2),
        ticketMedio: g.unidades > 0 ? g.vgv.div(g.unidades).toFixed(2) : null,
      })),
    },
    avisos,
    cronograma: cronogramaResumo,
    financiamento: financiamentoDb ? {
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
      const projetadas = await montarVendasProjetadasDoCenario(cenario.id);
      const vgvPermutado = await somarValorPermutas(cenario.empreendimentoId);
      const vgvVendido = vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0)).plus(somarValores(projetadas));
      const vgv = vgvVendido.plus(vgvPermutado);
      const totalRecebimentosPrevisto = resultado.totalRecebimentosPrevisto;
      const totalCustosPrevisto = resultado.desembolsos.reduce((acc, d) => acc.plus(d.valor), new Decimal(0)).plus(vgvPermutado);

      const premissas = await montarPremissasResumoCenario(cenario);

      return {
        id: cenario.id,
        nome: cenario.nome,
        tipo: cenario.tipo,
        derivadoDeNome: cenario.derivadoDe?.nome ?? null,
        indicadores: {
          vgv: vgv.toFixed(2),
          vgvPermutado: vgvPermutado.toFixed(2),
          totalRecebimentosPrevisto: totalRecebimentosPrevisto.toFixed(2),
          totalCustosPrevisto: totalCustosPrevisto.toFixed(2),
          saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
          necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
          mesPico: resultado.indicadores.mesPico,
          mesRecuperacao: resultado.indicadores.mesRecuperacao,
          mesRecuperacaoDescontado: resultado.indicadores.mesRecuperacaoDescontado,
          vgvLiquido: calcularVgvLiquido(vgv, await montarCustosResumoDoCenario(cenario.id), vgvPermutado).toFixed(2),
          vpl: resultado.indicadores.vpl.toFixed(2),
          taxaDescontoMensal: taxaDescontoEfetiva(cenario),
          tir: formatarTir(resultado.indicadores.tir),
          margemLiquida: resultado.indicadores.margemLiquida?.toFixed(10) ?? null,
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
  /** custo | comissao_corretagem | tributo -- papel economico da categoria */
  papel: string;
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
      papel: c.categoria.papel,
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

async function persistirRecebimentos(cenarioId: string, resultadoCompleto: SaidaMotorFinanceiro) {
  const resultado = { ...resultadoCompleto, recebimentos: resultadoCompleto.recebimentos.filter((r) => !ehVendaProjetada(r.vendaId)) };
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
    select: { id: true, custoId: true, mes: true, valorPrevisto: true, status: true },
  });
  const existentePorChave = new Map(existentes.map((e) => [`${e.custoId}|${e.mes}`, e]));

  // Parcela paga nunca some: se o mes perdeu a base, ela fica "sem base" (previsto zero, realizado mantido).
  const chavesNovas = new Set(desembolsos.map((d) => `${d.custoId}|${d.mes}`));
  const obsoletos = existentes.filter((e) => !chavesNovas.has(`${e.custoId}|${e.mes}`));
  const idsParaApagar = obsoletos.filter((e) => e.status !== "realizado").map((e) => e.id);
  const idsSemBase = obsoletos.filter((e) => e.status === "realizado" && !new Decimal(e.valorPrevisto).isZero()).map((e) => e.id);
  if (idsParaApagar.length > 0) {
    await prisma.desembolsoCusto.deleteMany({ where: { id: { in: idsParaApagar } } });
  }
  if (idsSemBase.length > 0) {
    await prisma.desembolsoCusto.updateMany({ where: { id: { in: idsSemBase } }, data: { valorPrevisto: "0" } });
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
    mesFinal: number | null;
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
      mesFinal: m.mesFinal ?? undefined,
      repeticoesSobreTotal: m.repeticoesSobreTotal,
      geraEventoParcial: m.geraEventoParcial,
      ordem: m.ordem,
    })),
  };
}
