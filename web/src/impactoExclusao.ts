export interface ImpactoExclusao {
  vendas: number;
  recebimentosRecebidos: number;
  parcelasCustoPagas: number;
  custosFixosRealizados: number;
  cenarios?: number;
}

function plural(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function textoImpactoExclusao(impacto: ImpactoExclusao): string {
  const partes: string[] = [];
  if (impacto.cenarios !== undefined) partes.push(plural(impacto.cenarios, "cenário", "cenários"));
  if (impacto.vendas > 0) partes.push(plural(impacto.vendas, "venda", "vendas"));
  if (impacto.recebimentosRecebidos > 0) partes.push(plural(impacto.recebimentosRecebidos, "recebimento marcado como recebido", "recebimentos marcados como recebidos"));
  if (impacto.parcelasCustoPagas > 0) partes.push(plural(impacto.parcelasCustoPagas, "parcela de custo paga", "parcelas de custo pagas"));
  if (impacto.custosFixosRealizados > 0) partes.push(plural(impacto.custosFixosRealizados, "custo fixo com valor realizado", "custos fixos com valor realizado"));
  const perdas = partes.length === 0 || (partes.length === 1 && impacto.cenarios !== undefined)
    ? "Nenhuma venda nem pagamento registrado será perdido."
    : `Serão perdidos: ${partes.join(", ")}.`;
  return perdas;
}
