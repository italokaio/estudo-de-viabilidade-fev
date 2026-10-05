import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularTIRMensal } from "../../src/core/motorFluxoCaixa.js";

const d = (v: number) => new Decimal(v);

describe("calcularTIRMensal", () => {
  it("fluxo de investimento seguido de retorno de 10% devolve 10% a.m.", () => {
    const tir = calcularTIRMensal([d(-100), d(110)]);
    expect(tir).not.toBeNull();
    expect(tir!.toFixed(6)).toBe("0.100000");
  });

  it("fluxo com investimento e retorno em dois meses devolve a taxa que zera o VPL", () => {
    const fluxo = [d(-100), d(0), d(121)];
    const tir = calcularTIRMensal(fluxo)!;
    expect(tir.toFixed(4)).toBe("0.1000");
  });

  it("sem entradas ou sem saidas, nao ha TIR", () => {
    expect(calcularTIRMensal([d(10), d(20)])).toBeNull();
    expect(calcularTIRMensal([d(-10), d(-20)])).toBeNull();
  });

  it("fluxo zerado nao tem TIR", () => {
    expect(calcularTIRMensal([d(0), d(0)])).toBeNull();
  });
});
