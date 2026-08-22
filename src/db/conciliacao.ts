import { Decimal } from "decimal.js";
import type { CandidatoConciliacao, TipoCandidatoConciliacao } from "../core/conciliacaoExtrato.js";
import { prisma } from "./client.js";

/**
 * Fronteira entre banco e o motor puro de conciliacao (achado F27,
 * docs/DECISOES.md — "importação em lote de extrato bancário"): monta os
 * candidatos a partir de RecebimentoProjetado/Custo/DesembolsoCusto ainda
 * "previsto" deste cenario, e aplica as confirmacoes do usuario
 * reaproveitando exatamente os mesmos campos que as rotas de "marcar
 * realizado" individuais ja escrevem (achados da setima fatia e F21) --
 * nenhum estado novo, nenhuma tabela nova.
 */
export async function montarCandidatosConciliacao(cenarioId: string): Promise<CandidatoConciliacao[]> {
  const recebimentos = await prisma.recebimentoProjetado.findMany({
    where: { venda: { cenarioId }, status: "previsto" },
    include: { venda: { include: { unidade: { select: { numero: true } } } }, modalidade: { select: { nome: true } } },
  });
  const custosFixos = await prisma.custo.findMany({
    where: { cenarioId, status: "previsto", competenciaMes: { not: null }, categoria: { tipoIncidencia: "fixo" } },
    include: { categoria: { select: { nome: true } } },
  });
  const desembolsos = await prisma.desembolsoCusto.findMany({
    where: { custo: { cenarioId }, status: "previsto" },
    include: { custo: { include: { categoria: { select: { nome: true } } } } },
  });

  const candidatos: CandidatoConciliacao[] = [
    ...recebimentos.map((r) => ({
      tipo: "recebimento" as TipoCandidatoConciliacao,
      id: r.id,
      descricao: `${r.venda.unidade.numero} · ${r.modalidade.nome}`,
      valorPrevisto: new Decimal(r.valorPrevisto),
      mes: r.mesCompetencia,
    })),
    ...custosFixos.map((c) => ({
      tipo: "custo_fixo" as TipoCandidatoConciliacao,
      id: c.id,
      descricao: c.categoria.nome,
      valorPrevisto: new Decimal(c.valorPrevisto ?? "0"),
      mes: c.competenciaMes!,
    })),
    ...desembolsos.map((d) => ({
      tipo: "desembolso_custo" as TipoCandidatoConciliacao,
      id: d.id,
      descricao: d.custo.categoria.nome,
      valorPrevisto: new Decimal(d.valorPrevisto),
      mes: d.mes,
    })),
  ];
  return candidatos;
}

export interface ConfirmacaoConciliacao {
  tipo: TipoCandidatoConciliacao;
  id: string;
  valorRealizado: string;
}

/**
 * Valida que cada id confirmado realmente pertence a este cenario (nunca
 * confia em ids vindos do corpo da requisicao sem checar) e so entao
 * escreve — mesmo mecanismo de PATCH .../recebimentos, PATCH .../custos e
 * PATCH .../desembolsos-custos, so que em lote.
 */
export async function confirmarConciliacao(cenarioId: string, confirmacoes: ConfirmacaoConciliacao[]): Promise<{ erro: string } | { confirmados: number }> {
  const candidatos = await montarCandidatosConciliacao(cenarioId);
  const idsValidos = new Map(candidatos.map((c) => [`${c.tipo}|${c.id}`, c]));

  for (const conf of confirmacoes) {
    if (!idsValidos.has(`${conf.tipo}|${conf.id}`)) {
      return { erro: `Item ${conf.tipo}/${conf.id} não pertence a este cenário ou já foi conciliado` };
    }
  }

  for (const conf of confirmacoes) {
    if (conf.tipo === "recebimento") {
      await prisma.recebimentoProjetado.update({ where: { id: conf.id }, data: { valorRealizado: conf.valorRealizado, status: "recebido" } });
    } else if (conf.tipo === "custo_fixo") {
      await prisma.custo.update({ where: { id: conf.id }, data: { valorRealizado: conf.valorRealizado, status: "realizado" } });
    } else {
      await prisma.desembolsoCusto.update({ where: { id: conf.id }, data: { valorRealizado: conf.valorRealizado, status: "realizado" } });
    }
  }
  return { confirmados: confirmacoes.length };
}
