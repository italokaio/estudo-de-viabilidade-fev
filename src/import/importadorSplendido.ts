import { pathToFileURL } from "node:url";
import {
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCronograma,
  criarCusto,
  criarEmpreendimento,
  criarPremissaVelocidade,
  criarTerreno,
  criarTipologia,
  criarUnidadesEmLote,
} from "../db/cadastro.js";
import { prisma } from "../db/client.js";
import {
  splendidoCenarioBase,
  splendidoCondicoesPagamento,
  splendidoCronogramaExecucaoMensal,
  splendidoCustoObraTotal,
  splendidoCustosForaDoFluxoOriginal,
  splendidoEmpreendimento,
  splendidoPercentualComissao,
  splendidoPercentualEncargoSobreRecebido,
  splendidoTerreno,
  splendidoTipologias,
  splendidoUnidadesEmEstoque,
  splendidoVelocidadeVendas,
} from "./splendido.data.js";

/**
 * Le exclusivamente src/import/splendido.data.ts (premissas ja extraidas da
 * planilha na Fase 1) e popula as tabelas genericas do ERP. Nao abre nem
 * le VIABILIDADE.xlsx em tempo de execucao (principio E).
 *
 * `participaFluxoCaixaExtras` controla os 3 custos que a planilha original
 * nunca somou ao FLUXO CAIXA (terreno/legalização, publicidade) — default
 * false para reproduzir o "modo replicacao" usado na validacao dos golden
 * numbers. Passar true importa o mesmo Splendido em "modo completo".
 */
export async function importarSplendido(opcoes: { participaFluxoCaixaExtras?: boolean } = {}) {
  const participaExtras = opcoes.participaFluxoCaixaExtras ?? false;

  const empreendimento = await criarEmpreendimento(splendidoEmpreendimento);

  const cenario = await criarCenario({
    empreendimentoId: empreendimento.id,
    tipo: splendidoCenarioBase.tipo,
    nome: splendidoCenarioBase.nome,
    horizonteProjecaoMeses: splendidoCenarioBase.horizonteProjecaoMeses,
  });

  await criarTerreno({ empreendimentoId: empreendimento.id, ...splendidoTerreno });

  const tipologiaIdPorChave = new Map<string, string>();
  for (const t of splendidoTipologias) {
    const tipologia = await criarTipologia({
      empreendimentoId: empreendimento.id,
      nome: t.nome,
      areaPrivativaPadrao: t.areaPrivativaPadrao,
      precoUnitarioPadrao: t.precoUnitarioPadrao,
    });
    tipologiaIdPorChave.set(t.chave, tipologia.id);

    await criarUnidadesEmLote({
      empreendimentoId: empreendimento.id,
      tipologiaId: tipologia.id,
      quantidade: splendidoUnidadesEmEstoque[t.chave] ?? 0,
      precoVenda: t.precoUnitarioPadrao,
      areaPrivativa: t.areaPrivativaPadrao,
      prefixoNumero: t.chave,
    });

    const condicao = splendidoCondicoesPagamento[t.chave];
    if (!condicao) throw new Error(`Condicao de pagamento nao definida para a tipologia ${t.chave}`);
    await criarCondicaoPagamento({
      empreendimentoId: empreendimento.id,
      tipologiaId: tipologia.id,
      nome: condicao.nome,
      modalidades: condicao.modalidades,
    });
  }

  await criarPremissaVelocidade(
    splendidoVelocidadeVendas.map((v) => ({
      empreendimentoId: empreendimento.id,
      cenarioId: cenario.id,
      tipologiaId: tipologiaIdPorChave.get(v.tipologia)!,
      mes: v.mes,
      unidadesPrevistas: String(v.unidades),
    })),
  );

  await criarCronograma({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    pontos: splendidoCronogramaExecucaoMensal.map((pct, i) => ({ mes: i + 1, percentualExecucaoMensal: pct })),
  });

  const categoriaObra = await criarCategoriaCusto({ nome: "Obra", tipoIncidencia: "pct_execucao" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaObra.id,
    valorPrevisto: splendidoCustoObraTotal,
    participaFluxoCaixa: true,
  });

  const categoriaComissao = await criarCategoriaCusto({ nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaComissao.id,
    percentual: splendidoPercentualComissao,
    participaFluxoCaixa: true,
  });

  const categoriaEncargo = await criarCategoriaCusto({ nome: "Encargo sobre recebimento (RET)", tipoIncidencia: "pct_recebido_mes_anterior" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaEncargo.id,
    percentual: splendidoPercentualEncargoSobreRecebido,
    participaFluxoCaixa: true,
  });

  const categoriaLegalizacao = await criarCategoriaCusto({ nome: "Escrituração, ITBI e legalização", tipoIncidencia: "fixo" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaLegalizacao.id,
    valorPrevisto: (
      Number(splendidoCustosForaDoFluxoOriginal.escrituracaoEItbi) +
      Number(splendidoCustosForaDoFluxoOriginal.incorporacaoLegalizacaoCondominial)
    ).toFixed(2),
    competenciaMes: 1,
    participaFluxoCaixa: participaExtras,
  });

  const categoriaPublicidade = await criarCategoriaCusto({ nome: "Publicidade", tipoIncidencia: "fixo" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaPublicidade.id,
    valorPrevisto: splendidoCustosForaDoFluxoOriginal.publicidade,
    competenciaMes: 1,
    participaFluxoCaixa: participaExtras,
  });

  return { empreendimentoId: empreendimento.id, cenarioId: cenario.id };
}

// Execucao direta via `npm run import:splendido`
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  importarSplendido()
    .then((r) => {
      console.log("Splendido importado:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
