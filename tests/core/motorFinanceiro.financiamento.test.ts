import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro } from "../../src/core/motorFinanceiro.js";
import type { CondicaoPagamento, CustoInput, PontoCronograma, VendaInput } from "../../src/core/types.js";

/**
 * Testa a integracao do financiamento de producao (achado F8) dentro do
 * pipeline completo: diferente de correcao monetaria/sensibilidade,
 * financiamento MUDA fluxo/indicadores de verdade -- e o teste central
 * desta fatia e confirmar que ele reduz a necessidade maxima de capital
 * DURANTE A OBRA, quando o banco banca parte do custo antes da venda gerar
 * receita para pagar o financiamento de volta (repasse bancario).
 */
describe("motor financeiro — financiamento de produção", () => {
  const cronograma: PontoCronograma[] = [
    { mes: 1, percentualExecucaoMensal: new Decimal("0.5") },
    { mes: 2, percentualExecucaoMensal: new Decimal("0.5") },
  ];

  const custoObra: CustoInput = {
    id: "c1",
    categoriaNome: "Obra",
    tipoIncidencia: "fixo",
    valorPrevisto: new Decimal("100000"),
    competenciaMes: 1,
    recorrencia: "unico",
    participaFluxoCaixa: true,
  };

  const condicaoAVista: CondicaoPagamento = {
    id: "cond1",
    nome: "À vista",
    modalidades: [{ id: "mod1", nome: "Ato", percentual: new Decimal("1"), tipoDistribuicao: "unica_na_venda", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 0 }],
  };

  // venda no mes 4 (entrega/repasse), valor suficiente para pagar a
  // amortizacao do financiamento e ainda sobrar -- sem essa receita, o
  // financiamento so adiaria o problema (emprestimo pago com capital
  // proprio nao reduz necessidade maxima, so muda o mes do pico).
  const vendaFinal: VendaInput = { id: "v1", unidadeId: "u1", tipologiaId: "t1", mesOrigem: 4, valorVenda: new Decimal("150000"), condicaoPagamento: condicaoAVista };

  function entradaBase(): EntradaMotorFinanceiro {
    return {
      vendas: [vendaFinal],
      custos: [custoObra],
      cronograma,
      horizonteMeses: 4,
      taxaDescontoMensal: new Decimal(0),
    };
  }

  it("sem financiamento, `financiamento` na saída é um array vazio (comportamento idêntico ao motor antes desta fatia)", () => {
    const resultado = executarMotorFinanceiro(entradaBase());
    expect(resultado.financiamento).toEqual([]);
  });

  it("com financiamento, as liberações reduzem a necessidade máxima de capital", () => {
    const semFinanciamento = executarMotorFinanceiro(entradaBase());

    const comFinanciamento = executarMotorFinanceiro({
      ...entradaBase(),
      financiamento: { valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 4 },
    });

    expect(comFinanciamento.indicadores.necessidadeMaximaCapital.lessThan(semFinanciamento.indicadores.necessidadeMaximaCapital)).toBe(true);
    expect(comFinanciamento.financiamento).toHaveLength(4);
  });

  it("a amortização aparece como saída no mês configurado, refletida no fluxo consolidado", () => {
    const resultado = executarMotorFinanceiro({
      ...entradaBase(),
      financiamento: { valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 3 },
    });
    // mes 3: sem custo/venda propria nesse mes, saida = so a amortizacao (100000, sem juros)
    expect(resultado.fluxo[2]!.saidas.toString()).toBe("100000");
  });

  it("financiamento não aparece em `recebimentos` (só RecebimentoProjetado de Venda real é persistido)", () => {
    const resultado = executarMotorFinanceiro({
      ...entradaBase(),
      financiamento: { valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 4 },
    });
    // so o recebimento da venda real (v1) -- nenhuma linha "financiamento"
    expect(resultado.recebimentos).toHaveLength(1);
    expect(resultado.recebimentos[0]!.vendaId).toBe("v1");
  });

  it("entradasCorrigidas inclui a liberação de financiamento sem aplicar correção (bate com Entradas quando não há índice)", () => {
    const resultado = executarMotorFinanceiro({
      ...entradaBase(),
      financiamento: { valorContratado: new Decimal("100000"), taxaJurosMensal: new Decimal("0"), mesAmortizacao: 4 },
    });
    for (const f of resultado.fluxo) {
      const corrigida = resultado.entradasCorrigidas.find((e) => e.mes === f.mes)!;
      expect(corrigida.valor.toString()).toBe(f.entradas.toString());
    }
  });
});
