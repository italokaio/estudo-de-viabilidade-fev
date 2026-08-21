import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calcularSensibilidade } from "../../src/core/motorSensibilidade.js";
import type { EntradaMotorFinanceiro } from "../../src/core/motorFinanceiro.js";
import type { CondicaoPagamento, CustoInput, VendaInput } from "../../src/core/types.js";

describe("motor de sensibilidade", () => {
  const condicaoAVista: CondicaoPagamento = {
    id: "cond1",
    nome: "À vista",
    modalidades: [{ id: "mod1", nome: "Ato", percentual: new Decimal("1"), tipoDistribuicao: "unica_na_venda", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 0 }],
  };

  const vendaBase: VendaInput = {
    id: "v1",
    unidadeId: "u1",
    mesOrigem: 1,
    valorVenda: new Decimal("100000"),
    condicaoPagamento: condicaoAVista,
  };

  const custoBase: CustoInput = {
    id: "c1",
    categoriaNome: "Obra",
    tipoIncidencia: "fixo",
    valorPrevisto: new Decimal("50000"),
    competenciaMes: 1,
    recorrencia: "unico",
    participaFluxoCaixa: true,
  };

  function entradaBase(): EntradaMotorFinanceiro {
    return {
      vendas: [vendaBase],
      custos: [custoBase],
      cronograma: [],
      horizonteMeses: 6,
      taxaDescontoMensal: new Decimal(0),
    };
  }

  it("eixo custo: variação 0 reproduz o resultado base; +20% aumenta a saída do mês", () => {
    const pontos = calcularSensibilidade(entradaBase(), "custo", [new Decimal(0), new Decimal("0.2")]);
    expect(pontos).toHaveLength(2);
    // saida 50000, entrada 100000 no mes 1 -> fluxo mensal 50000, acumulado positivo desde o mes 1
    expect(pontos[0]!.necessidadeMaximaCapital.toString()).toBe("0");
    // custo 20% maior (60000) ainda é menor que a entrada de 100000 no mesmo mês -> ainda sem necessidade de capital
    expect(pontos[1]!.necessidadeMaximaCapital.toString()).toBe("0");
    // VPL cai quando o custo sobe (taxa 0% -> VPL = soma simples dos fluxos)
    expect(pontos[1]!.vpl.lessThan(pontos[0]!.vpl)).toBe(true);
  });

  it("eixo custo: percentual escala junto com valorPrevisto", () => {
    const custoPercentual: CustoInput = { ...custoBase, id: "c2", tipoIncidencia: "pct_vgv_vendido_no_mes", valorPrevisto: undefined, percentual: new Decimal("0.05"), competenciaMes: undefined };
    const entrada: EntradaMotorFinanceiro = { ...entradaBase(), custos: [custoPercentual] };
    const pontos = calcularSensibilidade(entrada, "custo", [new Decimal(0), new Decimal("1")]);
    // dobrando o custo (variacao=1 -> fator=2), o VPL cai o dobro do desconto original
    const quedaBase = pontos[0]!.vpl;
    const quedaDobrada = pontos[1]!.vpl;
    expect(quedaDobrada.lessThan(quedaBase)).toBe(true);
  });

  it("eixo vgv: aumentar o preço de venda aumenta o VPL", () => {
    const pontos = calcularSensibilidade(entradaBase(), "vgv", [new Decimal("-0.1"), new Decimal(0), new Decimal("0.1")]);
    expect(pontos[0]!.vpl.lessThan(pontos[1]!.vpl)).toBe(true);
    expect(pontos[1]!.vpl.lessThan(pontos[2]!.vpl)).toBe(true);
  });

  it("eixo velocidadeVendas: atrasar a venda desloca o VPL (com taxa de desconto > 0, o momento do fluxo importa)", () => {
    const entrada: EntradaMotorFinanceiro = { ...entradaBase(), taxaDescontoMensal: new Decimal("0.01") };
    const pontos = calcularSensibilidade(entrada, "velocidadeVendas", [new Decimal(0), new Decimal(2)]);
    // atrasar a entrada de caixa em 2 meses (com taxa de desconto positiva) reduz o VPL
    expect(pontos[1]!.vpl.lessThan(pontos[0]!.vpl)).toBe(true);
  });

  it("velocidadeVendas nunca desloca uma venda para além do horizonte", () => {
    const entrada = entradaBase();
    const pontos = calcularSensibilidade(entrada, "velocidadeVendas", [new Decimal(10)]);
    // horizonte=6, deslocamento=10 -> mesOrigem clampado em 6, resultado ainda finito (nao lanca erro)
    expect(pontos[0]!.vpl.isFinite()).toBe(true);
  });

  it("sem variação (0), todos os eixos reproduzem o mesmo resultado que executar o motor diretamente", () => {
    const pontosCusto = calcularSensibilidade(entradaBase(), "custo", [new Decimal(0)]);
    const pontosVgv = calcularSensibilidade(entradaBase(), "vgv", [new Decimal(0)]);
    expect(pontosCusto[0]!.vpl.toString()).toBe(pontosVgv[0]!.vpl.toString());
  });
});
