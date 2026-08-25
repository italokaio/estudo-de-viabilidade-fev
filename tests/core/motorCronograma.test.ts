import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularCurvaCronograma } from "../../src/core/motorCronograma.js";
import type { DesembolsoMensal, PontoCronograma } from "../../src/core/types.js";

describe("motor de cronograma — calcularCurvaCronograma", () => {
  it("acumula percentual fisico e desembolso financeiro mes a mes", () => {
    const cronograma: PontoCronograma[] = [
      { mes: 1, percentualExecucaoMensal: new Decimal("0.5") },
      { mes: 2, percentualExecucaoMensal: new Decimal("0.3") },
      { mes: 3, percentualExecucaoMensal: new Decimal("0.2") },
    ];
    const desembolsosObra: DesembolsoMensal[] = [
      { custoId: "obra", mes: 1, valor: new Decimal("500000") },
      { custoId: "obra", mes: 2, valor: new Decimal("300000") },
      { custoId: "obra", mes: 3, valor: new Decimal("200000") },
    ];

    const curva = calcularCurvaCronograma(cronograma, desembolsosObra);

    expect(curva.map((p) => p.mes)).toEqual([1, 2, 3]);
    expect(curva.map((p) => p.percentualExecucaoMensal.toString())).toEqual(["0.5", "0.3", "0.2"]);
    expect(curva.map((p) => p.percentualAcumulado.toString())).toEqual(["0.5", "0.8", "1"]);
    expect(curva.map((p) => p.desembolsoMensal.toString())).toEqual(["500000", "300000", "200000"]);
    expect(curva.map((p) => p.desembolsoAcumulado.toString())).toEqual(["500000", "800000", "1000000"]);
  });

  it("cronograma vazio devolve serie vazia", () => {
    expect(calcularCurvaCronograma([], [])).toEqual([]);
  });

  it("mes de cronograma sem nenhum custo pct_execucao gera desembolso zero naquele mes, sem quebrar o acumulado", () => {
    const cronograma: PontoCronograma[] = [
      { mes: 1, percentualExecucaoMensal: new Decimal("0.6") },
      { mes: 2, percentualExecucaoMensal: new Decimal("0.4") },
    ];
    // nenhum Custo com tipoIncidencia="pct_execucao" cadastrado ainda --
    // desembolsosObra vazio (mesmo comportamento hoje documentado como
    // "custo pct_execucao sem cronograma gera zero desembolso, silenciosamente").
    const curva = calcularCurvaCronograma(cronograma, []);

    expect(curva.map((p) => p.desembolsoMensal.toString())).toEqual(["0", "0"]);
    expect(curva.map((p) => p.desembolsoAcumulado.toString())).toEqual(["0", "0"]);
    expect(curva.map((p) => p.percentualAcumulado.toString())).toEqual(["0.6", "1"]);
  });

  it("soma desembolsos de mais de um custo pct_execucao no mesmo mes e ordena por mes independente da ordem de entrada", () => {
    const cronograma: PontoCronograma[] = [
      { mes: 2, percentualExecucaoMensal: new Decimal("0.5") },
      { mes: 1, percentualExecucaoMensal: new Decimal("0.5") },
    ];
    const desembolsosObra: DesembolsoMensal[] = [
      { custoId: "materiais", mes: 1, valor: new Decimal("100000") },
      { custoId: "mao-de-obra", mes: 1, valor: new Decimal("50000") },
      { custoId: "materiais", mes: 2, valor: new Decimal("80000") },
    ];

    const curva = calcularCurvaCronograma(cronograma, desembolsosObra);

    expect(curva.map((p) => p.mes)).toEqual([1, 2]);
    expect(curva.map((p) => p.desembolsoMensal.toString())).toEqual(["150000", "80000"]);
    expect(curva.map((p) => p.desembolsoAcumulado.toString())).toEqual(["150000", "230000"]);
  });
});
