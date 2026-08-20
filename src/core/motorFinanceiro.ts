import { Decimal } from "decimal.js";
import { corrigirRecebimentos } from "./motorCorrecao.js";
import { gerarDesembolsosMensais, type ContextoCustos } from "./motorCustos.js";
import { calcularIndicadores, consolidarFluxoCaixa } from "./motorFluxoCaixa.js";
import { gerarRecebimentos } from "./motorRecebimentos.js";
import type { CustoInput, FluxoMensal, IndicadoresFluxo, PontoCronograma, PontoIndiceCorrecao, RecebimentoGerado, VendaInput } from "./types.js";

export interface EntradaMotorFinanceiro {
  vendas: VendaInput[];
  custos: CustoInput[];
  cronograma: PontoCronograma[];
  horizonteMeses: number;
  taxaDescontoMensal: Decimal;
  /** serie de indice de correcao monetaria do cenario (achado F6) -- vazio/omitido = sem correcao, comportamento identico ao motor antes desta fatia */
  indiceCorrecao?: PontoIndiceCorrecao[];
}

export interface SaidaMotorFinanceiro {
  recebimentos: RecebimentoGerado[];
  fluxo: FluxoMensal[];
  indicadores: IndicadoresFluxo;
  /** entradas de cada mes corrigidas pelo indice de correcao (identicas a fluxo[].entradas quando nenhum indice foi cadastrado) */
  entradasCorrigidas: { mes: number; valor: Decimal }[];
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

  const mesOrigemPorVenda = new Map(entrada.vendas.map((v) => [v.id, v.mesOrigem]));
  const corrigidos = corrigirRecebimentos(recebimentos, mesOrigemPorVenda, entrada.indiceCorrecao ?? []);
  const entradasCorrigidasPorMes = new Map<number, Decimal>();
  for (const c of corrigidos) {
    const atual = entradasCorrigidasPorMes.get(c.mesCompetencia) ?? new Decimal(0);
    entradasCorrigidasPorMes.set(c.mesCompetencia, atual.plus(c.valorCorrigido));
  }
  const entradasCorrigidas = Array.from({ length: entrada.horizonteMeses }, (_, i) => {
    const mes = i + 1;
    return { mes, valor: entradasCorrigidasPorMes.get(mes) ?? new Decimal(0) };
  });

  return { recebimentos, fluxo, indicadores, entradasCorrigidas };
}
