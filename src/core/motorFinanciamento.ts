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
 * capitalizam mes a mes sobre o saldo devedor enquanto a obra avanca
 * (antes da amortizacao comecar) -- nunca pagos a parte durante essa
 * fase.
 *
 * Tabela de amortizacao (achado F16): tres formas de pagar de volta o
 * saldo devedor acumulado ate mesAmortizacao --
 *   "unico"  -- pagamento unico do saldo inteiro (principal + juros
 *               capitalizados), no mes configurado. Caso mais comum na
 *               pratica (repasse bancario na entrega das unidades).
 *   "sac"    -- amortizacao constante: o principal e dividido em
 *               numeroParcelas parcelas iguais; os juros de cada parcela
 *               incidem sobre o saldo remanescente, entao decrescem mes
 *               a mes junto com o saldo -- a parcela total (amortizacao
 *               + juros) tambem decresce.
 *   "price"  -- parcela total constante (sistema frances): juros
 *               decrescem e amortizacao cresce mes a mes, mas a soma das
 *               duas e sempre a mesma parcela, calculada pela formula de
 *               anuidade padrao.
 *
 * Simplificacao deliberada: a tabela SAC/Price e fixada a partir do
 * saldo devedor acumulado ate o inicio de mesAmortizacao -- o modelo
 * assume que as liberacoes terminam antes da amortizacao comecar (a
 * pratica real: repasse bancario so acontece na entrega da obra). Uma
 * liberacao que ocorra durante o periodo de amortizacao soma ao saldo
 * devedor reportado, mas nao gera uma parcela extra nem recalcula a
 * tabela ja fixada.
 */
export type TipoAmortizacao = "unico" | "sac" | "price";

export interface FinanciamentoInput {
  valorContratado: Decimal;
  /** 0..1, juros capitalizados mes a mes sobre o saldo devedor, ate a amortizacao comecar */
  taxaJurosMensal: Decimal;
  /** mes em que a amortizacao comeca -- pagamento unico ou primeira parcela */
  mesAmortizacao: number;
  /** "unico" (padrao) preserva o comportamento original; "sac"/"price" exigem numeroParcelas */
  tipoAmortizacao?: TipoAmortizacao;
  /** obrigatorio quando tipoAmortizacao != "unico" -- quantidade de meses da tabela de amortizacao */
  numeroParcelas?: number;
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
  const tipoAmortizacao = financiamento.tipoAmortizacao ?? "unico";
  const percentualPorMes = new Map(cronograma.map((p) => [p.mes, p.percentualExecucaoMensal]));
  const pontos: PontoFinanciamento[] = [];
  let saldo = new Decimal(0);

  // parcela fixa do sistema Price -- calculada uma unica vez, no mes em que
  // a tabela e fixada (inicio de mesAmortizacao), antes do loop principal.
  let parcelaPrice: Decimal | null = null;
  let amortizacaoConstanteSac: Decimal | null = null;

  for (let mes = 1; mes <= horizonteMeses; mes++) {
    const jaAmortizando = tipoAmortizacao !== "unico" && mes >= financiamento.mesAmortizacao && financiamento.numeroParcelas
      ? mes < financiamento.mesAmortizacao + financiamento.numeroParcelas
      : false;

    if (jaAmortizando) {
      // Fixa a tabela no primeiro mes de amortizacao, sobre o saldo
      // acumulado ate aqui (mesma base que "unico" usaria como pagamento unico).
      if (mes === financiamento.mesAmortizacao) {
        const principal = saldo;
        const n = financiamento.numeroParcelas!;
        if (tipoAmortizacao === "sac") {
          amortizacaoConstanteSac = principal.dividedBy(n);
        } else {
          const i = financiamento.taxaJurosMensal;
          parcelaPrice = i.isZero() ? principal.dividedBy(n) : principal.times(i).dividedBy(new Decimal(1).minus(new Decimal(1).plus(i).pow(-n)));
        }
      }

      // Diferente da fase de liberacao (juros capitalizam, ainda nao pagos),
      // aqui os juros do mes sao pagos como parte da parcela -- o saldo so
      // diminui pela parcela do PRINCIPAL, nunca reincorpora juros.
      const jurosDoMes = saldo.times(financiamento.taxaJurosMensal);
      const principalPago = tipoAmortizacao === "sac" ? amortizacaoConstanteSac! : parcelaPrice!.minus(jurosDoMes);
      const parcelaTotal = principalPago.plus(jurosDoMes);

      // liberacao durante a amortizacao (fora da pratica esperada, ver
      // docstring) soma ao saldo reportado, sem alterar a parcela ja fixada.
      const percentual = percentualPorMes.get(mes) ?? new Decimal(0);
      const liberacao = financiamento.valorContratado.times(percentual);
      saldo = saldo.minus(principalPago).plus(liberacao);

      pontos.push({ mes, liberacao, jurosDoMes, amortizacao: parcelaTotal, saldoDevedor: saldo });
      continue;
    }

    const jurosDoMes = saldo.times(financiamento.taxaJurosMensal);
    saldo = saldo.plus(jurosDoMes);

    const percentual = percentualPorMes.get(mes) ?? new Decimal(0);
    const liberacao = financiamento.valorContratado.times(percentual);
    saldo = saldo.plus(liberacao);

    let amortizacao = new Decimal(0);
    if (tipoAmortizacao === "unico" && mes === financiamento.mesAmortizacao) {
      amortizacao = saldo;
      saldo = new Decimal(0);
    }

    pontos.push({ mes, liberacao, jurosDoMes, amortizacao, saldoDevedor: saldo });
  }

  return pontos;
}
