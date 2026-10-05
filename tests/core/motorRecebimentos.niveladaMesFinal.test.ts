import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { gerarRecebimentos } from "../../src/core/motorRecebimentos.js";
import type { CondicaoPagamento, ModalidadePagamento, VendaInput } from "../../src/core/types.js";
import { validarCondicaoPagamento } from "../../src/core/validadorCondicaoPagamento.js";

const HORIZONTE = 12;

function modalidadeNivelada(mesFinal?: number): ModalidadePagamento {
  return {
    id: "mod-parcelas",
    nome: "Parcelas mensais",
    percentual: new Decimal("0.8"),
    tipoDistribuicao: "nivelada",
    repeticoesSobreTotal: 1,
    geraEventoParcial: false,
    ordem: 2,
    mesFinal,
  };
}

function venda(mesOrigem: number, mesFinal?: number): VendaInput {
  const condicao: CondicaoPagamento = {
    id: "cond-teste",
    nome: "Condição de teste",
    modalidades: [
      { id: "mod-entrada", nome: "Entrada", percentual: new Decimal("0.2"), tipoDistribuicao: "unica_na_venda", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 1 },
      modalidadeNivelada(mesFinal),
    ],
  };
  return { id: "venda-teste", unidadeId: "u1", tipologiaId: "t1", mesOrigem, valorVenda: new Decimal("1000"), condicaoPagamento: condicao };
}

function parcelasNiveladas(v: VendaInput) {
  return gerarRecebimentos(v, HORIZONTE)
    .filter((r) => r.modalidadeId === "mod-parcelas")
    .sort((a, b) => a.mesCompetencia - b.mesCompetencia);
}

describe("modalidade nivelada com mês final", () => {
  it("sem mês final, distribui até o horizonte (comportamento anterior preservado)", () => {
    const parcelas = parcelasNiveladas(venda(2));
    expect(parcelas.map((p) => p.mesCompetencia)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const p of parcelas) expect(p.valorPrevisto.toFixed(2)).toBe("80.00");
  });

  it("com mês final dentro do horizonte, para no mês informado e divide o total até lá", () => {
    const parcelas = parcelasNiveladas(venda(2, 6));
    expect(parcelas.map((p) => p.mesCompetencia)).toEqual([3, 4, 5, 6]);
    for (const p of parcelas) expect(p.valorPrevisto.toFixed(2)).toBe("200.00");
    const total = parcelas.reduce((acc, p) => acc.plus(p.valorPrevisto), new Decimal(0));
    expect(total.toFixed(2)).toBe("800.00");
  });

  it("mês final depois do horizonte equivale a não informar", () => {
    expect(parcelasNiveladas(venda(2, 30))).toEqual(parcelasNiveladas(venda(2)));
  });

  it("venda no próprio mês final cai inteira nesse mês, como a venda no fim do horizonte", () => {
    const parcelas = parcelasNiveladas(venda(6, 6));
    expect(parcelas.map((p) => p.mesCompetencia)).toEqual([6]);
    expect(parcelas[0]!.valorPrevisto.toFixed(2)).toBe("800.00");
  });
});

describe("validação do mês final", () => {
  function condicaoCom(m: Partial<ModalidadePagamento>): CondicaoPagamento {
    return {
      id: "c",
      nome: "c",
      modalidades: [
        { id: "a", nome: "Entrada", percentual: new Decimal("0.2"), tipoDistribuicao: "unica_na_venda", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 1 },
        { id: "b", nome: "Outra", percentual: new Decimal("0.8"), tipoDistribuicao: "nivelada", repeticoesSobreTotal: 1, geraEventoParcial: false, ordem: 2, ...m },
      ],
    };
  }

  it("aceita mês final inteiro em modalidade nivelada", () => {
    expect(validarCondicaoPagamento(condicaoCom({ mesFinal: 32 })).valida).toBe(true);
  });

  it("recusa mês final em modalidade que não é nivelada", () => {
    const r = validarCondicaoPagamento(condicaoCom({ tipoDistribuicao: "periodica", periodicidadeMeses: 6, mesFinal: 32 }));
    expect(r.valida).toBe(false);
    expect(r.erros.join(" ")).toMatch(/mesFinal invalido/);
  });

  it("recusa mês final zero ou fracionário", () => {
    expect(validarCondicaoPagamento(condicaoCom({ mesFinal: 0 })).valida).toBe(false);
    expect(validarCondicaoPagamento(condicaoCom({ mesFinal: 1.5 })).valida).toBe(false);
  });
});
