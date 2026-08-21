import { Decimal } from "decimal.js";
import type { PontoFinanciamento } from "./motorFinanciamento.js";
import type { CustoInput, IndicadoresFluxo, PontoCronograma, RecebimentoGerado, VendaInput } from "./types.js";

/**
 * Alerta de risco: regras que sinalizam problemas a partir do que o motor
 * ja calculou (indicadores, recebimentos, financiamento) e do cadastro
 * (vendas, custos, cronograma) -- nenhuma delas roda o motor de novo nem
 * muda o fluxo de caixa (diferente de financiamento, achado F8). So
 * interpreta o resultado, no mesmo espirito de calcularIndicadores() ler
 * o fluxo ja consolidado.
 *
 * Evita import de motorFinanceiro.ts (que importaria este arquivo de
 * volta) -- recebe as pecas ja computadas em vez de EntradaMotorFinanceiro/
 * SaidaMotorFinanceiro inteiros.
 */
export type SeveridadeAlerta = "aviso" | "critico";

export interface Alerta {
  tipo: string;
  severidade: SeveridadeAlerta;
  mensagem: string;
}

export interface EntradaAlertas {
  vendas: VendaInput[];
  custos: CustoInput[];
  cronograma: PontoCronograma[];
  recebimentos: RecebimentoGerado[];
  indicadores: IndicadoresFluxo;
  financiamento: PontoFinanciamento[];
}

/** Limite padrão: necessidade máxima de capital acima de 30% do VGV total é considerada arriscada. */
const LIMITE_NECESSIDADE_MAXIMA_SOBRE_VGV_PADRAO = new Decimal("0.3");

export function calcularAlertas(entrada: EntradaAlertas, limiteNecessidadeMaximaSobreVgv: Decimal = LIMITE_NECESSIDADE_MAXIMA_SOBRE_VGV_PADRAO): Alerta[] {
  const alertas: Alerta[] = [];

  // 1. Necessidade máxima de capital muito alta em relação ao VGV total.
  const vgvTotal = entrada.vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
  if (vgvTotal.greaterThan(0)) {
    const proporcao = entrada.indicadores.necessidadeMaximaCapital.dividedBy(vgvTotal);
    if (proporcao.greaterThan(limiteNecessidadeMaximaSobreVgv)) {
      alertas.push({
        tipo: "necessidade_maxima_alta",
        severidade: "critico",
        mensagem: `A necessidade máxima de capital (${entrada.indicadores.necessidadeMaximaCapital.toFixed(2)}) equivale a ${proporcao.times(100).toFixed(0)}% do VGV total — acima do limite de ${limiteNecessidadeMaximaSobreVgv.times(100).toFixed(0)}%.`,
      });
    }
  }

  // 2. Fluxo acumulado nunca volta a ficar positivo dentro do horizonte.
  if (entrada.indicadores.mesRecuperacao === null) {
    alertas.push({
      tipo: "sem_recuperacao",
      severidade: "critico",
      mensagem: "O fluxo de caixa acumulado não volta a ficar positivo dentro do horizonte de projeção.",
    });
  }

  // 3. Custo por execução física sem cronograma cadastrado -- gera zero desembolso, silenciosamente.
  const temCustoExecucao = entrada.custos.some((c) => c.tipoIncidencia === "pct_execucao");
  if (temCustoExecucao && entrada.cronograma.length === 0) {
    alertas.push({
      tipo: "custo_execucao_sem_cronograma",
      severidade: "aviso",
      mensagem: "Existe custo com incidência sobre a execução física, mas nenhum cronograma foi cadastrado — esse custo não gera nenhum desembolso.",
    });
  }

  // 4. Amortização do financiamento maior que a receita de vendas acumulada até aquele mês.
  const pontoAmortizacao = entrada.financiamento.find((f) => !f.amortizacao.isZero());
  if (pontoAmortizacao) {
    const receitaAteAmortizacao = entrada.recebimentos
      .filter((r) => r.mesCompetencia <= pontoAmortizacao.mes)
      .reduce((acc, r) => acc.plus(r.valorPrevisto), new Decimal(0));
    if (receitaAteAmortizacao.lessThan(pontoAmortizacao.amortizacao)) {
      alertas.push({
        tipo: "financiamento_amortizacao_sem_receita",
        severidade: "critico",
        mensagem: `A amortização do financiamento no mês ${pontoAmortizacao.mes} (${pontoAmortizacao.amortizacao.toFixed(2)}) é maior que a receita de vendas acumulada até lá (${receitaAteAmortizacao.toFixed(2)}) — o pagamento dependeria de capital próprio.`,
      });
    }
  }

  return alertas;
}
