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
export function calcularIndicadores(fluxo: FluxoMensal[], taxaDescontoMensal: Decimal): IndicadoresFluxo {
  if (fluxo.length === 0) {
    return {
      necessidadeMaximaCapital: new Decimal(0),
      mesPico: null,
      mesRecuperacao: null,
      saldoFinal: new Decimal(0),
      vpl: new Decimal(0),
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

  let mesRecuperacao: number | null = null;
  for (let i = fluxo.findIndex((p) => p.mes === mesPico); i < fluxo.length; i++) {
    const restante = fluxo.slice(i);
    if (restante.every((p) => p.fluxoAcumulado.greaterThanOrEqualTo(0))) {
      mesRecuperacao = restante[0]!.mes;
      break;
    }
  }

  const saldoFinal = fluxo[fluxo.length - 1]!.fluxoAcumulado;
  const necessidadeMaximaCapital = piorAcumulado.lessThan(0) ? piorAcumulado.abs() : new Decimal(0);
  const vpl = calcularVPL(fluxo.map((p) => p.fluxoMensal), taxaDescontoMensal);

  return { necessidadeMaximaCapital, mesPico, mesRecuperacao, saldoFinal, vpl };
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
