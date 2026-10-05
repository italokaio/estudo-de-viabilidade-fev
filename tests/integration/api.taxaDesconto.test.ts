import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioComparativo, montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";

describe("Taxa de desconto (TMA) por cenário", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Taxa" } });
    empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Apto", precoUnitarioPadrao: "300000", areaPrivativaPadrao: "60" },
    });
    const tipologiaId = tip.json().id as string;
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
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: await criarCategoria(), valorPrevisto: "100000", competenciaMes: 1 } });
  });

  async function criarCategoria(): Promise<string> {
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    return cat.json().id as string;
  }

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("a taxa padrão é 0,5% a.m. e a configurada no cenário muda o VPL", async () => {
    const padrao = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(padrao.json().indicadores.taxaDescontoMensal).toBe("0.005");

    const patch = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { taxaDescontoMensal: "0.01" } });
    expect(patch.statusCode).toBe(200);

    const configurado = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(configurado.json().indicadores.taxaDescontoMensal).toBe("0.01");
    expect(configurado.json().indicadores.vpl).not.toBe(padrao.json().indicadores.vpl);
  });

  it("VPL e TIR são idênticos no relatório de viabilidade e no comparativo do mesmo cenário", async () => {
    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { taxaDescontoMensal: "0.008" } });
    const via = await montarDadosRelatorioViabilidade(cenarioId);
    const comp = await montarDadosRelatorioComparativo(empreendimentoId, [cenarioId]);
    expect(comp.cenarios[0]!.indicadores.vpl).toBe(via.resumoExecutivo.vpl);
    expect(comp.cenarios[0]!.indicadores.tir).toBe(via.resumoExecutivo.tir);
    expect(comp.cenarios[0]!.indicadores.taxaDescontoMensal).toBe("0.008");
    expect(via.resumoExecutivo.taxaDescontoMensal).toBe("0.008");
  });

  it("recusa taxa com vírgula e volta ao padrão quando recebe null", async () => {
    const invalida = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { taxaDescontoMensal: "0,8" } });
    expect(invalida.statusCode).toBe(400);
    expect(invalida.json().erro).toContain("ponto decimal");

    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { taxaDescontoMensal: "0.01" } });
    const volta = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { taxaDescontoMensal: null } });
    expect(volta.statusCode).toBe(200);
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().indicadores.taxaDescontoMensal).toBe("0.005");
  });
});
