import { Decimal } from "decimal.js";
import type { CustoInput, DesembolsoMensal, PontoCronograma, RecebimentoGerado, VendaInput } from "./types.js";

export interface ContextoCustos {
  /** vendas do empreendimento/cenario, para incidencia pct_vgv_vendido_no_mes */
  vendas: VendaInput[];
  /** total recebido por mes (soma de RecebimentoProjetado.valorPrevisto), para pct_recebido_mes_anterior */
  recebidoPorMes: Map<number, Decimal>;
  /**
   * Recebimentos individuais, um por venda x modalidade x mes (achado F25,
   * docs/DECISOES.md — "comissao paga na curva de recebimento"), para
   * pct_recebido_no_mes -- diferente de recebidoPorMes (agregado, sem saber
   * de qual venda veio cada parcela), aqui cada recebimento carrega seu
   * vendaId, permitindo escopar por tipologia como pct_vgv_vendido_no_mes ja faz.
   */
  recebimentos: RecebimentoGerado[];
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
 * Nenhuma das seis estrategias abaixo sabe o nome da rubrica que a usa —
 * "comissao" e "RET" nao aparecem em lugar nenhum deste arquivo. O que a
 * um empreendimento chama de "comissao no mes da venda" e apenas um Custo
 * com tipoIncidencia="pct_vgv_vendido_no_mes"; "comissao na curva de
 * recebimento" (achado F25) e tipoIncidencia="pct_recebido_no_mes";
 * "comissao progressiva por volume vendido" (achado F28) e
 * tipoIncidencia="faixas_vgv_acumulado"; um encargo do tipo "RET" e apenas
 * um Custo com tipoIncidencia="pct_recebido_mes_anterior".
 */
export function gerarDesembolsosMensais(custo: CustoInput, ctx: ContextoCustos): DesembolsoMensal[] {
  return gerarDesembolsosSemGrupo(custo, ctx).map((d) => ({ ...d, grupoIndiceCorrecao: custo.grupoIndiceCorrecao }));
}

function gerarDesembolsosSemGrupo(custo: CustoInput, ctx: ContextoCustos): DesembolsoMensal[] {
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

    case "pct_recebido_no_mes": {
      // Comissao paga na curva de recebimento (achado F25, docs/DECISOES.md),
      // em vez de tudo de uma vez no mes da venda (pct_vgv_vendido_no_mes):
      // cada parcela realmente recebida gera sua fatia da comissao, no mesmo
      // mes em que a parcela e projetada -- nao no mes seguinte
      // (pct_recebido_mes_anterior e uma coisa diferente: um encargo tipo
      // RET, sobre o CAIXA agregado do cenario inteiro, sem saber de qual
      // venda veio).
      const percentual = custo.percentual ?? new Decimal(0);
      const vendaIdsBase = new Set(
        (custo.tipologiaId ? ctx.vendas.filter((v) => v.tipologiaId === custo.tipologiaId) : ctx.vendas).map((v) => v.id),
      );
      const totalPorMes = new Map<number, Decimal>();
      for (const r of ctx.recebimentos) {
        if (!vendaIdsBase.has(r.vendaId)) continue;
        const atual = totalPorMes.get(r.mesCompetencia) ?? new Decimal(0);
        totalPorMes.set(r.mesCompetencia, atual.plus(r.valorPrevisto));
      }
      const desembolsos: DesembolsoMensal[] = [];
      for (const [mes, totalRecebido] of totalPorMes) {
        desembolsos.push({ custoId: custo.id, mes, valor: totalRecebido.times(percentual) });
      }
      return desembolsos;
    }

    case "faixas_vgv_acumulado": {
      // Faixas de comissao progressiva por volume vendido (achado F28,
      // docs/DECISOES.md): o volume de referencia e o VGV vendido
      // acumulado desde o inicio do cenario, nunca reinicia por mes/periodo.
      // Cada venda usa uma taxa unica -- a da faixa em que o acumulado se
      // encontra logo apos incluir aquela venda -- em vez de fatiar o valor
      // da propria venda marginalmente entre faixas (nao e como imposto de
      // renda; e como a maioria das tabelas de comissao comercial).
      const faixasOrdenadas = [...(custo.faixas ?? [])].sort((a, b) => {
        if (a.volumeAte === undefined) return 1;
        if (b.volumeAte === undefined) return -1;
        return a.volumeAte.comparedTo(b.volumeAte);
      });
      function percentualDaFaixa(vgvAcumulado: Decimal): Decimal {
        for (const f of faixasOrdenadas) {
          if (f.volumeAte === undefined || vgvAcumulado.lessThanOrEqualTo(f.volumeAte)) return f.percentual;
        }
        // acumulado superou o limite de toda faixa cadastrada: usa a taxa da
        // ultima (mais alta) em vez de zerar -- evita que a tabela precise
        // sempre terminar com uma faixa aberta para continuar valendo.
        return faixasOrdenadas.length > 0 ? faixasOrdenadas[faixasOrdenadas.length - 1]!.percentual : new Decimal(0);
      }
      const vendasBase = custo.tipologiaId ? ctx.vendas.filter((v) => v.tipologiaId === custo.tipologiaId) : ctx.vendas;
      // Ordem cronologica de venda; desempate por id (estavel e
      // deterministico) para vendas geradas no mesmo mes -- a ordem exata
      // entre elas so importa perto de uma fronteira de faixa.
      const vendasOrdenadas = [...vendasBase].sort((a, b) => a.mesOrigem - b.mesOrigem || a.id.localeCompare(b.id));
      let vgvAcumulado = new Decimal(0);
      const totalPorMes = new Map<number, Decimal>();
      for (const venda of vendasOrdenadas) {
        vgvAcumulado = vgvAcumulado.plus(venda.valorVenda);
        const percentual = percentualDaFaixa(vgvAcumulado);
        const comissao = venda.valorVenda.times(percentual);
        const atual = totalPorMes.get(venda.mesOrigem) ?? new Decimal(0);
        totalPorMes.set(venda.mesOrigem, atual.plus(comissao));
      }
      const desembolsos: DesembolsoMensal[] = [];
      for (const [mes, valor] of totalPorMes) {
        desembolsos.push({ custoId: custo.id, mes, valor });
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
