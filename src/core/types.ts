/**
 * Tipos do motor financeiro puro.
 *
 * Nada neste arquivo importa Prisma, banco de dados ou qualquer coisa de I/O.
 * O motor recebe estas estruturas como entrada e devolve estas estruturas
 * como saida — a camada de persistencia (src/db) e a unica responsavel por
 * traduzir linhas de tabela para/de estes tipos.
 */
import { Decimal } from "decimal.js";

export type TipoDistribuicao = "unica_na_venda" | "nivelada" | "periodica" | "mes_fixo";

/** Uma fatia de uma condicao de pagamento (ex.: "Entrada", "Parcela mensal"). */
export interface ModalidadePagamento {
  id: string;
  nome: string;
  /** 0..1 */
  percentual: Decimal;
  tipoDistribuicao: TipoDistribuicao;
  /** obrigatorio para tipoDistribuicao = "periodica" */
  periodicidadeMeses?: number;
  /** obrigatorio para tipoDistribuicao = "mes_fixo" */
  mesFixo?: number;
  /** para "mes_fixo": em quantas parcelas iguais o valor e dividido, a partir de mesFixo */
  repeticoesSobreTotal: number;
  /** para "periodica": gerar evento com valor proporcional mesmo sem ciclo completo restante */
  geraEventoParcial: boolean;
  ordem: number;
}

export interface CondicaoPagamento {
  id: string;
  nome: string;
  modalidades: ModalidadePagamento[];
}

export interface VendaInput {
  id: string;
  unidadeId: string;
  tipologiaId: string;
  mesOrigem: number;
  valorVenda: Decimal;
  condicaoPagamento: CondicaoPagamento;
}

export interface RecebimentoGerado {
  vendaId: string;
  modalidadeId: string;
  mesCompetencia: number;
  valorPrevisto: Decimal;
}

export type TipoIncidenciaCusto = "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao";

export interface CustoInput {
  id: string;
  categoriaNome: string;
  tipoIncidencia: TipoIncidenciaCusto;
  /** valor absoluto — usado quando tipoIncidencia = "fixo" */
  valorPrevisto?: Decimal;
  /** 0..1 — usado quando tipoIncidencia != "fixo" */
  percentual?: Decimal;
  /** mes de lancamento — usado quando tipoIncidencia = "fixo" e recorrencia = "unico" */
  competenciaMes?: number;
  recorrencia: "unico" | "mensal";
  participaFluxoCaixa: boolean;
  /**
   * Escopo opcional por tipologia (achado F11, docs/DECISOES.md — "estrutura
   * de comissao"): so relevante para tipoIncidencia="pct_vgv_vendido_no_mes"
   * — quando preenchido, o custo so incide sobre vendas daquela tipologia,
   * em vez de todas as vendas do cenario.
   */
  tipologiaId?: string;
  /**
   * Grupo de indice de correcao monetaria (achado F20, docs/DECISOES.md —
   * "correcao monetaria por indice diferenciado"): omitido/"padrao" segue a
   * mesma serie que corrige as vendas; qualquer outro valor usa a serie de
   * PontoIndiceCorrecao com o mesmo grupo, ou fator 1 se nenhuma existir.
   */
  grupoIndiceCorrecao?: string;
}

export interface PontoCronograma {
  mes: number;
  percentualExecucaoMensal: Decimal;
}

export interface DesembolsoMensal {
  custoId: string;
  mes: number;
  valor: Decimal;
  /** grupo de indice que corrige este desembolso (achado F20) -- omitido = "padrao" */
  grupoIndiceCorrecao?: string;
}

/** Variacao de indice de correcao monetaria (ex.: INCC, IGP-M) num mes do calendario do cenario. */
export interface PontoIndiceCorrecao {
  mes: number;
  /** variacao do indice naquele mes, ex.: 0.005 = 0.5% (pode ser negativo) */
  percentual: Decimal;
  /** serie a que este ponto pertence (achado F20) -- omitido = "padrao" */
  grupo?: string;
}

export interface FluxoMensal {
  mes: number;
  entradas: Decimal;
  saidas: Decimal;
  fluxoMensal: Decimal;
  fluxoAcumulado: Decimal;
}

export interface IndicadoresFluxo {
  necessidadeMaximaCapital: Decimal;
  mesPico: number | null;
  mesRecuperacao: number | null;
  saldoFinal: Decimal;
  vpl: Decimal;
}
