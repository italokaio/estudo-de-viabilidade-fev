import { Decimal } from "decimal.js";
import type { PontoCronograma } from "./types.js";

/**
 * Financiamento bancario de producao (achado F8, docs/DECISOES.md).
 * Diferente de correcao monetaria e sensibilidade -- camadas de leitura
 * por cima do motor, nunca persistidas nem somadas ao fluxo real --
 * financiamento MUDA o fluxo de caixa de verdade: liberacoes sao uma
 * entrada real, a amortizacao e uma saida real.
 *
 * Liberacoes seguem a mesma curva do cronograma fisico-financeiro usada
 * por custo tipoIncidencia="pct_execucao" (motorCustos.ts) -- o banco
 * libera capital conforme a obra avanca, nao de uma vez. Juros
 * capitalizam mes a mes sobre o saldo devedor (nunca pagos a parte
 * durante a obra). A amortizacao e um unico pagamento, no mes
 * configurado, do saldo devedor inteiro (principal liberado + juros
 * acumulados) -- o caso mais comum na pratica (repasse bancario quando
 * as unidades sao entregues), sem uma tabela de parcelas.
 */
export interface FinanciamentoInput {
  valorContratado: Decimal;
  /** 0..1, juros capitalizados mes a mes sobre o saldo devedor */
  taxaJurosMensal: Decimal;
  /** mes em que o saldo devedor inteiro e pago de uma vez */
  mesAmortizacao: number;
}

export interface PontoFinanciamento {
  mes: number;
  liberacao: Decimal;
  jurosDoMes: Decimal;
  amortizacao: Decimal;
  /** saldo devedor ao final do mes, apos juros + liberacao - amortizacao */
  saldoDevedor: Decimal;
}

export function calcularFinanciamento(
  financiamento: FinanciamentoInput,
  cronograma: PontoCronograma[],
  horizonteMeses: number,
): PontoFinanciamento[] {
  const percentualPorMes = new Map(cronograma.map((p) => [p.mes, p.percentualExecucaoMensal]));
  const pontos: PontoFinanciamento[] = [];
  let saldo = new Decimal(0);

  for (let mes = 1; mes <= horizonteMeses; mes++) {
    const jurosDoMes = saldo.times(financiamento.taxaJurosMensal);
    saldo = saldo.plus(jurosDoMes);

    const percentual = percentualPorMes.get(mes) ?? new Decimal(0);
    const liberacao = financiamento.valorContratado.times(percentual);
    saldo = saldo.plus(liberacao);

    let amortizacao = new Decimal(0);
    if (mes === financiamento.mesAmortizacao) {
      amortizacao = saldo;
      saldo = new Decimal(0);
    }

    pontos.push({ mes, liberacao, jurosDoMes, amortizacao, saldoDevedor: saldo });
  }

  return pontos;
}
