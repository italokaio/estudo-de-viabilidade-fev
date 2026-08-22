import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularFatorCorrecao, corrigirDesembolsos, corrigirRecebimentos } from "../../src/core/motorCorrecao.js";
import type { DesembolsoMensal, PontoIndiceCorrecao, RecebimentoGerado } from "../../src/core/types.js";

describe("motor de correção monetária", () => {
  it("sem índice cadastrado, o fator é sempre 1", () => {
    const fator = calcularFatorCorrecao(1, 6, []);
    expect(fator.toString()).toBe("1");
  });

  it("mesFim <= mesInicio nunca corrige (o mes-base nao corrige a si mesmo)", () => {
    expect(calcularFatorCorrecao(5, 5, [{ mes: 5, percentual: new Decimal("0.01") }]).toString()).toBe("1");
    expect(calcularFatorCorrecao(5, 3, [{ mes: 4, percentual: new Decimal("0.01") }]).toString()).toBe("1");
  });

  it("acumula (1 + percentual) de cada mes indice no intervalo, excluindo o mes-base", () => {
    const indices: PontoIndiceCorrecao[] = [
      { mes: 2, percentual: new Decimal("0.01") },
      { mes: 3, percentual: new Decimal("0.02") },
    ];
    // mesInicio=1, mesFim=3 -> aplica indice dos meses 2 e 3, nao do mes 1
    const fator = calcularFatorCorrecao(1, 3, indices);
    // 1.01 * 1.02 = 1.0302
    expect(fator.toDecimalPlaces(4).toString()).toBe("1.0302");
  });

  it("mes sem indice cadastrado no meio do intervalo entra com variacao zero", () => {
    const indices: PontoIndiceCorrecao[] = [{ mes: 3, percentual: new Decimal("0.1") }];
    // meses 2 e 3 no intervalo (1,3]; mes 2 sem indice -> fator = 1 * 1.1
    const fator = calcularFatorCorrecao(1, 3, indices);
    expect(fator.toString()).toBe("1.1");
  });

  it("aceita percentual negativo (deflacao)", () => {
    const indices: PontoIndiceCorrecao[] = [{ mes: 2, percentual: new Decimal("-0.05") }];
    const fator = calcularFatorCorrecao(1, 2, indices);
    expect(fator.toString()).toBe("0.95");
  });

  it("corrigirRecebimentos aplica o fator sobre o valorPrevisto, usando o mesOrigem da venda", () => {
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 3, valorPrevisto: new Decimal("1000") },
    ];
    const mesOrigemPorVenda = new Map([["v1", 1]]);
    const indices: PontoIndiceCorrecao[] = [
      { mes: 2, percentual: new Decimal("0.01") },
      { mes: 3, percentual: new Decimal("0.01") },
    ];
    const corrigidos = corrigirRecebimentos(recebimentos, mesOrigemPorVenda, indices);
    expect(corrigidos).toHaveLength(1);
    // 1000 * 1.01 * 1.01 = 1020.10
    expect(corrigidos[0]!.valorCorrigido.toDecimalPlaces(2).toString()).toBe("1020.1");
    expect(corrigidos[0]!.mesCompetencia).toBe(3);
  });

  it("sem indice algum, valorCorrigido é idêntico a valorPrevisto", () => {
    const recebimentos: RecebimentoGerado[] = [
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 5, valorPrevisto: new Decimal("500") },
    ];
    const corrigidos = corrigirRecebimentos(recebimentos, new Map([["v1", 1]]), []);
    expect(corrigidos[0]!.valorCorrigido.toString()).toBe("500");
  });

  it("corrigirDesembolsos aplica o fator sobre o valor, usando um único mes-base para todos os custos (achado F12)", () => {
    const desembolsos: DesembolsoMensal[] = [
      { custoId: "c1", mes: 1, valor: new Decimal("1000") },
      { custoId: "c1", mes: 3, valor: new Decimal("1000") },
    ];
    const indices: PontoIndiceCorrecao[] = [
      { mes: 2, percentual: new Decimal("0.01") },
      { mes: 3, percentual: new Decimal("0.01") },
    ];
    const corrigidos = corrigirDesembolsos(desembolsos, 1, indices);
    expect(corrigidos).toHaveLength(2);
    // mes 1 == mes-base -> nunca corrige a si mesmo
    expect(corrigidos[0]!.valorCorrigido.toString()).toBe("1000");
    // mes 3: 1000 * 1.01 * 1.01 = 1020.10
    expect(corrigidos[1]!.valorCorrigido.toDecimalPlaces(2).toString()).toBe("1020.1");
  });

  it("corrigirDesembolsos sem índice algum é idêntico ao valor nominal", () => {
    const desembolsos: DesembolsoMensal[] = [{ custoId: "c1", mes: 10, valor: new Decimal("5000") }];
    const corrigidos = corrigirDesembolsos(desembolsos, 1, []);
    expect(corrigidos[0]!.valorCorrigido.toString()).toBe("5000");
  });

  describe("índice diferenciado por grupo (achado F20)", () => {
    it("corrigirDesembolsos aplica a série do próprio grupo do desembolso, não a série padrão", () => {
      const desembolsos: DesembolsoMensal[] = [
        { custoId: "c1", mes: 3, valor: new Decimal("1000"), grupoIndiceCorrecao: "padrao" },
        { custoId: "c2", mes: 3, valor: new Decimal("1000"), grupoIndiceCorrecao: "obra" },
      ];
      const indices: PontoIndiceCorrecao[] = [
        { mes: 3, percentual: new Decimal("0.10"), grupo: "padrao" },
        { mes: 3, percentual: new Decimal("0.50"), grupo: "obra" },
      ];
      const corrigidos = corrigirDesembolsos(desembolsos, 1, indices);
      expect(corrigidos[0]!.valorCorrigido.toString()).toBe("1100");
      expect(corrigidos[1]!.valorCorrigido.toString()).toBe("1500");
    });

    it("desembolso sem grupoIndiceCorrecao informado usa a série 'padrao'", () => {
      const desembolsos: DesembolsoMensal[] = [{ custoId: "c1", mes: 3, valor: new Decimal("1000") }];
      const indices: PontoIndiceCorrecao[] = [{ mes: 3, percentual: new Decimal("0.10"), grupo: "padrao" }];
      const corrigidos = corrigirDesembolsos(desembolsos, 1, indices);
      expect(corrigidos[0]!.valorCorrigido.toString()).toBe("1100");
    });

    it("um grupo sem nenhum ponto cadastrado tem fator 1, mesmo com outras séries cadastradas", () => {
      const desembolsos: DesembolsoMensal[] = [{ custoId: "c1", mes: 3, valor: new Decimal("1000"), grupoIndiceCorrecao: "obra" }];
      const indices: PontoIndiceCorrecao[] = [{ mes: 3, percentual: new Decimal("0.90"), grupo: "padrao" }];
      const corrigidos = corrigirDesembolsos(desembolsos, 1, indices);
      expect(corrigidos[0]!.valorCorrigido.toString()).toBe("1000");
    });

    it("corrigirRecebimentos sempre usa a série 'padrao', ignorando outras séries cadastradas", () => {
      const recebimentos: RecebimentoGerado[] = [{ vendaId: "v1", modalidadeId: "m1", mesCompetencia: 3, valorPrevisto: new Decimal("1000") }];
      const indices: PontoIndiceCorrecao[] = [{ mes: 3, percentual: new Decimal("0.90"), grupo: "obra" }];
      const corrigidos = corrigirRecebimentos(recebimentos, new Map([["v1", 1]]), indices);
      expect(corrigidos[0]!.valorCorrigido.toString()).toBe("1000");
    });
  });
});
