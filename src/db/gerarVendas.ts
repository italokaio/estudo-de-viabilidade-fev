import { prisma } from "./client.js";

/**
 * Traduz PremissaVelocidadeVendas (quantas unidades de cada tipologia se
 * espera vender em cada mes) em registros reais de Venda, alocando
 * unidades em estoque. E aqui que "premissa" (dado configuravel) vira
 * "dado" (uma venda concreta, com unidade e mes definidos) — o motor
 * financeiro em si nunca ve PremissaVelocidadeVendas, so ve Venda.
 */
export async function gerarVendasDePremissaVelocidade(cenarioId: string) {
  const premissas = await prisma.premissaVelocidadeVendas.findMany({
    where: { cenarioId },
    orderBy: [{ mes: "asc" }],
  });

  let totalVendasCriadas = 0;

  for (const premissa of premissas) {
    const quantidade = Math.round(Number(premissa.unidadesPrevistas));
    if (quantidade <= 0) continue;

    const condicao = await prisma.condicaoPagamento.findFirst({
      where: { empreendimentoId: premissa.empreendimentoId, tipologiaId: premissa.tipologiaId },
    });
    if (!condicao) {
      throw new Error(
        `Nao existe CondicaoPagamento cadastrada para a tipologia ${premissa.tipologiaId} — nao e possivel gerar vendas sem condicao de pagamento (regra R1).`,
      );
    }

    const unidadesDisponiveis = await prisma.unidade.findMany({
      where: { tipologiaId: premissa.tipologiaId, status: "estoque" },
      orderBy: { numero: "asc" },
      take: quantidade,
    });

    if (unidadesDisponiveis.length < quantidade) {
      throw new Error(
        `Premissa de velocidade pede ${quantidade} unidades da tipologia ${premissa.tipologiaId} no mes ${premissa.mes}, ` +
          `mas so ha ${unidadesDisponiveis.length} em estoque.`,
      );
    }

    for (const unidade of unidadesDisponiveis) {
      await prisma.venda.create({
        data: {
          empreendimentoId: premissa.empreendimentoId,
          cenarioId,
          unidadeId: unidade.id,
          mesOrigem: premissa.mes,
          valorVenda: unidade.precoVenda ?? "0",
          condicaoPagamentoId: condicao.id,
          status: "ativa",
        },
      });
      await prisma.unidade.update({ where: { id: unidade.id }, data: { status: "vendida" } });
      totalVendasCriadas++;
    }
  }

  return { totalVendasCriadas };
}
