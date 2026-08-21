import { Decimal } from "decimal.js";
import type { DesembolsoMensal, PontoIndiceCorrecao, RecebimentoGerado } from "./types.js";

/**
 * Correcao monetaria (achado F6, docs/DECISOES.md): uma segunda camada por
 * cima do motor de recebimentos, que continua sem saber nada sobre indice.
 * O valor nominal de cada parcela (calculado por
 * src/core/motorRecebimentos.ts a partir da condicao de pagamento) e
 * corrigido pelo fator acumulado entre o mes da venda e o mes de
 * competencia da parcela -- mesmo padrao do motor de custos, que tambem
 * nao sabe o nome "comissao" ou "RET".
 *
 * Estendido (achado F12) para tambem corrigir desembolsos de custo, com um
 * mes-base fixo por cenario em vez de um mes-base por linha -- ver
 * corrigirDesembolsos abaixo.
 */

/**
 * Fator de correcao acumulado entre dois meses: produto de
 * (1 + percentual) de cada mes-indice no intervalo (mesInicio, mesFim].
 * mesInicio nunca e corrigido por si mesmo -- e o mes-base (normalmente o
 * mes da venda: o valor da parcela ja esta "no valor" daquele mes). Um mes
 * sem indice cadastrado entra com variacao zero -- regra explicita, nao
 * omissao silenciosa: sem NENHUM indice cadastrado no cenario, o fator e
 * sempre 1 e o comportamento e identico ao motor antes desta fatia.
 */
export function calcularFatorCorrecao(mesInicio: number, mesFim: number, indices: PontoIndiceCorrecao[]): Decimal {
  if (mesFim <= mesInicio) return new Decimal(1);
  const percentualPorMes = new Map(indices.map((i) => [i.mes, i.percentual]));
  let fator = new Decimal(1);
  for (let mes = mesInicio + 1; mes <= mesFim; mes++) {
    const percentual = percentualPorMes.get(mes) ?? new Decimal(0);
    fator = fator.times(percentual.plus(1));
  }
  return fator;
}

/** Corrige cada recebimento pelo fator acumulado entre o mes da venda que o originou e o mes de competencia da parcela. */
export function corrigirRecebimentos(
  recebimentos: RecebimentoGerado[],
  mesOrigemPorVenda: Map<string, number>,
  indices: PontoIndiceCorrecao[],
): { mesCompetencia: number; valorCorrigido: Decimal }[] {
  return recebimentos.map((r) => {
    const mesOrigem = mesOrigemPorVenda.get(r.vendaId) ?? r.mesCompetencia;
    const fator = calcularFatorCorrecao(mesOrigem, r.mesCompetencia, indices);
    return { mesCompetencia: r.mesCompetencia, valorCorrigido: r.valorPrevisto.times(fator) };
  });
}

/**
 * Corrige cada desembolso de custo pelo fator acumulado entre um mes-base
 * unico (achado F12, docs/DECISOES.md) e o mes em que o desembolso ocorre.
 * Diferente de corrigirRecebimentos -- que usa o mes da VENDA que originou
 * cada parcela, um por venda --, aqui o mes-base e sempre o mesmo para
 * todo custo do cenario: o orcamento de obra e fixado uma unica vez, no
 * inicio do cronograma (mes 1), nao a cada linha de custo.
 */
export function corrigirDesembolsos(desembolsos: DesembolsoMensal[], mesBase: number, indices: PontoIndiceCorrecao[]): { mes: number; valorCorrigido: Decimal }[] {
  return desembolsos.map((d) => {
    const fator = calcularFatorCorrecao(mesBase, d.mes, indices);
    return { mes: d.mes, valorCorrigido: d.valor.times(fator) };
  });
}
