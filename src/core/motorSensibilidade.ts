import { Decimal } from "decimal.js";
import { executarMotorFinanceiro, type EntradaMotorFinanceiro } from "./motorFinanceiro.js";

/**
 * Simulacao de sensibilidade: reexecuta o motor financeiro (ja existente,
 * sem nenhuma mudanca nele) com uma premissa perturbada, para cada
 * variacao pedida, e devolve como os indicadores respondem. Nunca
 * persiste nada -- e uma camada de leitura por cima do motor, no mesmo
 * espirito do achado F1 (fluxo de caixa nunca e uma tabela): aqui nem o
 * fluxo perturbado sobrevive, so os indicadores resultantes de cada
 * rodada.
 *
 * Tres eixos, cada um perturbando uma parte diferente da entrada do
 * motor -- nenhum deles precisa de mudanca em motorRecebimentos.ts,
 * motorCustos.ts ou motorFluxoCaixa.ts, so em como a ENTRADA e montada:
 *   "custo"            -- escala valorPrevisto/percentual de todo Custo
 *                          pelo fator (1+variacao). variacao e uma
 *                          fracao (-0.2 = 20% mais barato).
 *   "vgv"               -- escala valorVenda de toda Venda pelo fator
 *                          (1+variacao). Como motorCustos le
 *                          venda.valorVenda para custos
 *                          pct_vgv_vendido_no_mes, a comissao tambem
 *                          escala junto -- efeito colateral correto,
 *                          nao um bug.
 *   "velocidadeVendas"  -- desloca mesOrigem de toda Venda pela
 *                          variacao (em meses inteiros de atraso),
 *                          nunca alem do horizonte -- uma venda que sai
 *                          do horizonte simplesmente some da projecao,
 *                          igual a qualquer venda tardia real.
 */
export type EixoSensibilidade = "custo" | "vgv" | "velocidadeVendas";

export interface PontoSensibilidade {
  variacao: Decimal;
  vpl: Decimal;
  necessidadeMaximaCapital: Decimal;
  mesPico: number | null;
}

export function calcularSensibilidade(
  entradaBase: EntradaMotorFinanceiro,
  eixo: EixoSensibilidade,
  variacoes: Decimal[],
): PontoSensibilidade[] {
  return variacoes.map((variacao) => {
    const entrada = perturbarEntrada(entradaBase, eixo, variacao);
    const resultado = executarMotorFinanceiro(entrada);
    return {
      variacao,
      vpl: resultado.indicadores.vpl,
      necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital,
      mesPico: resultado.indicadores.mesPico,
    };
  });
}

function perturbarEntrada(entrada: EntradaMotorFinanceiro, eixo: EixoSensibilidade, variacao: Decimal): EntradaMotorFinanceiro {
  switch (eixo) {
    case "custo": {
      const fator = variacao.plus(1);
      return {
        ...entrada,
        custos: entrada.custos.map((c) => ({
          ...c,
          valorPrevisto: c.valorPrevisto?.times(fator),
          percentual: c.percentual?.times(fator),
        })),
      };
    }
    case "vgv": {
      const fator = variacao.plus(1);
      return {
        ...entrada,
        vendas: entrada.vendas.map((v) => ({ ...v, valorVenda: v.valorVenda.times(fator) })),
      };
    }
    case "velocidadeVendas": {
      const deslocamentoMeses = variacao.toNumber();
      return {
        ...entrada,
        vendas: entrada.vendas.map((v) => ({ ...v, mesOrigem: Math.min(entrada.horizonteMeses, v.mesOrigem + deslocamentoMeses) })),
      };
    }
  }
}
