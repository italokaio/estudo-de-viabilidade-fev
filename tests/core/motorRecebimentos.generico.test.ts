/**
 * TESTE OBRIGATORIO DE GENERICIDADE (item 5 da aprovacao da Fase 0).
 *
 * Nenhum numero neste arquivo vem da planilha VIABILIDADE.xlsx nem do
 * empreendimento Splendido. O empreendimento fictício abaixo — "Vila
 * Jacaranda", uma tipologia "Cobertura Duplex" que nunca existiu — usa
 * horizonte, periodicidade, percentuais e prazos deliberadamente diferentes
 * dos do Splendido, para provar que o motor nao tem nenhuma dependencia
 * oculta do caso de teste original.
 *
 * Se este arquivo for apagado e o motor ainda "funcionar" apenas com os
 * testes do Splendido, isso NAO prova genericidade — e por isso ele existe
 * como arquivo separado e obrigatorio.
 */
import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { gerarRecebimentos } from "../../src/core/motorRecebimentos.js";
import type { CondicaoPagamento, VendaInput } from "../../src/core/types.js";
import { validarCondicaoPagamento } from "../../src/core/validadorCondicaoPagamento.js";

function condicaoViaJacaranda(): CondicaoPagamento {
  return {
    id: "cond-vila-jacaranda",
    nome: "Cobertura Duplex — condicao padrao",
    modalidades: [
      {
        id: "mod-entrada",
        nome: "Entrada",
        percentual: new Decimal("0.20"),
        tipoDistribuicao: "unica_na_venda",
        repeticoesSobreTotal: 1,
        geraEventoParcial: false,
        ordem: 1,
      },
      {
        id: "mod-parcelas",
        nome: "Parcelas mensais",
        percentual: new Decimal("0.60"),
        tipoDistribuicao: "nivelada",
        repeticoesSobreTotal: 1,
        geraEventoParcial: false,
        ordem: 2,
      },
      {
        id: "mod-reforco",
        nome: "Reforco quadrimestral",
        percentual: new Decimal("0.20"),
        tipoDistribuicao: "periodica",
        periodicidadeMeses: 4,
        repeticoesSobreTotal: 1,
        geraEventoParcial: false,
        ordem: 3,
      },
    ],
  };
}

describe("motor de recebimentos — genericidade (Vila Jacaranda, nao-Splendido)", () => {
  const HORIZONTE = 12; // deliberadamente diferente dos 36/40 meses do Splendido
  const condicao = condicaoViaJacaranda();

  it("condicao fictícia passa na validacao de soma = 100%", () => {
    const resultado = validarCondicaoPagamento(condicao);
    expect(resultado.valida).toBe(true);
    expect(resultado.somaPercentuais.toString()).toBe("1");
  });

  it("distribui entrada + parcela nivelada + reforco periodico corretamente", () => {
    const venda: VendaInput = {
      id: "venda-jacaranda-1",
      unidadeId: "unidade-jacaranda-101",
      tipologiaId: "t1",
      mesOrigem: 2,
      valorVenda: new Decimal("500000"),
      condicaoPagamento: condicao,
    };

    const recebimentos = gerarRecebimentos(venda, HORIZONTE);

    // conservacao de valor: a soma de tudo que foi gerado tem que ser
    // exatamente o valor da venda, nao mais, nao menos.
    const somaTotal = recebimentos.reduce((acc, r) => acc.plus(r.valorPrevisto), new Decimal(0));
    expect(somaTotal.toString()).toBe("500000");

    const entrada = recebimentos.filter((r) => r.modalidadeId === "mod-entrada");
    expect(entrada).toHaveLength(1);
    expect(entrada[0]!.mesCompetencia).toBe(2);
    expect(entrada[0]!.valorPrevisto.toString()).toBe("100000");

    const parcelas = recebimentos.filter((r) => r.modalidadeId === "mod-parcelas");
    // mesesRestantes = 12 - 2 = 10 -> 10 parcelas, do mes 3 ao mes 12
    expect(parcelas).toHaveLength(10);
    expect(parcelas.map((p) => p.mesCompetencia)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parcelas[0]!.valorPrevisto.toString()).toBe("30000");

    const reforco = recebimentos.filter((r) => r.modalidadeId === "mod-reforco");
    // mesesRestantes=10, periodicidade=4 -> floor(10/4)=2 ciclos -> meses 6 e 10
    expect(reforco).toHaveLength(2);
    expect(reforco.map((r) => r.mesCompetencia)).toEqual([6, 10]);
    expect(reforco[0]!.valorPrevisto.toString()).toBe("50000");
  });

  it("modalidade periodica nao gera evento sem ciclo completo restante (regra R4)", () => {
    const vendaTardia: VendaInput = {
      id: "venda-jacaranda-2",
      unidadeId: "unidade-jacaranda-202",
      tipologiaId: "t1",
      mesOrigem: 11, // so resta 1 mes ate o horizonte de 12; periodicidade=4 nao cabe
      valorVenda: new Decimal("300000"),
      condicaoPagamento: condicao,
    };

    const recebimentos = gerarRecebimentos(vendaTardia, HORIZONTE);
    const reforco = recebimentos.filter((r) => r.modalidadeId === "mod-reforco");
    expect(reforco).toHaveLength(0);

    // mas entrada e parcela nivelada continuam gerando normalmente
    const entrada = recebimentos.filter((r) => r.modalidadeId === "mod-entrada");
    expect(entrada).toHaveLength(1);
    const parcelas = recebimentos.filter((r) => r.modalidadeId === "mod-parcelas");
    expect(parcelas).toHaveLength(1); // so o mes 12 resta
    expect(parcelas[0]!.mesCompetencia).toBe(12);
  });

  it("modalidade mes_fixo com repeticoes distribui em N meses consecutivos, independente do mes de origem", () => {
    const condicaoComTaxaClube: CondicaoPagamento = {
      id: "cond-com-taxa",
      nome: "Cobertura Duplex — com taxa de clube",
      modalidades: [
        {
          id: "mod-taxa-clube",
          nome: "Taxa de clube (paga na entrega, em 3x)",
          percentual: new Decimal("0.10"),
          tipoDistribuicao: "mes_fixo",
          mesFixo: 12,
          repeticoesSobreTotal: 3,
          geraEventoParcial: false,
          ordem: 1,
        },
        {
          id: "mod-resto",
          nome: "Resto a vista",
          percentual: new Decimal("0.90"),
          tipoDistribuicao: "unica_na_venda",
          repeticoesSobreTotal: 1,
          geraEventoParcial: false,
          ordem: 2,
        },
      ],
    };

    const venda: VendaInput = {
      id: "venda-jacaranda-3",
      unidadeId: "unidade-jacaranda-303",
      tipologiaId: "t1",
      mesOrigem: 1,
      valorVenda: new Decimal("300000"),
      condicaoPagamento: condicaoComTaxaClube,
    };

    const recebimentos = gerarRecebimentos(venda, HORIZONTE);
    const taxaClube = recebimentos.filter((r) => r.modalidadeId === "mod-taxa-clube");
    expect(taxaClube).toHaveLength(3);
    expect(taxaClube.map((r) => r.mesCompetencia)).toEqual([12, 13, 14]);
    expect(taxaClube[0]!.valorPrevisto.toString()).toBe("10000"); // 30000 / 3
  });
});
