import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularMargemLiquida } from "../../src/core/motorFluxoCaixa.js";

describe("calcularMargemLiquida", () => {
  it("é saldo final dividido pelo VGV", () => {
    expect(calcularMargemLiquida(new Decimal(40), new Decimal(100))!.toFixed(3)).toBe("0.400");
  });

  it("sem VGV não há margem", () => {
    expect(calcularMargemLiquida(new Decimal(40), new Decimal(0))).toBeNull();
    expect(calcularMargemLiquida(new Decimal(40), new Decimal(-5))).toBeNull();
  });
});
