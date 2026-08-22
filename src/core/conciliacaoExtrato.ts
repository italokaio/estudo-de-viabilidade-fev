import { Decimal } from "decimal.js";

/**
 * Importacao em lote de extrato bancario (achado F27, docs/DECISOES.md).
 * Motor puro (zero I/O, principio A da fundacao arquitetural): recebe o
 * texto de um CSV ja lido e uma lista de candidatos ja montada pela camada
 * de banco (src/db/conciliacao.ts), devolve sugestoes -- nunca decide
 * sozinho, nunca escreve nada. A confirmacao final e sempre um ato
 * explicito do usuario (ver "sugerir e confirmar", nao "marcar automatico").
 */

export interface LinhaExtrato {
  data: string | null; // "AAAA-MM-DD", ou null se a linha nao trouxe uma data valida
  descricao: string;
  /** positivo = entrada (recebimento), negativo = saida (custo) */
  valor: Decimal;
}

/**
 * Le um CSV com cabecalho Data,Descrição,Valor (nomes de coluna
 * case-insensitive, com ou sem acento). Uma linha malformada (valor nao
 * numerico) e simplesmente descartada -- nao interrompe a importacao
 * inteira por causa de uma linha ruim no meio do arquivo.
 */
export function parseExtratoCSV(csvTexto: string): LinhaExtrato[] {
  const linhas = csvTexto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0]!.split(",").map((c) => normalizarCabecalho(c));
  const idxData = cabecalho.indexOf("data");
  const idxDescricao = cabecalho.indexOf("descricao");
  const idxValor = cabecalho.indexOf("valor");
  if (idxData === -1 || idxDescricao === -1 || idxValor === -1) {
    throw new Error("Cabeçalho do CSV deve conter as colunas Data, Descrição e Valor");
  }

  const resultado: LinhaExtrato[] = [];
  for (const linha of linhas.slice(1)) {
    const colunas = linha.split(",");
    const valorTexto = colunas[idxValor]?.trim();
    if (!valorTexto || Number.isNaN(Number(valorTexto))) continue;
    const dataTexto = colunas[idxData]?.trim();
    resultado.push({
      data: dataTexto && /^\d{4}-\d{2}-\d{2}$/.test(dataTexto) ? dataTexto : null,
      descricao: colunas[idxDescricao]?.trim() ?? "",
      valor: new Decimal(valorTexto),
    });
  }
  return resultado;
}

function normalizarCabecalho(coluna: string): string {
  return coluna
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type TipoCandidatoConciliacao = "recebimento" | "custo_fixo" | "desembolso_custo";

export interface CandidatoConciliacao {
  tipo: TipoCandidatoConciliacao;
  id: string;
  descricao: string;
  valorPrevisto: Decimal;
  mes: number;
}

export interface SugestaoCandidato extends CandidatoConciliacao {
  /** maior = mais provavel; sem unidade definida, so serve para ordenar */
  score: number;
}

export interface SugestaoLinha {
  linha: LinhaExtrato;
  candidatos: SugestaoCandidato[];
}

const TOLERANCIA_RELATIVA_VALOR = new Decimal("0.01"); // 1%
const MAX_SUGESTOES_POR_LINHA = 3;

/**
 * Converte uma data de calendario em numero de mes relativo ao cenario
 * (mes 1 = mesmo mes-ano de dataMesUm), para poder comparar com
 * `RecebimentoProjetado.mesCompetencia`/`Custo.competenciaMes` (sempre
 * inteiros relativos, nunca datas reais -- ver achado F27).
 */
function mesDaData(data: string, dataMesUm: Date): number {
  const [ano, mes] = data.split("-").map(Number);
  const anoBase = dataMesUm.getUTCFullYear();
  const mesBase = dataMesUm.getUTCMonth() + 1;
  return (ano! - anoBase) * 12 + (mes! - mesBase) + 1;
}

/**
 * Sugere, para cada linha do extrato, os candidatos mais provaveis dentre
 * RecebimentoProjetado/Custo/DesembolsoCusto ainda "previsto". Entradas
 * (valor > 0) so casam com recebimentos; saidas (valor < 0) so casam com
 * custos. Um candidato cujo valorPrevisto diverge mais que
 * TOLERANCIA_RELATIVA_VALOR do valor da linha nem entra na lista --
 * "sugerir e confirmar" nao e "listar tudo e deixar o usuario procurar".
 */
export function sugerirConciliacao(linhas: LinhaExtrato[], candidatos: CandidatoConciliacao[], dataMesUm?: Date): SugestaoLinha[] {
  return linhas.map((linha) => {
    const valorAbsoluto = linha.valor.abs();
    const tipoAlvo: TipoCandidatoConciliacao[] = linha.valor.isPositive() ? ["recebimento"] : ["custo_fixo", "desembolso_custo"];
    const mesEsperado = linha.data && dataMesUm ? mesDaData(linha.data, dataMesUm) : null;

    const pontuados = candidatos
      .filter((c) => tipoAlvo.includes(c.tipo))
      .map((c): SugestaoCandidato | null => {
        const diffValor = c.valorPrevisto.minus(valorAbsoluto).abs();
        const toleranciaAbsoluta = c.valorPrevisto.times(TOLERANCIA_RELATIVA_VALOR);
        if (diffValor.greaterThan(toleranciaAbsoluta) && diffValor.greaterThan(1)) return null;
        const diffMes = mesEsperado === null ? 0 : Math.abs(c.mes - mesEsperado);
        const score = 1000 - diffValor.toNumber() * 10 - diffMes * 5;
        return { ...c, score };
      })
      .filter((c): c is SugestaoCandidato => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGESTOES_POR_LINHA);

    return { linha, candidatos: pontuados };
  });
}
