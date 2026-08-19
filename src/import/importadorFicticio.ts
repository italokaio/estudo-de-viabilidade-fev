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
  ficticioCenarioBase,
  ficticioCondicoesPagamento,
  ficticioCronogramaExecucaoMensal,
  ficticioCustoObraTotal,
  ficticioEmpreendimento,
  ficticioPercentualComissao,
  ficticioPercentualEncargoSobreRecebido,
  ficticioTerreno,
  ficticioTipologias,
  ficticioUnidadesEmEstoque,
  ficticioVelocidadeVendas,
} from "./ficticio.data.js";

/** Empreendimento fictício de teste — usado apenas para provar isolamento e genericidade em nivel de banco. */
export async function importarFicticio() {
  const empreendimento = await criarEmpreendimento(ficticioEmpreendimento);

  const cenario = await criarCenario({
    empreendimentoId: empreendimento.id,
    tipo: ficticioCenarioBase.tipo,
    nome: ficticioCenarioBase.nome,
    horizonteProjecaoMeses: ficticioCenarioBase.horizonteProjecaoMeses,
  });

  await criarTerreno({ empreendimentoId: empreendimento.id, ...ficticioTerreno });

  const tipologiaIdPorChave = new Map<string, string>();
  for (const t of ficticioTipologias) {
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
      quantidade: ficticioUnidadesEmEstoque[t.chave] ?? 0,
      precoVenda: t.precoUnitarioPadrao,
      areaPrivativa: t.areaPrivativaPadrao,
      prefixoNumero: t.chave,
    });

    const condicao = ficticioCondicoesPagamento[t.chave];
    if (!condicao) throw new Error(`Condicao de pagamento nao definida para a tipologia ${t.chave}`);
    await criarCondicaoPagamento({
      empreendimentoId: empreendimento.id,
      tipologiaId: tipologia.id,
      nome: condicao.nome,
      modalidades: condicao.modalidades,
    });
  }

  await criarPremissaVelocidade(
    ficticioVelocidadeVendas.map((v) => ({
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
    pontos: ficticioCronogramaExecucaoMensal.map((pct, i) => ({ mes: i + 1, percentualExecucaoMensal: pct })),
  });

  const categoriaObra = await criarCategoriaCusto({ nome: "Obra", tipoIncidencia: "pct_execucao" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaObra.id,
    valorPrevisto: ficticioCustoObraTotal,
    participaFluxoCaixa: true,
  });

  const categoriaComissao = await criarCategoriaCusto({ nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" });
  await criarCusto({
    empreendimentoId: empreendimento.id,
    cenarioId: cenario.id,
    categoriaId: categoriaComissao.id,
    percentual: ficticioPercentualComissao,
    participaFluxoCaixa: true,
  });

  if (Number(ficticioPercentualEncargoSobreRecebido) > 0) {
    const categoriaEncargo = await criarCategoriaCusto({ nome: "Encargo sobre recebimento", tipoIncidencia: "pct_recebido_mes_anterior" });
    await criarCusto({
      empreendimentoId: empreendimento.id,
      cenarioId: cenario.id,
      categoriaId: categoriaEncargo.id,
      percentual: ficticioPercentualEncargoSobreRecebido,
      participaFluxoCaixa: true,
    });
  }

  return { empreendimentoId: empreendimento.id, cenarioId: cenario.id };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  importarFicticio()
    .then((r) => {
      console.log("Ficticio importado:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
