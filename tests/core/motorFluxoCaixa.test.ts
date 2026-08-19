import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularIndicadores, consolidarFluxoCaixa } from "../../src/core/motorFluxoCaixa.js";
import type { DesembolsoMensal, RecebimentoGerado } from "../../src/core/types.js";

describe("motor de fluxo de caixa", () => {
  it("consolida entradas e saidas mes a mes, com acumulado", () => {
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 1, valorPrevisto: new Decimal("1000") },
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 2, valorPrevisto: new Decimal("2000") },
    ];
    const desembolsos: DesembolsoMensal[] = [
      { custoId: "c1", mes: 1, valor: new Decimal("500") },
      { custoId: "c1", mes: 2, valor: new Decimal("2500") },
    ];

    const fluxo = consolidarFluxoCaixa(recebimentos, desembolsos, 3);

    expect(fluxo).toHaveLength(3);
    expect(fluxo[0]).toMatchObject({ mes: 1, entradas: new Decimal(1000), saidas: new Decimal(500) });
    expect(fluxo[0]!.fluxoMensal.toString()).toBe("500");
    expect(fluxo[0]!.fluxoAcumulado.toString()).toBe("500");
    expect(fluxo[1]!.fluxoMensal.toString()).toBe("-500"); // 2000 - 2500
    expect(fluxo[1]!.fluxoAcumulado.toString()).toBe("0"); // 500 + (-500)
    expect(fluxo[2]!.entradas.toString()).toBe("0");
    expect(fluxo[2]!.fluxoAcumulado.toString()).toBe("0");
  });

  it("identifica pico de necessidade de capital e mes de recuperacao sustentada, nao o primeiro cruzamento", () => {
    // acumulado por mes: 100, -200, -50, 10, -5, 300, 400
    // deve identificar o pico em -200 (mes 2) e a recuperacao no mes 6
    // (mes 4 cruza zero mas cai de novo no mes 5 — nao pode ser "recuperacao")
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 1, valorPrevisto: new Decimal("100") },
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 3, valorPrevisto: new Decimal("150") },
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 4, valorPrevisto: new Decimal("60") },
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 6, valorPrevisto: new Decimal("305") },
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 7, valorPrevisto: new Decimal("100") },
    ];
    const desembolsos: DesembolsoMensal[] = [
      { custoId: "c", mes: 2, valor: new Decimal("300") },
      { custoId: "c", mes: 5, valor: new Decimal("15") },
    ];

    const fluxo = consolidarFluxoCaixa(recebimentos, desembolsos, 7);
    const acumulados = fluxo.map((f) => f.fluxoAcumulado.toString());
    expect(acumulados).toEqual(["100", "-200", "-50", "10", "-5", "300", "400"]);

    const indicadores = calcularIndicadores(fluxo, new Decimal(0));
    expect(indicadores.mesPico).toBe(2);
    expect(indicadores.necessidadeMaximaCapital.toString()).toBe("200");
    expect(indicadores.mesRecuperacao).toBe(6);
    expect(indicadores.saldoFinal.toString()).toBe("400");
  });

  it("VPL a taxa 0% e igual a soma simples dos fluxos mensais", () => {
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 1, valorPrevisto: new Decimal("1000") },
    ];
    const fluxo = consolidarFluxoCaixa(recebimentos, [], 2);
    const indicadores = calcularIndicadores(fluxo, new Decimal(0));
    expect(indicadores.vpl.toString()).toBe("1000");
  });

  it("VPL desconta fluxos futuros a uma taxa mensal positiva", () => {
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v", modalidadeId: "m", mesCompetencia: 1, valorPrevisto: new Decimal("1000") },
    ];
    const fluxo = consolidarFluxoCaixa(recebimentos, [], 1);
    const indicadores = calcularIndicadores(fluxo, new Decimal("0.01"));
    // 1000 / 1.01^1 = 990.099...
    expect(indicadores.vpl.toDecimalPlaces(2).toString()).toBe("990.1");
  });
});
