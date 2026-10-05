import { describe, expect, it } from "vitest";
import { precisaNotaPaybackDescontado } from "../../src/relatorios/resumo.js";

describe("nota do payback descontado", () => {
  it("só aparece quando o descontado sai antes do simples", () => {
    expect(precisaNotaPaybackDescontado(5, 3)).toBe(true);
    expect(precisaNotaPaybackDescontado(5, 5)).toBe(false);
    expect(precisaNotaPaybackDescontado(3, 5)).toBe(false);
  });

  it("não aparece quando algum dos dois não recupera no horizonte", () => {
    expect(precisaNotaPaybackDescontado(null, 3)).toBe(false);
    expect(precisaNotaPaybackDescontado(5, null)).toBe(false);
    expect(precisaNotaPaybackDescontado(null, null)).toBe(false);
  });
});
