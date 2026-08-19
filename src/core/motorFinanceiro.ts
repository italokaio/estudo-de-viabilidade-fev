import { Decimal } from "decimal.js";
import { gerarDesembolsosMensais, type ContextoCustos } from "./motorCustos.js";
import { calcularIndicadores, consolidarFluxoCaixa } from "./motorFluxoCaixa.js";
import { gerarRecebimentos } from "./motorRecebimentos.js";
import type { CustoInput, FluxoMensal, IndicadoresFluxo, PontoCronograma, RecebimentoGerado, VendaInput } from "./types.js";

export interface EntradaMotorFinanceiro {
  vendas: VendaInput[];
  custos: CustoInput[];
  cronograma: PontoCronograma[];
  horizonteMeses: number;
  taxaDescontoMensal: Decimal;
}

export interface SaidaMotorFinanceiro {
  recebimentos: RecebimentoGerado[];
  fluxo: FluxoMensal[];
  indicadores: IndicadoresFluxo;
}

/**
 * Pipeline completo: dados + premissas + regras -> motor -> projecoes ->
 * fluxo de caixa -> indicadores (principio A da fundacao arquitetural).
 *
 * Determinístico (principio B): mesma entrada sempre produz a mesma saida.
 * Nao le relogio, nao usa numero aleatorio, usa Decimal.js para toda
 * aritmetica monetaria. Nao contem nenhuma referencia a nome ou id de
 * empreendimento — tudo que varia de um empreendimento para outro
 * entra por `EntradaMotorFinanceiro`.
 */
export function executarMotorFinanceiro(entrada: EntradaMotorFinanceiro): SaidaMotorFinanceiro {
  const recebimentos = entrada.vendas.flatMap((venda) => gerarRecebimentos(venda, entrada.horizonteMeses));

  const recebidoPorMes = new Map<number, Decimal>();
  for (const r of recebimentos) {
    const atual = recebidoPorMes.get(r.mesCompetencia) ?? new Decimal(0);
    recebidoPorMes.set(r.mesCompetencia, atual.plus(r.valorPrevisto));
  }

  const ctx: ContextoCustos = {
    vendas: entrada.vendas,
    recebidoPorMes,
    cronograma: entrada.cronograma,
    horizonteMeses: entrada.horizonteMeses,
  };

  const desembolsos = entrada.custos
    .filter((c) => c.participaFluxoCaixa)
    .flatMap((custo) => gerarDesembolsosMensais(custo, ctx));

  const fluxo = consolidarFluxoCaixa(recebimentos, desembolsos, entrada.horizonteMeses);
  const indicadores = calcularIndicadores(fluxo, entrada.taxaDescontoMensal);

  return { recebimentos, fluxo, indicadores };
}
