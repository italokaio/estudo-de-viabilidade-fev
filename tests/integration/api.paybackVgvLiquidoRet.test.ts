import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";

describe("Payback descontado, VGV líquido e RET", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let cenarioId: string;
  let tipologiaId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Payback e RET" } });
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
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: await criarCategoria("Terreno", "fixo", "custo"), valorPrevisto: "400000", competenciaMes: 1, recorrencia: "unico" },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function criarCategoria(nome: string, tipoIncidencia: string, papel?: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome, tipoIncidencia, papel },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function fluxo() {
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    return res.json() as {
      fluxo: { mes: number; entradas: string; saidas: string; fluxoMensal: string }[];
      indicadores: { taxaDescontoMensal: string; mesRecuperacao: number | null; mesRecuperacaoDescontado: number | null; vpl: string; tir: string | null; margemLiquida: string | null };
    };
  }

  it("payback descontado bate com a série descontada recalculada fora do motor", async () => {
    const { fluxo: serie, indicadores } = await fluxo();
    const taxa = Number(indicadores.taxaDescontoMensal);
    let acumuladoDescontado = 0;
    const descontadoAcumulado = serie.map((p) => {
      acumuladoDescontado += Number(p.fluxoMensal) / Math.pow(1 + taxa, p.mes);
      return acumuladoDescontado;
    });
    const pico = descontadoAcumulado.reduce((melhor, v, i) => (v < descontadoAcumulado[melhor]! ? i : melhor), 0);
    let recuperadoEm: number | null = null;
    for (let i = pico; i < serie.length; i++) {
      if (descontadoAcumulado.slice(i).every((v) => v >= 0)) {
        recuperadoEm = serie[i]!.mes;
        break;
      }
    }

    expect(indicadores.mesRecuperacaoDescontado).toBe(recuperadoEm);
  });

  it("VGV líquido = VGV bruto − comissões de corretagem − permuta, e mudar o papel de uma categoria não altera fluxo, VPL, TIR nem margem", async () => {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { empreendimentoId, status: "estoque" } });
    await app.inject({ method: "POST", url: `/api/unidades/${unidade.id}/permuta`, payload: { nomeContraparte: "Dono", valorAtribuido: "100000" } });

    const categoriaComissao = await criarCategoria("Comissão de vendas", "fixo", "comissao_corretagem");
    const custo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaComissao, valorPrevisto: "50000", competenciaMes: 2, recorrencia: "unico" },
    });
    expect(custo.statusCode).toBe(201);

    const comComissao = await montarDadosRelatorioViabilidade(cenarioId);
    const fluxoComComissao = await fluxo();
    const vgvBruto = Number(comComissao.resumoExecutivo.vgv);
    expect(Number(comComissao.resumoExecutivo.vgvLiquido)).toBeCloseTo(vgvBruto - 50000 - 100000, 2);

    const patch = await app.inject({ method: "PATCH", url: `/api/categorias-custo/${categoriaComissao}`, payload: { papel: "custo" } });
    expect(patch.statusCode).toBe(200);
    const semPapel = await montarDadosRelatorioViabilidade(cenarioId);
    const fluxoSemPapel = await fluxo();

    expect(fluxoSemPapel.fluxo).toEqual(fluxoComComissao.fluxo);
    expect(fluxoSemPapel.indicadores.vpl).toBe(fluxoComComissao.indicadores.vpl);
    expect(fluxoSemPapel.indicadores.tir).toBe(fluxoComComissao.indicadores.tir);
    expect(fluxoSemPapel.indicadores.margemLiquida).toBe(fluxoComComissao.indicadores.margemLiquida);
    expect(Number(semPapel.resumoExecutivo.vgvLiquido)).toBeCloseTo(vgvBruto - 100000, 2);
  });

  it("RET: cadastrada como tributo, reduz a margem em 4% do recebido de cada mês, sem tocar nas outras premissas", async () => {
    const antes = await fluxo();
    const dadosAntes = await montarDadosRelatorioViabilidade(cenarioId);

    const categoriaRet = await criarCategoria("RET — Regime Especial de Tributação", "pct_recebido_no_mes", "tributo");
    const custo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaRet, percentual: "0.04" },
    });
    expect(custo.statusCode).toBe(201);

    const depois = await fluxo();
    const dadosDepois = await montarDadosRelatorioViabilidade(cenarioId);

    for (let i = 0; i < antes.fluxo.length; i++) {
      const aumentoSaida = Number(depois.fluxo[i]!.saidas) - Number(antes.fluxo[i]!.saidas);
      expect(aumentoSaida).toBeCloseTo(0.04 * Number(antes.fluxo[i]!.entradas), 2);
      expect(depois.fluxo[i]!.entradas).toBe(antes.fluxo[i]!.entradas);
    }
    expect(Number(depois.indicadores.margemLiquida)).toBeLessThan(Number(antes.indicadores.margemLiquida));
    expect(dadosDepois.resumoExecutivo.vgv).toBe(dadosAntes.resumoExecutivo.vgv);
    expect(dadosDepois.resumoExecutivo.vgvLiquido).toBe(dadosAntes.resumoExecutivo.vgvLiquido);

    const linhaRet = dadosDepois.custos.find((c) => c.categoriaNome === "RET — Regime Especial de Tributação");
    expect(linhaRet?.papel).toBe("tributo");
  });
});
