import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularPrecoPorAndar, type RegraPrecificacaoAndar } from "../../src/core/precificacaoAndar.js";

describe("calcularPrecoPorAndar", () => {
  it("incremento fixo soma linearmente por andar acima da base", () => {
    const regra: RegraPrecificacaoAndar = {
      precoBase: new Decimal("300000"),
      andarBase: 1,
      incremento: new Decimal("5000"),
      tipoIncremento: "fixo",
    };
    expect(calcularPrecoPorAndar(1, regra).toString()).toBe("300000");
    expect(calcularPrecoPorAndar(2, regra).toString()).toBe("305000");
    expect(calcularPrecoPorAndar(10, regra).toString()).toBe("345000");
  });

  it("incremento fixo reduz para andares abaixo da base", () => {
    const regra: RegraPrecificacaoAndar = {
      precoBase: new Decimal("300000"),
      andarBase: 5,
      incremento: new Decimal("5000"),
      tipoIncremento: "fixo",
    };
    expect(calcularPrecoPorAndar(1, regra).toString()).toBe("280000");
  });

  it("incremento percentual multiplica geometricamente por andar acima da base", () => {
    const regra: RegraPrecificacaoAndar = {
      precoBase: new Decimal("300000"),
      andarBase: 1,
      incremento: new Decimal("0.02"),
      tipoIncremento: "percentual",
    };
    expect(calcularPrecoPorAndar(1, regra).toString()).toBe("300000");
    // 300000 * 1.02^1
    expect(calcularPrecoPorAndar(2, regra).toFixed(2)).toBe("306000.00");
    // 300000 * 1.02^2
    expect(calcularPrecoPorAndar(3, regra).toFixed(2)).toBe("312120.00");
  });

  it("diferenca zero (andar = andarBase) sempre devolve o preco base, em qualquer tipo", () => {
    const base = new Decimal("500000");
    const regraFixa: RegraPrecificacaoAndar = { precoBase: base, andarBase: 7, incremento: new Decimal("10000"), tipoIncremento: "fixo" };
    const regraPct: RegraPrecificacaoAndar = { precoBase: base, andarBase: 7, incremento: new Decimal("0.03"), tipoIncremento: "percentual" };
    expect(calcularPrecoPorAndar(7, regraFixa).toString()).toBe(base.toString());
    expect(calcularPrecoPorAndar(7, regraPct).toString()).toBe(base.toString());
  });
});
