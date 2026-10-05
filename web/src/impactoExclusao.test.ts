import { describe, expect, it } from "vitest";
import { textoImpactoExclusao } from "./impactoExclusao";

describe("textoImpactoExclusao", () => {
  it("sem nada realizado nem vendas, diz que nada será perdido", () => {
    expect(textoImpactoExclusao({ vendas: 0, recebimentosRecebidos: 0, parcelasCustoPagas: 0, custosFixosRealizados: 0 })).toBe(
      "Nenhuma venda nem pagamento registrado será perdido.",
    );
  });

  it("lista o que será perdido no singular e no plural", () => {
    expect(textoImpactoExclusao({ vendas: 2, recebimentosRecebidos: 1, parcelasCustoPagas: 3, custosFixosRealizados: 0 })).toBe(
      "Serão perdidos: 2 vendas, 1 recebimento marcado como recebido, 3 parcelas de custo pagas.",
    );
    expect(textoImpactoExclusao({ vendas: 1, recebimentosRecebidos: 0, parcelasCustoPagas: 1, custosFixosRealizados: 1 })).toBe(
      "Serão perdidos: 1 venda, 1 parcela de custo paga, 1 custo fixo com valor realizado.",
    );
  });

  it("no empreendimento, inclui o número de cenários", () => {
    expect(textoImpactoExclusao({ cenarios: 2, vendas: 0, recebimentosRecebidos: 0, parcelasCustoPagas: 0, custosFixosRealizados: 0 })).toBe(
      "Nenhuma venda nem pagamento registrado será perdido.",
    );
    expect(textoImpactoExclusao({ cenarios: 2, vendas: 4, recebimentosRecebidos: 0, parcelasCustoPagas: 0, custosFixosRealizados: 0 })).toBe(
      "Serão perdidos: 2 cenários, 4 vendas.",
    );
  });
});
