import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro } from "../../src/core/motorFinanceiro.js";
import type { CondicaoPagamento, CustoInput, VendaInput } from "../../src/core/types.js";

/**
 * Principio B da fundacao arquitetural: mesma entrada, mesma saida —
 * sempre. Roda o pipeline completo duas vezes sobre o mesmo cenario
 * sintetico e exige saida byte-identica (via serializacao determinística).
 */
function serializar(saida: unknown): string {
  return JSON.stringify(saida, (_key, value) => {
    if (value instanceof Decimal) return value.toString();
    return value;
  });
}

function montarCenario(): EntradaMotorFinanceiro {
  const condicao: CondicaoPagamento = {
    id: "cond-1",
    nome: "Padrao",
    modalidades: [
      { id: "m-entrada", nome: "Entrada", percentual: new Decimal("0.1"), tipoDistribuicao: "unica_na_venda", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 1 },
      { id: "m-parcelas", nome: "Parcelas", percentual: new Decimal("0.6"), tipoDistribuicao: "nivelada", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 2 },
      { id: "m-intermediaria", nome: "Intermediaria", percentual: new Decimal("0.1"), tipoDistribuicao: "periodica", periodicidadeMeses: 6, repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 3 },
      { id: "m-financiamento", nome: "Financiamento", percentual: new Decimal("0.2"), tipoDistribuicao: "mes_fixo", mesFixo: 18, repeticoesSobreTotal: 2, geraEventoParcial: false, ordem: 4 },
    ],
  };

  const vendas: VendaInput[] = Array.from({ length: 15 }, (_, i) => ({
    id: `venda-${i + 1}`,
    unidadeId: `unidade-${i + 1}`,
    tipologiaId: "tipologia-1",
    mesOrigem: (i % 8) + 1,
    valorVenda: new Decimal(300000 + i * 12345),
    condicaoPagamento: condicao,
  }));

  const custos: CustoInput[] = [
    { id: "custo-obra", categoriaNome: "Obra", tipoIncidencia: "pct_execucao", valorPrevisto: new Decimal("2000000"), recorrencia: "mensal", participaFluxoCaixa: true },
    { id: "custo-comissao", categoriaNome: "Comissao", tipoIncidencia: "pct_vgv_vendido_no_mes", percentual: new Decimal("0.05"), recorrencia: "mensal", participaFluxoCaixa: true },
    { id: "custo-encargo", categoriaNome: "Encargo", tipoIncidencia: "pct_recebido_mes_anterior", percentual: new Decimal("0.04"), recorrencia: "mensal", participaFluxoCaixa: true },
  ];

  const cronograma = Array.from({ length: 20 }, (_, i) => ({
    mes: i + 1,
    percentualExecucaoMensal: new Decimal(i < 20 ? "0.05" : "0"),
  }));

  return { vendas, custos, cronograma, horizonteMeses: 20, taxaDescontoMensal: new Decimal("0.005") };
}

describe("determinismo do motor financeiro", () => {
  it("produz saida identica em duas execucoes independentes sobre o mesmo cenario", () => {
    const cenario1 = montarCenario();
    const cenario2 = montarCenario(); // instancia separada, mesmos valores

    const resultado1 = executarMotorFinanceiro(cenario1);
    const resultado2 = executarMotorFinanceiro(cenario2);

    expect(serializar(resultado1)).toBe(serializar(resultado2));
  });

  it("produz saida diferente quando uma premissa muda (prova que o motor de fato le a entrada)", () => {
    const cenarioBase = montarCenario();
    const cenarioAlterado = montarCenario();
    cenarioAlterado.custos[0]!.valorPrevisto = new Decimal("2500000"); // custo de obra maior

    const resultadoBase = executarMotorFinanceiro(cenarioBase);
    const resultadoAlterado = executarMotorFinanceiro(cenarioAlterado);

    expect(serializar(resultadoBase)).not.toBe(serializar(resultadoAlterado));
  });
});
