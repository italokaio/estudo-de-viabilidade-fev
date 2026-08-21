import { Decimal } from "decimal.js";
import { calcularAlertas, type Alerta } from "./motorAlertas.js";
import { corrigirDesembolsos, corrigirRecebimentos } from "./motorCorrecao.js";
import { gerarDesembolsosMensais, type ContextoCustos } from "./motorCustos.js";
import { calcularFinanciamento, type FinanciamentoInput, type PontoFinanciamento } from "./motorFinanciamento.js";
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
  /** financiamento bancario de producao do cenario (achado F8) -- omitido = sem financiamento, comportamento identico ao motor antes desta fatia */
  financiamento?: FinanciamentoInput;
  /** limite de necessidade maxima de capital sobre o VGV, para o alerta "necessidade_maxima_alta" (achado F15) -- omitido = usa o padrao de 30% do motorAlertas */
  limiteNecessidadeMaximaCapital?: Decimal;
}

export interface SaidaMotorFinanceiro {
  recebimentos: RecebimentoGerado[];
  fluxo: FluxoMensal[];
  indicadores: IndicadoresFluxo;
  /** entradas de cada mes corrigidas pelo indice de correcao, incluindo liberacoes de financiamento (sem correcao aplicada a elas -- nao sao saldo de venda) */
  entradasCorrigidas: { mes: number; valor: Decimal }[];
  /** saidas de cada mes corrigidas pelo indice de correcao (achado F12), a partir de um mes-base fixo (1); inclui amortizacao de financiamento verbatim, sem correcao (mesmo tratamento das liberacoes em entradasCorrigidas) */
  saidasCorrigidas: { mes: number; valor: Decimal }[];
  /** liberacao/amortizacao/saldo devedor do financiamento por mes -- vazio quando o cenario nao tem financiamento */
  financiamento: PontoFinanciamento[];
  /** alertas de risco computados a partir do resultado acima -- nunca muda fluxo/indicadores, so os interpreta */
  alertas: Alerta[];
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

  // Financiamento (achado F8) muda o fluxo de caixa de verdade -- liberacao
  // e amortizacao entram na mesma consolidacao usada para indicadores, ao
  // contrario de correcao monetaria/sensibilidade (camadas de leitura por
  // cima, nunca somadas ao fluxo real). vendaId/custoId "financiamento" sao
  // placeholders nunca lidos por consolidarFluxoCaixa (so mes/valor
  // importam) e nunca voltam no `recebimentos` retornado -- persistirRecebimentos
  // (src/db/servicoMotor.ts) so grava recebimentos de Venda real.
  const financiamento = entrada.financiamento ? calcularFinanciamento(entrada.financiamento, entrada.cronograma, entrada.horizonteMeses) : [];
  const liberacoesComoRecebimentos: RecebimentoGerado[] = financiamento
    .filter((f) => !f.liberacao.isZero())
    .map((f) => ({ vendaId: "financiamento", modalidadeId: "financiamento", mesCompetencia: f.mes, valorPrevisto: f.liberacao }));
  const amortizacoesComoDesembolsos = financiamento
    .filter((f) => !f.amortizacao.isZero())
    .map((f) => ({ custoId: "financiamento", mes: f.mes, valor: f.amortizacao }));

  const fluxo = consolidarFluxoCaixa([...recebimentos, ...liberacoesComoRecebimentos], [...desembolsos, ...amortizacoesComoDesembolsos], entrada.horizonteMeses);
  const indicadores = calcularIndicadores(fluxo, entrada.taxaDescontoMensal);

  const mesOrigemPorVenda = new Map(entrada.vendas.map((v) => [v.id, v.mesOrigem]));
  const corrigidos = corrigirRecebimentos(recebimentos, mesOrigemPorVenda, entrada.indiceCorrecao ?? []);
  const entradasCorrigidasPorMes = new Map<number, Decimal>();
  for (const c of corrigidos) {
    const atual = entradasCorrigidasPorMes.get(c.mesCompetencia) ?? new Decimal(0);
    entradasCorrigidasPorMes.set(c.mesCompetencia, atual.plus(c.valorCorrigido));
  }
  // liberacoes de financiamento nao passam por correcao monetaria (nao sao
  // saldo devedor de venda) -- somadas verbatim, para que "Corrigido" ==
  // "Entradas" quando nenhum indice foi cadastrado, com ou sem financiamento.
  for (const f of financiamento) {
    if (f.liberacao.isZero()) continue;
    const atual = entradasCorrigidasPorMes.get(f.mes) ?? new Decimal(0);
    entradasCorrigidasPorMes.set(f.mes, atual.plus(f.liberacao));
  }
  const entradasCorrigidas = Array.from({ length: entrada.horizonteMeses }, (_, i) => {
    const mes = i + 1;
    return { mes, valor: entradasCorrigidasPorMes.get(mes) ?? new Decimal(0) };
  });

  // Correcao monetaria de custos (achado F12): mes-base fixo em 1 -- o
  // orcamento de obra e fixado uma unica vez, no inicio do cronograma, ao
  // contrario de recebimentos (um mes-base por venda). Sem indice
  // cadastrado, fator=1 e "saidasCorrigidas" == "saidas" (comportamento
  // identico ao motor antes desta fatia, mesmo padrao do achado F6).
  const desembolsosCorrigidos = corrigirDesembolsos(desembolsos, 1, entrada.indiceCorrecao ?? []);
  const saidasCorrigidasPorMes = new Map<number, Decimal>();
  for (const d of desembolsosCorrigidos) {
    const atual = saidasCorrigidasPorMes.get(d.mes) ?? new Decimal(0);
    saidasCorrigidasPorMes.set(d.mes, atual.plus(d.valorCorrigido));
  }
  // amortizacao de financiamento nao passa por correcao monetaria (nao e
  // custo orcado) -- somada verbatim, mesmo tratamento das liberacoes acima.
  for (const f of financiamento) {
    if (f.amortizacao.isZero()) continue;
    const atual = saidasCorrigidasPorMes.get(f.mes) ?? new Decimal(0);
    saidasCorrigidasPorMes.set(f.mes, atual.plus(f.amortizacao));
  }
  const saidasCorrigidas = Array.from({ length: entrada.horizonteMeses }, (_, i) => {
    const mes = i + 1;
    return { mes, valor: saidasCorrigidasPorMes.get(mes) ?? new Decimal(0) };
  });

  const alertas = calcularAlertas(
    {
      vendas: entrada.vendas,
      custos: entrada.custos,
      cronograma: entrada.cronograma,
      recebimentos,
      indicadores,
      financiamento,
    },
    entrada.limiteNecessidadeMaximaCapital,
  );

  return { recebimentos, fluxo, indicadores, entradasCorrigidas, saidasCorrigidas, financiamento, alertas };
}
