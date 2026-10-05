import { Decimal } from "decimal.js";
import type { DesembolsoMensal, FluxoMensal, IndicadoresFluxo, RecebimentoGerado } from "./types.js";

/**
 * Consolidacao do fluxo de caixa — SEMPRE computada, nunca uma tabela
 * persistida (ver achado F1, docs/DECISOES.md): duas tabelas guardando o
 * mesmo fato sem garantia estrutural de sincronia foi exatamente o bug
 * encontrado entre PERMUTA e SINTESE na planilha original. O fluxo de
 * caixa e reconstruido a qualquer momento a partir de RecebimentoProjetado
 * e Custo (dados-fonte) — nunca editado diretamente.
 *
 * Regra R8: fluxo de um periodo = entradas - saidas, apenas com os
 * desembolsos ja filtrados por participaFluxoCaixa (o filtro acontece
 * antes de chamar esta funcao, na camada que le os Custo do banco).
 */
export function consolidarFluxoCaixa(
  recebimentos: RecebimentoGerado[],
  desembolsos: DesembolsoMensal[],
  horizonteMeses: number,
): FluxoMensal[] {
  const entradasPorMes = agregarPorMes(recebimentos.map((r) => ({ mes: r.mesCompetencia, valor: r.valorPrevisto })));
  const saidasPorMes = agregarPorMes(desembolsos.map((d) => ({ mes: d.mes, valor: d.valor })));

  const fluxo: FluxoMensal[] = [];
  let acumulado = new Decimal(0);

  for (let mes = 1; mes <= horizonteMeses; mes++) {
    const entradas = entradasPorMes.get(mes) ?? new Decimal(0);
    const saidas = saidasPorMes.get(mes) ?? new Decimal(0);
    const fluxoMensal = entradas.minus(saidas);
    acumulado = acumulado.plus(fluxoMensal);
    fluxo.push({ mes, entradas, saidas, fluxoMensal, fluxoAcumulado: acumulado });
  }

  return fluxo;
}

function agregarPorMes(itens: { mes: number; valor: Decimal }[]): Map<number, Decimal> {
  const mapa = new Map<number, Decimal>();
  for (const item of itens) {
    const atual = mapa.get(item.mes) ?? new Decimal(0);
    mapa.set(item.mes, atual.plus(item.valor));
  }
  return mapa;
}

/**
 * Regras R9/R10: necessidade maxima de capital e o menor valor do
 * acumulado no horizonte; o mes de recuperacao e o primeiro mes, apos o
 * pico, a partir do qual o acumulado permanece >= 0 ate o fim do
 * horizonte — nao o primeiro cruzamento pontual.
 */
/** Taxa de desconto mensal usada quando o cenario nao define a sua propria (0,5% a.m.). */
export const TAXA_DESCONTO_MENSAL_PADRAO = new Decimal("0.005");

export function calcularIndicadores(fluxo: FluxoMensal[], taxaDescontoMensal: Decimal): IndicadoresFluxo {
  if (fluxo.length === 0) {
    return {
      necessidadeMaximaCapital: new Decimal(0),
      mesPico: null,
      mesRecuperacao: null,
      mesRecuperacaoDescontado: null,
      saldoFinal: new Decimal(0),
      vpl: new Decimal(0),
      tir: null,
      margemLiquida: null,
    };
  }

  let mesPico = fluxo[0]!.mes;
  let piorAcumulado = fluxo[0]!.fluxoAcumulado;
  for (const ponto of fluxo) {
    if (ponto.fluxoAcumulado.lessThan(piorAcumulado)) {
      piorAcumulado = ponto.fluxoAcumulado;
      mesPico = ponto.mes;
    }
  }

  const mesRecuperacao = primeiroMesDeRecuperacao(fluxo.map((p) => ({ mes: p.mes, valor: p.fluxoAcumulado })), fluxo.findIndex((p) => p.mes === mesPico));

  let acumuladoDescontado = new Decimal(0);
  const acumuladosDescontados = fluxo.map((p) => {
    acumuladoDescontado = acumuladoDescontado.plus(p.fluxoMensal.dividedBy(new Decimal(1).plus(taxaDescontoMensal).pow(p.mes)));
    return { mes: p.mes, valor: acumuladoDescontado };
  });
  let indicePicoDescontado = 0;
  for (let i = 1; i < acumuladosDescontados.length; i++) {
    if (acumuladosDescontados[i]!.valor.lessThan(acumuladosDescontados[indicePicoDescontado]!.valor)) indicePicoDescontado = i;
  }
  const mesRecuperacaoDescontado = primeiroMesDeRecuperacao(acumuladosDescontados, indicePicoDescontado);

  const saldoFinal = fluxo[fluxo.length - 1]!.fluxoAcumulado;
  const necessidadeMaximaCapital = piorAcumulado.lessThan(0) ? piorAcumulado.abs() : new Decimal(0);
  const fluxosMensais = fluxo.map((p) => p.fluxoMensal);
  const vpl = calcularVPL(fluxosMensais, taxaDescontoMensal);
  const tir = calcularTIRMensal(fluxosMensais);

  return { necessidadeMaximaCapital, mesPico, mesRecuperacao, mesRecuperacaoDescontado, saldoFinal, vpl, tir, margemLiquida: null };
}

