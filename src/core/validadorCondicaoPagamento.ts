import { Decimal } from "decimal.js";
import type { CondicaoPagamento } from "./types.js";

export interface ResultadoValidacao {
  valida: boolean;
  somaPercentuais: Decimal;
  erros: string[];
}

const TOLERANCIA = new Decimal("0.0001");

/**
 * Regra de negocio universal R2 (ver docs/REGRAS_DE_NEGOCIO.md):
 * a soma dos percentuais das modalidades de uma condicao de pagamento
 * deve ser 100%. Nao valida quantidade de modalidades nem valores
 * individuais — uma condicao pode ter 2 modalidades ou 8.
 */
export function validarCondicaoPagamento(condicao: CondicaoPagamento): ResultadoValidacao {
  const erros: string[] = [];

  if (condicao.modalidades.length === 0) {
    erros.push("condicao de pagamento sem nenhuma modalidade");
  }

  const soma = condicao.modalidades.reduce((acc, m) => acc.plus(m.percentual), new Decimal(0));
  const diferenca = soma.minus(1).abs();
  if (diferenca.greaterThan(TOLERANCIA)) {
    erros.push(`soma dos percentuais e ${soma.toString()}, esperado 1 (100%)`);
  }

  for (const m of condicao.modalidades) {
    if (m.tipoDistribuicao === "periodica" && !m.periodicidadeMeses) {
      erros.push(`modalidade "${m.nome}" e periodica mas nao tem periodicidadeMeses`);
    }
    if (m.tipoDistribuicao === "mes_fixo" && m.mesFixo === undefined) {
      erros.push(`modalidade "${m.nome}" e mes_fixo mas nao tem mesFixo`);
    }
    if (m.percentual.lessThan(0) || m.percentual.greaterThan(1)) {
      erros.push(`modalidade "${m.nome}" tem percentual fora do intervalo 0..1: ${m.percentual.toString()}`);
    }
  }

  return { valida: erros.length === 0, somaPercentuais: soma, erros };
}
