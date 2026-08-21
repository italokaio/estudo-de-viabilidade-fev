import { Decimal } from "decimal.js";
import type { CustoInput, DesembolsoMensal, PontoCronograma, VendaInput } from "./types.js";

export interface ContextoCustos {
  /** vendas do empreendimento/cenario, para incidencia pct_vgv_vendido_no_mes */
  vendas: VendaInput[];
  /** total recebido por mes (soma de RecebimentoProjetado.valorPrevisto), para pct_recebido_mes_anterior */
  recebidoPorMes: Map<number, Decimal>;
  /** curva de execucao fisica do cenario, para pct_execucao */
  cronograma: PontoCronograma[];
  horizonteMeses: number;
}

/**
 * Resolve um Custo em uma serie de desembolsos mensais, conforme sua
 * tipoIncidencia (regra de negocio universal R7: a base de incidencia de um
 * encargo — sobre valor vendido ou sobre valor recebido — e parametrizavel
 * por rubrica, nunca fixa no motor).
 *
 * Nenhuma das quatro estrategias abaixo sabe o nome da rubrica que a usa —
 * "comissao" e "RET" nao aparecem em lugar nenhum deste arquivo. O que a
 * um empreendimento chama de "comissao" e apenas um Custo com
 * tipoIncidencia="pct_vgv_vendido_no_mes"; um encargo do tipo "RET" e
 * apenas um Custo com tipoIncidencia="pct_recebido_mes_anterior".
 */
export function gerarDesembolsosMensais(custo: CustoInput, ctx: ContextoCustos): DesembolsoMensal[] {
  switch (custo.tipoIncidencia) {
    case "fixo": {
      const valor = custo.valorPrevisto ?? new Decimal(0);
      const mes = custo.competenciaMes ?? 1;
      if (custo.recorrencia === "unico") {
        return [{ custoId: custo.id, mes, valor }];
      }
      // recorrencia mensal com valor fixo: repete do mes de competencia ate o horizonte.
      const desembolsos: DesembolsoMensal[] = [];
      for (let m = mes; m <= ctx.horizonteMeses; m++) {
        desembolsos.push({ custoId: custo.id, mes: m, valor });
      }
      return desembolsos;
    }

    case "pct_vgv_vendido_no_mes": {
      const percentual = custo.percentual ?? new Decimal(0);
      // Escopo opcional por tipologia (achado F11): sem tipologiaId, incide
      // sobre todas as vendas do cenario (comportamento original); com
      // tipologiaId, so sobre as vendas daquela tipologia -- permite
      // percentuais de comissao diferentes por tipologia.
      const vendasBase = custo.tipologiaId ? ctx.vendas.filter((v) => v.tipologiaId === custo.tipologiaId) : ctx.vendas;
      const totalPorMes = new Map<number, Decimal>();
      for (const venda of vendasBase) {
        const atual = totalPorMes.get(venda.mesOrigem) ?? new Decimal(0);
        totalPorMes.set(venda.mesOrigem, atual.plus(venda.valorVenda));
      }
      const desembolsos: DesembolsoMensal[] = [];
      for (const [mes, totalVendido] of totalPorMes) {
        desembolsos.push({ custoId: custo.id, mes, valor: totalVendido.times(percentual) });
      }
      return desembolsos;
    }

    case "pct_recebido_mes_anterior": {
      const percentual = custo.percentual ?? new Decimal(0);
      const desembolsos: DesembolsoMensal[] = [];
      for (let mes = 1; mes <= ctx.horizonteMeses; mes++) {
        const recebidoMesAnterior = ctx.recebidoPorMes.get(mes - 1) ?? new Decimal(0);
        if (recebidoMesAnterior.isZero()) continue;
        desembolsos.push({ custoId: custo.id, mes, valor: recebidoMesAnterior.times(percentual) });
      }
      return desembolsos;
    }

    case "pct_execucao": {
      // custo.valorPrevisto e o custo total do item (ex.: custo total de obra);
      // distribuido conforme a curva fisica do cronograma (regra R6: a soma
      // dos percentuais de periodo fecha em 100%, validado na carga do
      // cronograma, nao aqui).
      const custoTotal = custo.valorPrevisto ?? new Decimal(0);
      const desembolsos: DesembolsoMensal[] = [];
      for (const ponto of ctx.cronograma) {
        if (ponto.percentualExecucaoMensal.isZero()) continue;
        desembolsos.push({
          custoId: custo.id,
          mes: ponto.mes,
          valor: custoTotal.times(ponto.percentualExecucaoMensal),
        });
      }
      return desembolsos;
    }
  }
}

/** Regra de negocio R6: a soma dos percentuais de execucao mensal deve fechar em 100%. */
export function validarCronograma(cronograma: PontoCronograma[]): { valido: boolean; soma: Decimal } {
  const soma = cronograma.reduce((acc, p) => acc.plus(p.percentualExecucaoMensal), new Decimal(0));
  return { valido: soma.minus(1).abs().lessThanOrEqualTo(new Decimal("0.0005")), soma };
}
