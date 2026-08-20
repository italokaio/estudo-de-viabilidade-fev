import { Decimal } from "decimal.js";
import type { PontoIndiceCorrecao, RecebimentoGerado } from "./types.js";

/**
 * Correcao monetaria (achado F6, docs/DECISOES.md): uma segunda camada por
 * cima do motor de recebimentos, que continua sem saber nada sobre indice.
 * O valor nominal de cada parcela (calculado por
 * src/core/motorRecebimentos.ts a partir da condicao de pagamento) e
 * corrigido pelo fator acumulado entre o mes da venda e o mes de
 * competencia da parcela -- mesmo padrao do motor de custos, que tambem
 * nao sabe o nome "comissao" ou "RET".
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
