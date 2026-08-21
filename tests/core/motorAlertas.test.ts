import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularAlertas, type EntradaAlertas } from "../../src/core/motorAlertas.js";
import type { PontoFinanciamento } from "../../src/core/motorFinanciamento.js";
import type { CondicaoPagamento, CustoInput, IndicadoresFluxo, PontoCronograma, RecebimentoGerado, VendaInput } from "../../src/core/types.js";

describe("motor de alertas de risco", () => {
  const indicadoresNeutros: IndicadoresFluxo = {
    necessidadeMaximaCapital: new Decimal(0),
    mesPico: 1,
    mesRecuperacao: 1,
    saldoFinal: new Decimal(0),
    vpl: new Decimal(0),
  };

  function entradaVazia(): EntradaAlertas {
    return {
      vendas: [],
      custos: [],
      cronograma: [],
      recebimentos: [],
      indicadores: indicadoresNeutros,
      financiamento: [],
    };
  }

  it("cenário vazio não gera nenhum alerta", () => {
    expect(calcularAlertas(entradaVazia())).toEqual([]);
  });

  it("necessidade máxima acima do limite (30% do VGV) gera alerta crítico", () => {
    const condicao: CondicaoPagamento = { id: "c1", nome: "À vista", modalidades: [] };
    const vendas: VendaInput[] = [{ id: "v1", unidadeId: "u1", mesOrigem: 1, valorVenda: new Decimal("100000"), condicaoPagamento: condicao }];
    const entrada: EntradaAlertas = {
      ...entradaVazia(),
      vendas,
      indicadores: { ...indicadoresNeutros, necessidadeMaximaCapital: new Decimal("40000") }, // 40% do VGV
    };
    const alertas = calcularAlertas(entrada);
    expect(alertas.map((a) => a.tipo)).toContain("necessidade_maxima_alta");
    expect(alertas.find((a) => a.tipo === "necessidade_maxima_alta")!.severidade).toBe("critico");
  });

  it("necessidade máxima abaixo do limite não gera alerta", () => {
    const condicao: CondicaoPagamento = { id: "c1", nome: "À vista", modalidades: [] };
    const vendas: VendaInput[] = [{ id: "v1", unidadeId: "u1", mesOrigem: 1, valorVenda: new Decimal("100000"), condicaoPagamento: condicao }];
    const entrada: EntradaAlertas = {
      ...entradaVazia(),
      vendas,
      indicadores: { ...indicadoresNeutros, necessidadeMaximaCapital: new Decimal("20000") }, // 20% do VGV
    };
    expect(calcularAlertas(entrada).map((a) => a.tipo)).not.toContain("necessidade_maxima_alta");
  });

  it("respeita um limite customizado passado explicitamente", () => {
    const condicao: CondicaoPagamento = { id: "c1", nome: "À vista", modalidades: [] };
    const vendas: VendaInput[] = [{ id: "v1", unidadeId: "u1", mesOrigem: 1, valorVenda: new Decimal("100000"), condicaoPagamento: condicao }];
    const entrada: EntradaAlertas = {
      ...entradaVazia(),
      vendas,
      indicadores: { ...indicadoresNeutros, necessidadeMaximaCapital: new Decimal("20000") }, // 20% do VGV
    };
    // limite customizado de 10% -- 20% agora excede
    expect(calcularAlertas(entrada, new Decimal("0.1")).map((a) => a.tipo)).toContain("necessidade_maxima_alta");
  });

  it("mesRecuperacao nulo gera alerta crítico de 'sem recuperação'", () => {
    const entrada: EntradaAlertas = { ...entradaVazia(), indicadores: { ...indicadoresNeutros, mesRecuperacao: null } };
    const alertas = calcularAlertas(entrada);
    expect(alertas.map((a) => a.tipo)).toContain("sem_recuperacao");
    expect(alertas.find((a) => a.tipo === "sem_recuperacao")!.severidade).toBe("critico");
  });

  it("custo pct_execucao sem cronograma gera alerta de aviso", () => {
    const custo: CustoInput = { id: "c1", categoriaNome: "Obra", tipoIncidencia: "pct_execucao", valorPrevisto: new Decimal("100000"), recorrencia: "unico", participaFluxoCaixa: true };
    const entrada: EntradaAlertas = { ...entradaVazia(), custos: [custo], cronograma: [] };
    const alertas = calcularAlertas(entrada);
    expect(alertas.map((a) => a.tipo)).toContain("custo_execucao_sem_cronograma");
    expect(alertas.find((a) => a.tipo === "custo_execucao_sem_cronograma")!.severidade).toBe("aviso");
  });

  it("custo pct_execucao COM cronograma cadastrado não gera o alerta", () => {
    const custo: CustoInput = { id: "c1", categoriaNome: "Obra", tipoIncidencia: "pct_execucao", valorPrevisto: new Decimal("100000"), recorrencia: "unico", participaFluxoCaixa: true };
    const cronograma: PontoCronograma[] = [{ mes: 1, percentualExecucaoMensal: new Decimal("1") }];
    const entrada: EntradaAlertas = { ...entradaVazia(), custos: [custo], cronograma };
    expect(calcularAlertas(entrada).map((a) => a.tipo)).not.toContain("custo_execucao_sem_cronograma");
  });

  it("amortização de financiamento maior que a receita acumulada até o mês gera alerta crítico", () => {
    const financiamento: PontoFinanciamento[] = [
      { mes: 1, liberacao: new Decimal("50000"), jurosDoMes: new Decimal(0), amortizacao: new Decimal(0), saldoDevedor: new Decimal("50000") },
      { mes: 2, liberacao: new Decimal(0), jurosDoMes: new Decimal(0), amortizacao: new Decimal("50000"), saldoDevedor: new Decimal(0) },
    ];
    // nenhum recebimento de venda ate o mes 2 -- a amortizacao nao esta coberta
    const entrada: EntradaAlertas = { ...entradaVazia(), financiamento };
    const alertas = calcularAlertas(entrada);
    expect(alertas.map((a) => a.tipo)).toContain("financiamento_amortizacao_sem_receita");
  });

  it("amortização coberta por receita suficiente não gera o alerta", () => {
    const financiamento: PontoFinanciamento[] = [
      { mes: 1, liberacao: new Decimal("50000"), jurosDoMes: new Decimal(0), amortizacao: new Decimal(0), saldoDevedor: new Decimal("50000") },
      { mes: 2, liberacao: new Decimal(0), jurosDoMes: new Decimal(0), amortizacao: new Decimal("50000"), saldoDevedor: new Decimal(0) },
    ];
    const recebimentos: RecebimentoGerado[] = [{ vendaId: "v1", modalidadeId: "m1", mesCompetencia: 2, valorPrevisto: new Decimal("60000") }];
    const entrada: EntradaAlertas = { ...entradaVazia(), financiamento, recebimentos };
    expect(calcularAlertas(entrada).map((a) => a.tipo)).not.toContain("financiamento_amortizacao_sem_receita");
  });

  it("cenário sem financiamento não gera o alerta de amortização", () => {
    expect(calcularAlertas(entradaVazia()).map((a) => a.tipo)).not.toContain("financiamento_amortizacao_sem_receita");
  });
});
