import { pathToFileURL } from "node:url";
import {
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCusto,
  criarEmpreendimento,
  criarFaixaComissao,
  criarPremissaVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
  definirFinanciamento,
} from "../db/cadastro.js";
import { prisma } from "../db/client.js";

/**
 * Empreendimento de teste "C" (fechamento/hardening da Fase 1, docs/FASES.md):
 * condição comercial completamente diferente dos outros três empreendimentos
 * de teste (Splendido, Aroeiras, A, B) -- garagem vendida como produto
 * independente (mesmo mecanismo de Tipologia que qualquer outro produto,
 * sem tratamento especial no motor), parcela única na entrega de chaves
 * (mes_fixo) em vez de parcelamento distribuído, financiamento Price (juros
 * decrescentes constantes, diferente do SAC de B e do "único" de A), e
 * comissão em faixas progressivas por VGV acumulado (achado F28) em vez de
 * percentual fixo.
 */
export async function importarTesteC() {
  const empreendimento = await criarEmpreendimento({ nome: "Vila Jardins", incorporador: "Jardins Construtora e Incorporadora" });

  const cenario = await criarCenario({ empreendimentoId: empreendimento.id, tipo: "base", nome: "Base", horizonteProjecaoMeses: 30 });

  const apartamento = await criarTipologia({
    empreendimentoId: empreendimento.id,
    nome: "Apartamento 2 Quartos",
    areaPrivativaPadrao: "65",
    precoUnitarioPadrao: "450000",
  });
  await criarUnidadesEmLote({
    empreendimentoId: empreendimento.id,
    tipologiaId: apartamento.id,
    quantidade: 40,
    precoVenda: "450000",
    areaPrivativa: "65",
    prefixoNumero: "AP",
  });
  // Parcela única na entrega de chaves (mês 24) -- diferente de qualquer
  // outra condição de pagamento usada nos empreendimentos de teste, que
  // sempre distribuem o valor ao longo de várias parcelas.
  await criarCondicaoPagamento({
    empreendimentoId: empreendimento.id,
    tipologiaId: apartamento.id,
    nome: "100% na entrega de chaves",
    modalidades: [{ nome: "Chaves", percentual: "1", tipoDistribuicao: "mes_fixo", mesFixo: 24, repeticoesSobreTotal: 1, ordem: 0 }],
  });

  // Garagem como produto independente -- mesma mecânica de Tipologia que
  // "Apartamento 2 Quartos", "Studio Popular" ou "Cobertura Duplex": o motor
  // não sabe que "garagem" é um conceito diferente de qualquer outro produto.
  const garagem = await criarTipologia({
    empreendimentoId: empreendimento.id,
    nome: "Garagem",
    areaPrivativaPadrao: "12",
    precoUnitarioPadrao: "35000",
  });
  await criarUnidadesEmLote({
    empreendimentoId: empreendimento.id,
    tipologiaId: garagem.id,
    quantidade: 40,
    precoVenda: "35000",
    areaPrivativa: "12",
    prefixoNumero: "GR",
  });
  await criarCondicaoPagamento({
    empreendimentoId: empreendimento.id,
    tipologiaId: garagem.id,
    nome: "À vista",
    modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda", ordem: 0 }],
  });

  // Velocidade: apartamento e garagem vendidos juntos, mesmo mês, unidades
  // diferentes -- prova que duas tipologias vendidas em paralelo no mesmo
  // cenário não se confundem no motor.
  await criarPremissaVelocidade(
    [1, 2, 3, 4].flatMap((mes) => [
      { empreendimentoId: empreendimento.id, cenarioId: cenario.id, tipologiaId: apartamento.id, mes, unidadesPrevistas: "10" },
      { empreendimentoId: empreendimento.id, cenarioId: cenario.id, tipologiaId: garagem.id, mes, unidadesPrevistas: "10" },
    ]),
  );

  // Comissão em faixas progressivas por VGV acumulado (achado F28) --
  // nenhum outro empreendimento de teste usa esse tipo de incidência.
  const categoriaComissao = await criarCategoriaCusto({ nome: "Comissão progressiva", tipoIncidencia: "faixas_vgv_acumulado" });
  const custoComissao = await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaComissao.id,
    participaFluxoCaixa: true,
  });
  await criarFaixaComissao(custoComissao.id, "2000000", "0.03");
  await criarFaixaComissao(custoComissao.id, null, "0.05");

  const categoriaLegalizacao = await criarCategoriaCusto({ nome: "Legalização", tipoIncidencia: "fixo" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaLegalizacao.id,
    valorPrevisto: "200000",
    competenciaMes: 1,
    participaFluxoCaixa: true,
  });

  // Financiamento Price (parcela total constante) -- diferente do SAC de B
  // e da ausência de financiamento em A.
  await definirFinanciamento({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    valorContratado: "3000000",
    taxaJurosMensal: "0.01",
    mesAmortizacao: 20,
    tipoAmortizacao: "price",
    numeroParcelas: 10,
  });

  return { empreendimentoId: empreendimento.id, cenarioId: cenario.id };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  importarTesteC()
    .then((r) => {
      console.log("Teste C importado:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
