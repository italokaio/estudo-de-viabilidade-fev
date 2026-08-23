import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { gerarDesembolsosMensais, validarCronograma, type ContextoCustos } from "../../src/core/motorCustos.js";
import type { CustoInput, VendaInput } from "../../src/core/types.js";

const ctxBase: ContextoCustos = {
  vendas: [],
  recebidoPorMes: new Map(),
  recebimentos: [],
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

  it("pct_recebido_no_mes: a comissao acompanha cada parcela recebida, no mesmo mes dela (achado F25 — comissao na curva de recebimento)", () => {
    const vendas: VendaInput[] = [
      { id: "v1", unidadeId: "u1", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("200000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
    ];
    const recebimentos = [
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 1, valorPrevisto: new Decimal("80000") }, // 40% no mes 1
      { vendaId: "v1", modalidadeId: "m2", mesCompetencia: 6, valorPrevisto: new Decimal("120000") }, // 60% no mes 6
    ];
    const custo: CustoInput = {
      id: "c-curva",
      categoriaNome: "Comissao",
      tipoIncidencia: "pct_recebido_no_mes",
      percentual: new Decimal("0.1"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas, recebimentos });
    const porMes = new Map(desembolsos.map((d) => [d.mes, d.valor.toString()]));
    expect(porMes.get(1)).toBe("8000"); // 80000 * 10%
    expect(porMes.get(6)).toBe("12000"); // 120000 * 10%
  });

  it("pct_recebido_no_mes com tipologiaId: incide só sobre recebimentos de vendas daquela tipologia", () => {
    const vendas: VendaInput[] = [
      { id: "v1", unidadeId: "u1", tipologiaId: "t-apto", mesOrigem: 1, valorVenda: new Decimal("200000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
      { id: "v2", unidadeId: "u2", tipologiaId: "t-loja", mesOrigem: 1, valorVenda: new Decimal("50000"), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } },
    ];
    const recebimentos = [
      { vendaId: "v1", modalidadeId: "m1", mesCompetencia: 1, valorPrevisto: new Decimal("200000") },
      { vendaId: "v2", modalidadeId: "m2", mesCompetencia: 1, valorPrevisto: new Decimal("50000") },
    ];
    const custo: CustoInput = {
      id: "c-curva-loja",
      categoriaNome: "Comissao",
      tipoIncidencia: "pct_recebido_no_mes",
      percentual: new Decimal("0.1"),
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      tipologiaId: "t-loja",
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas, recebimentos });
    // so o recebimento de v2 (loja, 50000) entra na base -- v1 (apto) e ignorado por este custo escopado.
    expect(desembolsos).toEqual([{ custoId: "c-curva-loja", mes: 1, valor: new Decimal("5000") }]); // 50000 * 10%
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

  it("cada desembolso gerado carrega o grupoIndiceCorrecao do custo que o originou (achado F20)", () => {
    const custo: CustoInput = {
      id: "c6",
      categoriaNome: "Obra",
      tipoIncidencia: "fixo",
      valorPrevisto: new Decimal("50000"),
      competenciaMes: 2,
      recorrencia: "unico",
      participaFluxoCaixa: true,
      grupoIndiceCorrecao: "obra",
    };
    const desembolsos = gerarDesembolsosMensais(custo, ctxBase);
    expect(desembolsos).toEqual([{ custoId: "c6", mes: 2, valor: new Decimal("50000"), grupoIndiceCorrecao: "obra" }]);
  });
});

describe("motor de custos — faixas de comissão progressiva por VGV acumulado (achado F28)", () => {
  function venda(id: string, mesOrigem: number, valorVenda: string, tipologiaId = "t-apto"): VendaInput {
    return { id, unidadeId: `u-${id}`, tipologiaId, mesOrigem, valorVenda: new Decimal(valorVenda), condicaoPagamento: { id: "x", nome: "x", modalidades: [] } };
  }

  const faixas = [
    { volumeAte: new Decimal("1000000"), percentual: new Decimal("0.03") },
    { volumeAte: new Decimal("2000000"), percentual: new Decimal("0.04") },
    { percentual: new Decimal("0.05") }, // faixa aberta, sem volumeAte
  ];

  it("cada venda usa a taxa da faixa em que o VGV acumulado se encontra após incluí-la — taxa única, não fatiada", () => {
    const vendas = [venda("v1", 1, "800000"), venda("v2", 2, "500000"), venda("v3", 3, "1000000")];
    const custo: CustoInput = {
      id: "c7",
      categoriaNome: "Comissão progressiva",
      tipoIncidencia: "faixas_vgv_acumulado",
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      faixas,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas });
    const porMes = new Map(desembolsos.map((d) => [d.mes, d.valor.toString()]));
    // v1: acumulado 800.000 (<=1.000.000) -> 3% de 800.000 = 24.000
    expect(porMes.get(1)).toBe("24000");
    // v2: acumulado 1.300.000 (<=2.000.000) -> 4% de 500.000 = 20.000
    expect(porMes.get(2)).toBe("20000");
    // v3: acumulado 2.300.000 (faixa aberta) -> 5% de 1.000.000 = 50.000
    expect(porMes.get(3)).toBe("50000");
  });

  it("o VGV acumula desde o início do cenário, nunca reinicia — não depende de reordenar as faixas na entrada", () => {
    const vendas = [venda("v1", 1, "1500000")];
    const custo: CustoInput = {
      id: "c8",
      categoriaNome: "Comissão progressiva",
      tipoIncidencia: "faixas_vgv_acumulado",
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      // faixas fora de ordem -- o motor precisa ordenar sozinho
      faixas: [faixas[2]!, faixas[0]!, faixas[1]!],
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas });
    // acumulado 1.500.000 cai na segunda faixa (<=2.000.000) -> 4% de 1.500.000 = 60.000
    expect(desembolsos).toEqual([{ custoId: "c8", mes: 1, valor: new Decimal("60000") }]);
  });

  it("escopado a uma tipologia, o VGV acumulado só considera as vendas daquela tipologia (mesmo mecanismo do achado F11)", () => {
    const vendas = [venda("v1", 1, "800000", "t-apto"), venda("v2", 1, "800000", "t-loja"), venda("v3", 2, "500000", "t-apto")];
    const custo: CustoInput = {
      id: "c9",
      categoriaNome: "Comissão progressiva",
      tipologiaId: "t-apto",
      tipoIncidencia: "faixas_vgv_acumulado",
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      faixas,
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas });
    const porMes = new Map(desembolsos.map((d) => [d.mes, d.valor.toString()]));
    // a venda da loja (mes 1) e ignorada -- acumulado do apto e so 800.000 no mes 1
    expect(porMes.get(1)).toBe("24000"); // 3% de 800.000
    expect(porMes.get(2)).toBe("20000"); // acumulado 1.300.000 -> 4% de 500.000
  });

  it("sem nenhuma faixa cadastrada ainda, gera comissão zero em vez de falhar — mesmo espírito de um cronograma sem pontos", () => {
    const vendas = [venda("v1", 1, "800000")];
    const custo: CustoInput = {
      id: "c10",
      categoriaNome: "Comissão progressiva",
      tipoIncidencia: "faixas_vgv_acumulado",
      recorrencia: "mensal",
      participaFluxoCaixa: true,
      faixas: [],
    };
    const desembolsos = gerarDesembolsosMensais(custo, { ...ctxBase, vendas });
    expect(desembolsos).toEqual([{ custoId: "c10", mes: 1, valor: new Decimal("0") }]);
  });
});