/** Primeiro mes, a partir de `inicio`, em que a serie fica >= 0 ate o fim (criterio de recuperacao do payback). */
function primeiroMesDeRecuperacao(serie: { mes: number; valor: Decimal }[], inicio: number): number | null {
  for (let i = Math.max(inicio, 0); i < serie.length; i++) {
    if (serie.slice(i).every((p) => p.valor.greaterThanOrEqualTo(0))) return serie[i]!.mes;
  }
  return null;
}

/** Margem liquida = saldo final / VGV. Sem VGV (zero ou negativo) nao ha margem: devolve null. */
export function calcularMargemLiquida(saldoFinal: Decimal, vgv: Decimal): Decimal | null {
  if (vgv.lessThanOrEqualTo(0)) return null;
  return saldoFinal.dividedBy(vgv);
}

/**
 * TIR mensal: a taxa r que zera o VPL do fluxo mensal (mesmo criterio de
 * calcularVPL). Procura trocas de sinal do VPL numa grade de taxas de -99%
 * a.m. a 1.000% a.m., refina cada uma por bisseção e devolve a raiz mais
 * proxima de zero (a mais economicamente plausivel quando ha mais de uma).
 * Devolve null quando o fluxo nao tem entradas e saidas de sinais opostos ou
 * quando o VPL nao muda de sinal em nenhuma taxa da grade.
 */
const GRADE_TIR = ["-0.99", "-0.95", "-0.9", "-0.8", "-0.6", "-0.4", "-0.2", "-0.1", "-0.05", "-0.02", "-0.01", "0", "0.005", "0.01", "0.02", "0.05", "0.1", "0.2", "0.5", "1", "2", "5", "10"].map((v) => new Decimal(v));

export function calcularTIRMensal(fluxosMensais: Decimal[]): Decimal | null {
  const temEntrada = fluxosMensais.some((f) => f.greaterThan(0));
  const temSaida = fluxosMensais.some((f) => f.lessThan(0));
  if (!temEntrada || !temSaida) return null;

  const vplEm = (r: Decimal) => calcularVPL(fluxosMensais, r);
  const raizes: Decimal[] = [];
  let anterior = GRADE_TIR[0]!;
  let vplAnterior = vplEm(anterior);
  if (vplAnterior.isZero()) raizes.push(anterior);

  for (let i = 1; i < GRADE_TIR.length; i++) {
    const atual = GRADE_TIR[i]!;
    const vplAtual = vplEm(atual);
    if (vplAtual.isZero()) {
      raizes.push(atual);
    } else if (!vplAnterior.isZero() && vplAnterior.isPositive() !== vplAtual.isPositive()) {
      raizes.push(bisseccaoRaiz(anterior, atual, vplAnterior, vplEm));
    }
    anterior = atual;
    vplAnterior = vplAtual;
  }

  if (raizes.length === 0) return null;
  return raizes.reduce((melhor, r) => (r.abs().lessThan(melhor.abs()) ? r : melhor));
}

function bisseccaoRaiz(lo: Decimal, hi: Decimal, vplLo: Decimal, vplEm: (r: Decimal) => Decimal): Decimal {
  let baixo = lo;
  let alto = hi;
  let vplBaixo = vplLo;
  for (let i = 0; i < 200 && alto.minus(baixo).greaterThan("0.0000000001"); i++) {
    const meio = baixo.plus(alto).dividedBy(2);
    const vplMeio = vplEm(meio);
    if (vplMeio.isZero()) return meio;
    if (vplBaixo.isPositive() === vplMeio.isPositive()) {
      baixo = meio;
      vplBaixo = vplMeio;
    } else {
      alto = meio;
    }
  }
  return baixo.plus(alto).dividedBy(2);
}

/** VPL = soma de fluxo(t) / (1 + taxa)^t, t comecando em 1 (equivalente a NPV do Excel). */
function calcularVPL(fluxosMensais: Decimal[], taxaMensal: Decimal): Decimal {
  let vpl = new Decimal(0);
  const umMaisTaxa = taxaMensal.plus(1);
  fluxosMensais.forEach((valor, index) => {
    const t = index + 1;
    vpl = vpl.plus(valor.dividedBy(umMaisTaxa.pow(t)));
  });
  return vpl;
}
