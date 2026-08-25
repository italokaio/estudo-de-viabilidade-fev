import { pathToFileURL } from "node:url";
import {
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCusto,
  criarEmpreendimento,
  criarPremissaVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
} from "../db/cadastro.js";
import { prisma } from "../db/client.js";

/**
 * Empreendimento de teste "A" (fechamento/hardening da Fase 1, docs/FASES.md):
 * poucas unidades, preço elevado, poucas parcelas -- o extremo oposto do
 * Splendido (409 vendas) e do Recanto das Aroeiras (24 vendas, parcelamento
 * longo). Prova que o motor não depende de volume nem de uma condição de
 * pagamento com muitas modalidades: aqui são só 2 (Entrada + 2 reforços
 * semestrais), sem parcela mensal nenhuma.
 */
export async function importarTesteA() {
  const empreendimento = await criarEmpreendimento({ nome: "Torres Alto Padrão", incorporador: "Alto Padrão Empreendimentos S.A." });

  const cenario = await criarCenario({ empreendimentoId: empreendimento.id, tipo: "base", nome: "Base", horizonteProjecaoMeses: 10 });

  const tipologia = await criarTipologia({
    empreendimentoId: empreendimento.id,
    nome: "Cobertura Duplex",
    areaPrivativaPadrao: "220",
    precoUnitarioPadrao: "3200000",
  });

  await criarUnidadesEmLote({
    empreendimentoId: empreendimento.id,
    tipologiaId: tipologia.id,
    quantidade: 6,
    precoVenda: "3200000",
    areaPrivativa: "220",
    prefixoNumero: "CB",
  });

  // Só 2 parcelas no total: entrada + 1 reforço semestral -- o oposto do
  // parcelamento longo do Recanto das Aroeiras e das intermediárias
  // periódicas do Splendido.
  await criarCondicaoPagamento({
    empreendimentoId: empreendimento.id,
    tipologiaId: tipologia.id,
    nome: "Entrada + reforço semestral",
    modalidades: [
      { nome: "Entrada", percentual: "0.4", tipoDistribuicao: "unica_na_venda", ordem: 0 },
      { nome: "Reforço semestral", percentual: "0.6", tipoDistribuicao: "periodica", periodicidadeMeses: 6, ordem: 1 },
    ],
  });

  // Velocidade concentrada: 2 unidades/mês nos 3 primeiros meses -- todas as
  // 6 unidades vendidas rápido, ao contrário da curva longa do Splendido.
  await criarPremissaVelocidade(
    [1, 2, 3].map((mes) => ({ empreendimentoId: empreendimento.id, cenarioId: cenario.id, tipologiaId: tipologia.id, mes, unidadesPrevistas: "2" })),
  );

  const categoriaLegalizacao = await criarCategoriaCusto({ nome: "Legalização", tipoIncidencia: "fixo" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaLegalizacao.id,
    valorPrevisto: "150000",
    competenciaMes: 1,
    participaFluxoCaixa: true,
  });

  const categoriaComissao = await criarCategoriaCusto({ nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaComissao.id,
    percentual: "0.04",
    participaFluxoCaixa: true,
  });

  return { empreendimentoId: empreendimento.id, cenarioId: cenario.id };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  importarTesteA()
    .then((r) => {
      console.log("Teste A importado:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
