import { prisma } from "../../src/db/client.js";

/** Limpa todas as tabelas, respeitando a ordem de chaves estrangeiras. Usado antes de cada teste de integracao para garantir um banco limpo. */
export async function resetDatabase() {
  await prisma.sessao.deleteMany();
  await prisma.empreendimentoUsuario.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.recebimentoProjetado.deleteMany();
  await prisma.distrato.deleteMany();
  await prisma.renegociacaoVenda.deleteMany();
  await prisma.venda.deleteMany();
  await prisma.premissaVelocidadeVendas.deleteMany();
  await prisma.modalidadePagamento.deleteMany();
  await prisma.condicaoPagamento.deleteMany();
  await prisma.permuta.deleteMany();
  await prisma.unidade.deleteMany();
  await prisma.cronogramaFisicoFinanceiro.deleteMany();
  await prisma.indiceCorrecao.deleteMany();
  await prisma.financiamentoProducao.deleteMany();
  await prisma.destinatarioComissao.deleteMany();
  await prisma.desembolsoCusto.deleteMany();
  await prisma.custo.deleteMany();
  await prisma.categoriaCusto.deleteMany();
  await prisma.tipologia.deleteMany();
  await prisma.terreno.deleteMany();
  await prisma.cenario.deleteMany();
  await prisma.empreendimento.deleteMany();
}
