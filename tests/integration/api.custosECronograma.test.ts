import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa custos e cronograma fisico-financeiro pela API — a ultima peca
 * que faltava para um empreendimento cadastrado do zero pela interface
 * (sem script de importacao) ter uma "necessidade maxima de capital"
 * diferente de zero no fluxo de caixa.
 */
describe("API — categorias de custo, custos e cronograma", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComVendas() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Custo Teste" } });
    const empreendimentoId = emp.json().id as string;

    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "ST" },
    });

    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "4" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { empreendimentoId, cenarioId, tipologiaId };
  }

  it("cadastra categoria de custo fixo, o custo, e ele aparece no fluxo de caixa", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();

    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    expect(catRes.statusCode).toBe(201);
    const categoriaId = catRes.json().id as string;

    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId, valorPrevisto: "500000", competenciaMes: 1, recorrencia: "unico" },
    });
    expect(custoRes.statusCode).toBe(201);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const body = fluxo.json();
    expect(body.fluxo[0].saidas).toBe("500000.00");
    // entrada 1.200.000 - saida 500.000 = 700.000 acumulado, nunca negativo -> necessidade maxima 0
    expect(body.indicadores.necessidadeMaximaCapital).toBe("0.00");
  });

  it("custo percentual (pct_vgv_vendido_no_mes) não exige valorPrevisto, só percentual", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const categoriaId = catRes.json().id as string;

    const semPercentual = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId },
    });
    expect(semPercentual.statusCode).toBe(400);

    const comPercentual = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId, percentual: "0.05" },
    });
    expect(comPercentual.statusCode).toBe(201);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    // 5% de 1.200.000 vendido no mes 1 = 60.000
    expect(fluxo.json().fluxo[0].saidas).toBe("60000.00");
  });

  it("cadastra cronograma físico-financeiro válido e rejeita um segundo cronograma para o mesmo cenário", async () => {
    const { cenarioId } = await cadastrarCenarioComVendas();

    const ok = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: {
        pontos: [
          { mes: 1, percentualExecucaoMensal: "0.5" },
          { mes: 2, percentualExecucaoMensal: "0.5" },
        ],
      },
    });
    expect(ok.statusCode).toBe(201);

    const duplicado = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 3, percentualExecucaoMensal: "1" }] },
    });
    expect(duplicado.statusCode).toBe(400);
  });

  it("rejeita cronograma cuja soma não fecha em 100%", async () => {
    const { cenarioId } = await cadastrarCenarioComVendas();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "0.5" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("custo pct_execucao distribui pelo cronograma cadastrado", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: {
        pontos: [
          { mes: 1, percentualExecucaoMensal: "0.4" },
          { mes: 2, percentualExecucaoMensal: "0.6" },
        ],
      },
    });

    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Obra", tipoIncidencia: "pct_execucao" },
    });
    const categoriaId = catRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId, valorPrevisto: "1000000" },
    });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const body = fluxo.json();
    expect(body.fluxo[0].saidas).toBe("400000.00");
    expect(body.fluxo[1].saidas).toBe("600000.00");
  });
});
