import { pathToFileURL } from "node:url";
import {
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCronograma,
  criarCusto,
  criarEmpreendimento,
  criarPremissaVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
  definirFinanciamento,
} from "../db/cadastro.js";
import { prisma } from "../db/client.js";

/**
 * Empreendimento de teste "B" (fechamento/hardening da Fase 1, docs/FASES.md):
 * muitas unidades, preço menor, prazo longo, financiamento diferente do que
 * qualquer outro empreendimento de teste já usado (SAC, em vez de "único"
 * do Splendido/Aroeiras). Prova que o motor lida com volume alto (300
 * unidades) e um horizonte de 48 meses sem nenhuma constante hardcoded.
 */
export async function importarTesteB() {
  const empreendimento = await criarEmpreendimento({ nome: "Residencial Horizonte", incorporador: "Horizonte Incorporações Ltda." });

  const cenario = await criarCenario({ empreendimentoId: empreendimento.id, tipo: "base", nome: "Base", horizonteProjecaoMeses: 48 });

  const tipologia = await criarTipologia({
    empreendimentoId: empreendimento.id,
    nome: "Studio Popular",
    areaPrivativaPadrao: "32",
    precoUnitarioPadrao: "120000",
  });

  await criarUnidadesEmLote({
    empreendimentoId: empreendimento.id,
    tipologiaId: tipologia.id,
    quantidade: 300,
    precoVenda: "120000",
    areaPrivativa: "32",
    prefixoNumero: "ST",
  });

  // Entrada pequena + parcelas mensais niveladas de longo prazo + uma
  // intermediária anual -- combinação diferente da entrada+reforço de A e
  // das intermediárias curtas do Splendido.
  await criarCondicaoPagamento({
    empreendimentoId: empreendimento.id,
    tipologiaId: tipologia.id,
    nome: "Entrada + parcelas longas + intermediária anual",
    modalidades: [
      { nome: "Entrada", percentual: "0.1", tipoDistribuicao: "unica_na_venda", ordem: 0 },
      { nome: "Parcelas mensais", percentual: "0.7", tipoDistribuicao: "nivelada", ordem: 1 },
      { nome: "Intermediária anual", percentual: "0.2", tipoDistribuicao: "periodica", periodicidadeMeses: 12, ordem: 2 },
    ],
  });

  // Velocidade distribuída ao longo de 20 meses (15 unidades/mês) -- volume
  // de venda mensal bem maior que os outros dois empreendimentos de teste.
  await criarPremissaVelocidade(
    Array.from({ length: 20 }, (_, i) => i + 1).map((mes) => ({
      empreendimentoId: empreendimento.id,
      cenarioId: cenario.id,
      tipologiaId: tipologia.id,
      mes,
      unidadesPrevistas: "15",
    })),
  );

  // Cronograma físico simples e linear em 24 meses, para alimentar o custo
  // de obra por execução e a curva de liberação do financiamento.
  const meses = 24;
  await criarCronograma({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    pontos: Array.from({ length: meses }, (_, i) => ({ mes: i + 1, percentualExecucaoMensal: (1 / meses).toFixed(10) })),
  });

  const categoriaObra = await criarCategoriaCusto({ nome: "Obra", tipoIncidencia: "pct_execucao" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaObra.id,
    valorPrevisto: "18000000",
    participaFluxoCaixa: true,
  });

  const categoriaTerreno = await criarCategoriaCusto({ nome: "Terreno", tipoIncidencia: "fixo" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaTerreno.id,
    valorPrevisto: "4500000",
    competenciaMes: 1,
    participaFluxoCaixa: true,
  });

  // Financiamento diferente de qualquer outro empreendimento de teste:
  // SAC (amortização constante), ao longo de 18 parcelas a partir do mês 30.
  await definirFinanciamento({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    valorContratado: "10000000",
    taxaJurosMensal: "0.008",
    mesAmortizacao: 30,
    tipoAmortizacao: "sac",
    numeroParcelas: 18,
  });

  return { empreendimentoId: empreendimento.id, cenarioId: cenario.id };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  importarTesteB()
    .then((r) => {
      console.log("Teste B importado:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
