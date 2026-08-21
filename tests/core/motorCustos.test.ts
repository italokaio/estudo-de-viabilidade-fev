import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { gerarDesembolsosMensais, validarCronograma, type ContextoCustos } from "../../src/core/motorCustos.js";
import type { CustoInput, VendaInput } from "../../src/core/types.js";

const ctxBase: ContextoCustos = {
  vendas: [],
  recebidoPorMes: new Map(),
  cronograma: [],
  horizonteMeses: 6,
};

describe("motor de custos — as 4 estrategias de incidencia", () => {
  it("fixo + unico: lanca o valor integral em um mes", () => {
    const custo: CustoInput = {
      id: "c1",
      categoriaNome: "Qualquer",
      tipoIncidencia: "fixo",
      valorPrevisto: new Decimal("10000"),
      competenciaMes: 3,
      recorrencia: "unico",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, ctxBase);
    expect(desembolsos).toEqual([{ custoId: "c1", mes: 3, valor: new Decimal("10000") }]);
  });

  it("fixo + mensal: repete o valor do mes de competencia ate o horizonte", () => {
    const custo: CustoInput = {
      id: "c2",
      categoriaNome: "Administrativo",
      tipoIncidencia: "fixo",
      valorPrevisto: new Decimal("1000"),
      competenciaMes: 4,
      recorrencia: "mensal",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, ctxBase);
    expect(desembolsos.map((d) => d.mes)).toEqual([4, 5, 6]);
    expect(desembolsos.every((d) => d.valor.toString() === "1000")).toBe(true);
  });

  it("pct_vgv_vendido_no_mes: incide sobre o total vendido em cada mes", () => {
    const vendas: VendaInput[] = [
      { id: "v1", unidadeId: "u1", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("100000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
      { id: "v2", unidadeId: "u2", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("50000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
      { id: "v3", unidadeId: "u3", tipologiaId: "t-loja", mesOrigem: 2, valorVenda: new Decimal("200000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
    ];
    const custo: CustoInput = {
      id: "c3",
      categoriaNome: "Comissao",
      tipoIncidencia: "pct_vgv_vendido_no_mes",
      percentual: new Decimal("0.05"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas });
    const porMes = new Map(desembolsos.map((d) => [d.mes, d.valor.toString()]));
    expect(porMes.get(1)).toBe("7500"); // (100000+50000) * 5%
    expect(porMes.get(2)).toBe("10000"); // 200000 * 5%
  });

  it("pct_vgv_vendido_no_mes com tipologiaId: incide só sobre as vendas daquela tipologia (achado F11 — estrutura de comissao)", () => {
    const vendas: VendaInput[] = [
      { id: "v1", unidadeId: "u1", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("100000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
      { id: "v2", unidadeId: "u2", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("50000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
      { id: "v3", unidadeId: "u3", tipologiaId: "t-loja", mesOrigem: 1, valorVenda: new Decimal("200000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
    ];
    const comissaoLoja: CustoInput = {
      id: "c-loja",
      categoriaNome: "Comissao",
      tipoIncidencia: "pct_vgv_vendido_no_mes",
      percentual: new Decimal("0.08"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      tipologiaId: "t-loja",
    };
    const desembolsos = gerarDesembolsosMensais(comissaoLoja, { ...ctxBase, vendas });
    // so a venda v3 (loja) entra na base -- v1/v2 (apto) sao ignoradas por este custo.
    expect(desembolsos).toEqual([{ custoId: "c-loja", mes: 1, valor: new Decimal("16000") }]); // 200000 * 8%
  });

  it("pct_recebido_mes_anterior: incide sobre o total recebido no mes anterior", () => {
    const recebidoPorMes = new Map([
      [1, new Decimal("100000")],
      [2, new Decimal("150000")],
    ]);
    const custo: CustoInput = {
      id: "c4",
      categoriaNome: "Encargo",
      tipoIncidencia: "pct_recebido_mes_anterior",
      percentual: new Decimal("0.04"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, recebidoPorMes, horizonteMeses: 3 });
    const porMes = new Map(desembolsos.map((d) => [d.mes, d.valor.toString()]));
    expect(porMes.get(2)).toBe("4000"); // 100000 (mes 1) * 4%
    expect(porMes.get(3)).toBe("6000"); // 150000 (mes 2) * 4%
    expect(porMes.has(1)).toBe(false); // nao ha mes 0
  });

  it("pct_execucao: distribui o custo total pela curva de cronograma", () => {
    const cronograma = [
      { mes: 1, percentualExecucaoMensal: new Decimal("0.5") },
      { mes: 2, percentualExecucaoMensal: new Decimal("0.3") },
      { mes: 3, percentualExecucaoMensal: new Decimal("0.2") },
    ];
    const custo: CustoInput = {
      id: "c5",
      categoriaNome: "Obra",
      tipoIncidencia: "pct_execucao",
      valorPrevisto: new Decimal("1000000"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, cronograma });
    expect(desembolsos.map((d) => d.valor.toString())).toEqual(["500000", "300000", "200000"]);
  });

  it("validarCronograma aceita soma=1 e rejeita soma diferente de 1", () => {
    expect(validarCronograma([{ mes: 1, percentualExecucaoMensal: new Decimal("1") }]).valido).toBe(true);
    expect(validarCronograma([{ mes: 1, percentualExecucaoMensal: new Decimal("0.5") }]).valido).toBe(false);
  });
});
