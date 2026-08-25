import { Decimal } from "decimal.js";
import type { DesembolsoMensal, PontoCronograma, PontoCurvaCronograma } from "./types.js";

/**
 * Combina a curva fisica do cronograma (PontoCronograma, entrada) com o
 * desembolso financeiro que ela gerou (DesembolsoMensal, ja calculado pela
 * estrategia "pct_execucao" de motorCustos.gerarDesembolsosMensais) em uma
 * unica serie mensal, com percentual e desembolso ja acumulados.
 *
 * `desembolsosObra` deve vir pre-filtrado pelo chamador (src/db) para
 * conter apenas desembolsos de Custo cuja categoria tem
 * tipoIncidencia="pct_execucao" -- este arquivo nao sabe o que e uma
 * categoria ou um Custo, so soma valores por mes (mesmo principio de
 * gerarDesembolsosMensais: nenhuma funcao do motor sabe o nome da rubrica
 * que a usa).
 *
 * Os meses da serie de saida sao a uniao dos meses do cronograma com os
 * meses de desembolsosObra (um custo pct_execucao so gera desembolso nos
 * meses em que o cronograma tem percentual > 0, mas a uniao evita perder um
 * mes caso as duas listas divirjam por algum motivo).
 */
export function calcularCurvaCronograma(cronograma: PontoCronograma[], desembolsosObra: DesembolsoMensal[]): PontoCurvaCronograma[] {
  const percentualPorMes = new Map<number, Decimal>();
  for (const ponto of cronograma) {
    percentualPorMes.set(ponto.mes, (percentualPorMes.get(ponto.mes) ?? new Decimal(0)).plus(ponto.percentualExecucaoMensal));
  }

  const desembolsoPorMes = new Map<number, Decimal>();
  for (const d of desembolsosObra) {
    desembolsoPorMes.set(d.mes, (desembolsoPorMes.get(d.mes) ?? new Decimal(0)).plus(d.valor));
  }

  const meses = [...new Set([...percentualPorMes.keys(), ...desembolsoPorMes.keys()])].sort((a, b) => a - b);

  const curva: PontoCurvaCronograma[] = [];
  let percentualAcumulado = new Decimal(0);
  let desembolsoAcumulado = new Decimal(0);
  for (const mes of meses) {
    const percentualExecucaoMensal = percentualPorMes.get(mes) ?? new Decimal(0);
    const desembolsoMensal = desembolsoPorMes.get(mes) ?? new Decimal(0);
    percentualAcumulado = percentualAcumulado.plus(percentualExecucaoMensal);
    desembolsoAcumulado = desembolsoAcumulado.plus(desembolsoMensal);
    curva.push({ mes, percentualExecucaoMensal, percentualAcumulado, desembolsoMensal, desembolsoAcumulado });
  }
  return curva;
}
