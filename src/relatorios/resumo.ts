import { Decimal } from "decimal.js";
import type { DadosRelatorioViabilidade } from "./dados.js";

/**
 * Agregações do relatório "Viabilidade Resumido": só somam linhas já produzidas
 * pelo motor/banco (mesmas de DadosRelatorioViabilidade), nunca recalculam nada.
 */

export const NOTA_PAYBACK_DESCONTADO_ANTES_DO_SIMPLES = "Payback descontado antes do simples: possível quando há saída de caixa depois do pico. O desconto reduz o peso dessas saídas futuras, então o saldo descontado pode voltar a zero antes do saldo nominal. Não indica erro de cálculo.";

export function precisaNotaPaybackDescontado(simples: number | null, descontado: number | null): boolean {
  return simples !== null && descontado !== null && descontado < simples;
}

export const ROTULO_PAPEL_CUSTO: Record<string, string> = {
  custo: "Custo",
  comissao_corretagem: "Comissão de corretagem",
  tributo: "Tributo",
};

/** Percentual com uma casa decimal no padrao pt-BR, ex.: 0.403 -> "40,3%". */
export function formatarPercentualUmaCasa(valor: string | number): string {
  return `${(Number(valor) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Percentual mensal com duas casas, ex.: 0.005 -> "0,50%". */
export function formatarPercentualMensal(valor: string | number): string {
  return `${(Number(valor) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

type VendaRelatorio = DadosRelatorioViabilidade["vendas"][number];
type RecebimentoRelatorio = DadosRelatorioViabilidade["recebimentos"][number];

export interface LinhaVendaTipologia {
  tipologiaNome: string;
  unidadesVendidas: number;
  vgvVendido: string;
  ticketMedio: string | null;
}

export interface ResumoVendasPorTipologia {
  linhas: LinhaVendaTipologia[];
  total: { unidadesVendidas: number; vgvVendido: string; ticketMedio: string | null };
}

export function resumirVendasPorTipologia(vendas: VendaRelatorio[]): ResumoVendasPorTipologia {
  const grupos = new Map<string, { unidades: number; vgv: Decimal }>();
  for (const v of vendas) {
    if (v.status !== "ativa") continue;
    const g = grupos.get(v.tipologiaNome) ?? { unidades: 0, vgv: new Decimal(0) };
    g.unidades += 1;
    g.vgv = g.vgv.plus(v.valorVenda);
    grupos.set(v.tipologiaNome, g);
  }
  const linhas = Array.from(grupos, ([tipologiaNome, g]) => ({
    tipologiaNome,
    unidadesVendidas: g.unidades,
    vgvVendido: g.vgv.toFixed(2),
    ticketMedio: g.unidades > 0 ? g.vgv.div(g.unidades).toFixed(2) : null,
  }));
  const totalUnidades = linhas.reduce((acc, l) => acc + l.unidadesVendidas, 0);
  const totalVgv = linhas.reduce((acc, l) => acc.plus(l.vgvVendido), new Decimal(0));
  return {
    linhas,
    total: {
      unidadesVendidas: totalUnidades,
      vgvVendido: totalVgv.toFixed(2),
      ticketMedio: totalUnidades > 0 ? totalVgv.div(totalUnidades).toFixed(2) : null,
    },
  };
}

export interface LinhaRecebimentoMes {
  mes: number;
  totalPrevisto: string;
  totalRealizado: string;
}

export interface ResumoRecebimentosPorMes {
  linhas: LinhaRecebimentoMes[];
  total: { totalPrevisto: string; totalRealizado: string };
}

/** Uma linha por mês do horizonte (inclui meses sem recebimento), somando todas as unidades e modalidades. */
export function resumirRecebimentosPorMes(recebimentos: RecebimentoRelatorio[], horizonteMeses: number): ResumoRecebimentosPorMes {
  const ultimoMes = Math.max(horizonteMeses, ...recebimentos.map((r) => r.mesCompetencia), 0);
  const grupos = new Map<number, { previsto: Decimal; realizado: Decimal }>();
  for (const r of recebimentos) {
    const g = grupos.get(r.mesCompetencia) ?? { previsto: new Decimal(0), realizado: new Decimal(0) };
    g.previsto = g.previsto.plus(r.valorPrevisto);
    if (r.valorRealizado) g.realizado = g.realizado.plus(r.valorRealizado);
    grupos.set(r.mesCompetencia, g);
  }
  const linhas: LinhaRecebimentoMes[] = [];
  let totalPrevisto = new Decimal(0);
  let totalRealizado = new Decimal(0);
  for (let mes = 1; mes <= ultimoMes; mes++) {
    const g = grupos.get(mes) ?? { previsto: new Decimal(0), realizado: new Decimal(0) };
    totalPrevisto = totalPrevisto.plus(g.previsto);
    totalRealizado = totalRealizado.plus(g.realizado);
    linhas.push({ mes, totalPrevisto: g.previsto.toFixed(2), totalRealizado: g.realizado.toFixed(2) });
  }
  return { linhas, total: { totalPrevisto: totalPrevisto.toFixed(2), totalRealizado: totalRealizado.toFixed(2) } };
}
