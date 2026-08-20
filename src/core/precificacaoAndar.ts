import { Decimal } from "decimal.js";

/**
 * Segunda estrategia de precificacao (achado F2, docs/DECISOES.md): preco de
 * unidade nao precisa ser um valor direto — pode ser derivado de uma cascata
 * por andar, fiel ao padrao comum em incorporacao (andares mais altos custam
 * mais). Pura e deterministica, como o resto do motor: nao sabe nada sobre
 * banco, so recebe uma regra e devolve um preco.
 */
export type TipoIncrementoAndar = "fixo" | "percentual";

export interface RegraPrecificacaoAndar {
  /** preco do andar de referencia (andarBase) */
  precoBase: Decimal;
  /** andar ao qual precoBase se aplica */
  andarBase: number;
  /** valor (R$, se tipo "fixo") ou fracao (0..1, se tipo "percentual") somado/multiplicado por andar de diferenca */
  incremento: Decimal;
  tipoIncremento: TipoIncrementoAndar;
}

/**
 * "fixo": preco cresce linearmente — cada andar acima da base soma `incremento` em R$.
 * "percentual": preco cresce geometricamente — cada andar acima da base multiplica por (1 + incremento).
 * Andares abaixo da base reduzem o preco pela mesma regra (diferenca negativa).
 */
export function calcularPrecoPorAndar(andar: number, regra: RegraPrecificacaoAndar): Decimal {
  const diferenca = andar - regra.andarBase;
  if (regra.tipoIncremento === "fixo") {
    return regra.precoBase.plus(regra.incremento.times(diferenca));
  }
  return regra.precoBase.times(new Decimal(1).plus(regra.incremento).pow(diferenca));
}
