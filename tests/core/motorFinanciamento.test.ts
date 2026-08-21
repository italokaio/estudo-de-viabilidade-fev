import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularFinanciamento } from "../../src/core/motorFinanciamento.js";
import type { PontoCronograma } from "../../src/core/types.js";

describe("motor de financiamento de produção", () => {
  it("sem cronograma cadastrado, nenhuma liberação acontece (mesma regra honesta de pct_execucao)", () => {
    const pontos = calcularFinanciamento(
      { valorContratado: new Decimal("1000000"), taxaJurosMensal: new Decimal("0.01"), mesAmortizacao: 6 },
      [],
      6,
    );
    expect(pontos.every((p) => p.liberacao.isZero())).toBe(true);
    expect(pontos.every((p) => p.amortizacao.isZero())).toBe(true);
  });

  it("libera exatamente o valor contratado ao longo da curva do cronograma, sem juros ainda embutidos na liberação", () => {
    const cronograma: PontoCronograma[] = [
      { mes: 1, percentualExecucaoMensal: new Decimal("0.5") },
      { mes: 2, percentualExecucaoMensal: new Decimal("0.5") },
    ];
    const pontos = calcularFinanciamento({ valorContratado: new Decimal("1000000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 3 }, cronograma, 3);
    expect(pontos[0]!.liberacao.toString()).toBe("500000");
    expect(pontos[1]!.liberacao.toString()).toBe("500000");
    // sem juros, saldo apos as duas liberacoes = 1000000, exatamente o valor contratado
    expect(pontos[1]!.saldoDevedor.toString()).toBe("1000000");
  });

  it("juros capitalizam mês a mês sobre o saldo devedor antes da nova liberação", () => {
    const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
    const pontos = calcularFinanciamento({ valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0.1"), mesAmortizacao: 3 }, cronograma, 3);
    // mes 1: saldo comeca em 0, juros sobre 0 = 0, libera 100000 -> saldo = 100000
    expect(pontos[0]!.saldoDevedor.toString()).toBe("100000");
    // mes 2: juros de 10% sobre 100000 = 10000, sem liberacao -> saldo = 110000
    expect(pontos[1]!.jurosDoMes.toString()).toBe("10000");
    expect(pontos[1]!.saldoDevedor.toString()).toBe("110000");
  });

  it("amortização paga o saldo devedor inteiro de uma vez no mês configurado, zerando o saldo depois", () => {
    const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
    const pontos = calcularFinanciamento({ valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0.1"), mesAmortizacao: 2 }, cronograma, 4);
    // mes 2: saldo antes da amortizacao = 110000 (achado do teste anterior) -> amortizacao = 110000
    expect(pontos[1]!.amortizacao.toString()).toBe("110000");
    expect(pontos[1]!.saldoDevedor.toString()).toBe("0");
    // meses seguintes, sem liberacao nem saldo, tudo zero
    expect(pontos[2]!.liberacao.toString()).toBe("0");
    expect(pontos[2]!.saldoDevedor.toString()).toBe("0");
  });

  it("liberação e amortização podem ocorrer no mesmo mês (o saldo antes da amortização já inclui a liberação daquele mês)", () => {
    const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
    const pontos = calcularFinanciamento({ valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 1 }, cronograma, 1);
    expect(pontos[0]!.liberacao.toString()).toBe("100000");
    expect(pontos[0]!.amortizacao.toString()).toBe("100000");
    expect(pontos[0]!.saldoDevedor.toString()).toBe("0");
  });
});
