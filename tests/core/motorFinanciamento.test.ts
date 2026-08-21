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

  /**
   * Tabela de amortização SAC/Price (achado F16, docs/DECISOES.md):
   * alternativas ao pagamento único, fixadas sobre o saldo devedor
   * acumulado até o início de mesAmortizacao.
   */
  describe("SAC — amortização constante, parcela decrescente", () => {
    it("divide o principal em parcelas iguais; juros decrescem porque incidem sobre o saldo remanescente", () => {
      const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
      const pontos = calcularFinanciamento(
        { valorContratado: new Decimal("120000"), taxaJurosMensal: new Decimal("0.01"), mesAmortizacao: 2, tipoAmortizacao: "sac", numeroParcelas: 12 },
        cronograma,
        13,
      );
      // mes 1: libera 120000, sem juros (saldo comecou em 0) -> saldo = 120000 (principal da tabela)
      expect(pontos[0]!.saldoDevedor.toString()).toBe("120000");

      // mes 2 (1a parcela): juros = 120000*1% = 1200; principal pago = 120000/12 = 10000; parcela total = 11200
      expect(pontos[1]!.jurosDoMes.toString()).toBe("1200");
      expect(pontos[1]!.amortizacao.toString()).toBe("11200");
      expect(pontos[1]!.saldoDevedor.toString()).toBe("110000");

      // mes 3 (2a parcela): juros sobre o saldo remanescente (110000), nao mais sobre o principal original
      expect(pontos[2]!.jurosDoMes.toString()).toBe("1100");
      expect(pontos[2]!.amortizacao.toString()).toBe("11100");
      expect(pontos[2]!.saldoDevedor.toString()).toBe("100000");

      // ultima parcela (mes 13, k=11): saldo chega exatamente a zero
      expect(pontos[12]!.saldoDevedor.toString()).toBe("0");
      expect(pontos[12]!.amortizacao.toString()).toBe("10100"); // principal 10000 + juros sobre os ultimos 10000
    });
  });

  describe("Price — parcela constante, amortização crescente", () => {
    it("toda parcela tem o mesmo valor total; juros decrescem e amortização do principal cresce mês a mês", () => {
      const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
      const pontos = calcularFinanciamento(
        { valorContratado: new Decimal("120000"), taxaJurosMensal: new Decimal("0.01"), mesAmortizacao: 2, tipoAmortizacao: "price", numeroParcelas: 12 },
        cronograma,
        13,
      );

      const parcelas = pontos.slice(1); // meses 2..13
      const primeiraParcela = parcelas[0]!.amortizacao.toDecimalPlaces(2).toString();
      for (const p of parcelas) {
        expect(p.amortizacao.toDecimalPlaces(2).toString()).toBe(primeiraParcela);
      }

      // amortizacao do principal cresce mes a mes (juros decrescem na mesma proporcao)
      const principalPago = (p: (typeof parcelas)[number]) => p.amortizacao.minus(p.jurosDoMes);
      expect(principalPago(parcelas[1]!).greaterThan(principalPago(parcelas[0]!))).toBe(true);
      expect(principalPago(parcelas[11]!).greaterThan(principalPago(parcelas[10]!))).toBe(true);

      // ao final das 12 parcelas, o saldo devedor chega a (praticamente) zero
      expect(pontos[12]!.saldoDevedor.toDecimalPlaces(6).abs().lessThan("0.01")).toBe(true);
    });

    it("com juros zero, Price se comporta como parcelas iguais do principal (equivalente ao SAC sem juros)", () => {
      const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
      const pontos = calcularFinanciamento(
        { valorContratado: new Decimal("120000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 2, tipoAmortizacao: "price", numeroParcelas: 12 },
        cronograma,
        13,
      );
      expect(pontos[1]!.amortizacao.toString()).toBe("10000");
      expect(pontos[12]!.saldoDevedor.toString()).toBe("0");
    });
  });

  it("tipoAmortizacao omitido continua se comportando como pagamento único (compatibilidade retroativa)", () => {
    const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
    const pontos = calcularFinanciamento({ valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0.1"), mesAmortizacao: 2 }, cronograma, 4);
    expect(pontos[1]!.amortizacao.toString()).toBe("110000");
    expect(pontos[1]!.saldoDevedor.toString()).toBe("0");
  });
});
