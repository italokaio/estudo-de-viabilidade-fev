import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";
import { resumirRecebimentosPorMes } from "../../src/relatorios/resumo.js";

describe("Permuta (non-cash) e distrato com reembolso no fluxo", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let cenarioId: string;
  let tipologiaId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Permuta e distrato" } });
    empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Apto", precoUnitarioPadrao: "300000", areaPrivativaPadrao: "60" },
    });
    tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "AP" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    });
    const cen = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    cenarioId = cen.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function fluxo() {
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    return res.json() as {
      fluxo: { mes: number; entradas: string; saidas: string }[];
      indicadores: { vpl: string; tir: string | null; necessidadeMaximaCapital: string; mesPico: number | null; mesRecuperacao: number | null };
    };
  }

  it("permuta soma ao VGV e ao custo do relatório, mas não muda o fluxo de caixa, VPL, TIR nem necessidade de capital", async () => {
    const antes = await fluxo();
    const dadosAntes = await montarDadosRelatorioViabilidade(cenarioId);
    const unidadeEstoque = await prisma.unidade.findFirstOrThrow({ where: { empreendimentoId, status: "estoque" } });

    const permuta = await app.inject({
      method: "POST",
      url: `/api/unidades/${unidadeEstoque.id}/permuta`,
      payload: { nomeContraparte: "Proprietário do terreno", valorAtribuido: "100000" },
    });
    expect(permuta.statusCode).toBe(201);

    const depois = await fluxo();
    const dadosDepois = await montarDadosRelatorioViabilidade(cenarioId);

    expect(depois.fluxo).toEqual(antes.fluxo);
    expect(depois.indicadores.vpl).toBe(antes.indicadores.vpl);
    expect(depois.indicadores.tir).toBe(antes.indicadores.tir);
    expect(depois.indicadores.necessidadeMaximaCapital).toBe(antes.indicadores.necessidadeMaximaCapital);
    expect(depois.indicadores.mesPico).toBe(antes.indicadores.mesPico);
    expect(depois.indicadores.mesRecuperacao).toBe(antes.indicadores.mesRecuperacao);

    expect(Number(dadosDepois.resumoExecutivo.vgv) - Number(dadosAntes.resumoExecutivo.vgv)).toBeCloseTo(100000, 2);
    expect(dadosDepois.resumoExecutivo.vgvPermutado).toBe("100000.00");
    expect(Number(dadosDepois.resumoExecutivo.totalCustosPrevisto) - Number(dadosAntes.resumoExecutivo.totalCustosPrevisto)).toBeCloseTo(100000, 2);
  });

  it("margem líquida usa o VGV que inclui a permuta", async () => {
    const unidadeEstoque = await prisma.unidade.findFirstOrThrow({ where: { empreendimentoId, status: "estoque" } });
    await app.inject({ method: "POST", url: `/api/unidades/${unidadeEstoque.id}/permuta`, payload: { nomeContraparte: "Dono", valorAtribuido: "100000" } });
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    const margem = Number(dados.resumoExecutivo.margemLiquida);
    expect(margem * Number(dados.resumoExecutivo.vgv)).toBeCloseTo(Number(dados.resumoExecutivo.saldoFinal), 0);
  });

  it("reembolso do distrato sai no mês escolhido e as entradas até o mês anterior permanecem", async () => {
    await fluxo();
    const venda = await prisma.venda.findFirstOrThrow({ where: { cenarioId, status: "ativa" } });
    const recebimentoEntrada = await prisma.recebimentoProjetado.findFirstOrThrow({ where: { vendaId: venda.id, mesCompetencia: 1 } });

    const antes = await fluxo();
    const distrato = await app.inject({
      method: "POST",
      url: `/api/vendas/${venda.id}/distrato`,
      payload: { mesDistrato: 3, percentualRetencao: "0.2" },
    });
    expect(distrato.statusCode).toBe(201);
    const reembolso = Number(distrato.json().valorReembolsar);
    const anteriores = await prisma.recebimentoProjetado.findMany({ where: { vendaId: venda.id, mesCompetencia: { lt: 3 } } });
    const somaPrevista = anteriores.reduce((acc, r) => acc + Number(r.valorPrevisto), 0);
    expect(reembolso).toBeCloseTo(somaPrevista * 0.8, 2);

    const depois = await fluxo();
    const saidaAntes = Number(antes.fluxo[2]!.saidas);
    const saidaDepois = Number(depois.fluxo[2]!.saidas);
    expect(saidaDepois - saidaAntes).toBeCloseTo(reembolso, 2);

    for (let i = 0; i < 2; i++) {
      expect(depois.fluxo[i]!.entradas).toBe(antes.fluxo[i]!.entradas);
    }
    expect(Number(depois.fluxo[3]!.entradas)).toBeLessThan(Number(antes.fluxo[3]!.entradas));

    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    const somaEntradas = depois.fluxo.reduce((acc, p) => acc + Number(p.entradas), 0);
    expect(Number(dados.resumoExecutivo.totalRecebimentosPrevisto)).toBeCloseTo(somaEntradas, 1);
    const somaDetalhe = dados.recebimentos.reduce((acc, r) => acc + Number(r.valorPrevisto), 0);
    expect(somaDetalhe).toBeCloseTo(Number(dados.resumoExecutivo.totalRecebimentosPrevisto), 2);
    const resumoMensal = resumirRecebimentosPorMes(dados.recebimentos, dados.cenario.horizonteProjecaoMeses);
    expect(Number(resumoMensal.total.totalPrevisto)).toBeCloseTo(Number(dados.resumoExecutivo.totalRecebimentosPrevisto), 2);
  });

  it("recusa distrato sem mês ou com mês fora do horizonte", async () => {
    const venda = await prisma.venda.findFirstOrThrow({ where: { cenarioId, status: "ativa" } });
    const semMes = await app.inject({ method: "POST", url: `/api/vendas/${venda.id}/distrato`, payload: {} });
    expect(semMes.statusCode).toBe(400);
    const foraDoHorizonte = await app.inject({ method: "POST", url: `/api/vendas/${venda.id}/distrato`, payload: { mesDistrato: 99 } });
    expect(foraDoHorizonte.statusCode).toBe(400);
  });
});
