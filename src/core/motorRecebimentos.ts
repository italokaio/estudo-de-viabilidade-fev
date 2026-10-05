import { Decimal } from "decimal.js";
import type { ModalidadePagamento, RecebimentoGerado, VendaInput } from "./types.js";

/**
 * Motor de recebimentos — o componente central descoberto na engenharia
 * reversa da planilha (ver docs/DIVERGENCIAS_PLANILHA.md, achado da Fase 1
 * sobre a aba REC PROJETADA): uma venda nao e caixa integral no mes da
 * venda, ela gera uma serie de recebimentos futuros determinada pela sua
 * condicao de pagamento.
 *
 * Generico por construcao: nao ha nenhuma referencia a tipologia, produto
 * ou empreendimento especifico. O horizonte, o numero de modalidades e a
 * estrategia de distribuicao de cada modalidade vem inteiramente da
 * CondicaoPagamento da venda (dado), nunca de uma constante deste arquivo.
 *
 * Regras universais implementadas (ver docs/REGRAS_DE_NEGOCIO.md):
 *   R1 — uma venda nunca e caixa integral no mes da venda.
 *   R3 — modalidade nivelada distribui o valor igualmente pelos meses
 *        restantes ate o horizonte, recalculado por venda.
 *   R4 — modalidade periodica so gera evento se houver um ciclo completo
 *        restante, salvo geraEventoParcial=true.
 *   R5 — modalidade "mes_fixo" e calculada sobre o valor desta venda (nao
 *        sobre um agregado de outras vendas) e lancada em mes(es) fixo(s)
 *        do calendario, independente de quando a venda ocorreu. Por
 *        distributividade, SUM(venda.valor * pct) lancado no mesmo mes
 *        fixo produz resultado identico a calcular sobre o total agregado
 *        primeiro — nao ha necessidade de uma etapa de agregacao separada.
 */
export function gerarRecebimentos(venda: VendaInput, horizonteMeses: number): RecebimentoGerado[] {
  const recebimentos: RecebimentoGerado[] = [];

  for (const modalidade of venda.condicaoPagamento.modalidades) {
    recebimentos.push(...gerarEventosDaModalidade(venda, modalidade, horizonteMeses));
  }

  return recebimentos;
}

function gerarEventosDaModalidade(
  venda: VendaInput,
  modalidade: ModalidadePagamento,
  horizonteMeses: number,
): RecebimentoGerado[] {
  const valorTotalModalidade = venda.valorVenda.times(modalidade.percentual);

  switch (modalidade.tipoDistribuicao) {
    case "unica_na_venda":
      return [evento(venda, modalidade, venda.mesOrigem, valorTotalModalidade)];

    case "nivelada": {
      const mesLimite = modalidade.mesFinal !== undefined ? Math.min(modalidade.mesFinal, horizonteMeses) : horizonteMeses;
      const mesesRestantes = mesLimite - venda.mesOrigem;
      if (mesesRestantes <= 0) {
        // venda ocorre no ultimo mes do horizonte (ou do mesFinal) ou depois: nao ha janela
        // para parcelar — todo o valor cai no proprio mes da venda.
        return [evento(venda, modalidade, venda.mesOrigem, valorTotalModalidade)];
      }
      const valorParcela = valorTotalModalidade.dividedBy(mesesRestantes);
      const eventos: RecebimentoGerado[] = [];
      for (let mes = venda.mesOrigem + 1; mes <= mesLimite; mes++) {
        eventos.push(evento(venda, modalidade, mes, valorParcela));
      }
      return eventos;
    }

    case "periodica": {
      const periodo = modalidade.periodicidadeMeses ?? 1;
      const mesesRestantes = horizonteMeses - venda.mesOrigem;
      const ciclosCompletos = Math.floor(mesesRestantes / periodo);

      if (ciclosCompletos === 0) {
        if (!modalidade.geraEventoParcial) {
          // regra de negocio, nao omissao silenciosa: sem ciclo completo
          // restante, esta modalidade nao gera nenhum evento para esta venda.
          return [];
        }
        return [evento(venda, modalidade, horizonteMeses, valorTotalModalidade)];
      }

      const valorPorCiclo = valorTotalModalidade.dividedBy(ciclosCompletos);
      const eventos: RecebimentoGerado[] = [];
      for (let i = 1; i <= ciclosCompletos; i++) {
        const mes = venda.mesOrigem + i * periodo;
        eventos.push(evento(venda, modalidade, mes, valorPorCiclo));
      }
      return eventos;
    }

    case "mes_fixo": {
      const mesFixoBase = modalidade.mesFixo ?? horizonteMeses;
      // uma venda nunca recebe antes de ter sido vendida.
      const mesEfetivo = Math.max(mesFixoBase, venda.mesOrigem);
      const repeticoes = Math.max(1, modalidade.repeticoesSobreTotal);
      const valorPorRepeticao = valorTotalModalidade.dividedBy(repeticoes);
      const eventos: RecebimentoGerado[] = [];
      for (let i = 0; i < repeticoes; i++) {
        eventos.push(evento(venda, modalidade, mesEfetivo + i, valorPorRepeticao));
      }
      return eventos;
    }
  }
}

function evento(
  venda: VendaInput,
  modalidade: ModalidadePagamento,
  mesCompetencia: number,
  valorPrevisto: Decimal,
): RecebimentoGerado {
  return { vendaId: venda.id, modalidadeId: modalidade.id, mesCompetencia, valorPrevisto };
}
