import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o registro de valores realizados (recebimento e custo) e sua
 * agregacao mensal no fluxo de caixa. O motor em si nunca sabe o que foi
 * "realizado" (so conhece "previsto") -- essa e uma camada de leitura por
 * cima, somando RecebimentoProjetado.valorRealizado e Custo.valorRealizado.
 */
describe("API — realizado × projetado", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComVendaECusto() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Realizado" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "300000", prefixoNumero: "ST" } });
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
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const categoriaId = catRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, valorPrevisto: "50000", competenciaMes: 1 } });

    // dispara o motor uma vez para persistir os RecebimentoProjetado
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    return { cenarioId, empreendimentoId };
  }

  it("lista os recebimentos projetados de um cenário", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` });
    expect(res.statusCode).toBe(200);
    const lista = res.json();
    expect(lista).toHaveLength(1);
    expect(lista[0].valorPrevisto).toBe("300000");
    expect(lista[0].status).toBe("previsto");
    expect(lista[0].valorRealizado).toBeNull();
  });

  it("o id de um recebimento não muda quando o fluxo de caixa é recalculado (recomputar não pode invalidar referências da UI)", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const antes = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();

    // recalcula o fluxo de caixa de novo (o que a tela faz toda vez que a pagina carrega)
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    const depois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    expect(depois).toHaveLength(1);
    expect(depois[0].id).toBe(antes[0].id);

    // e o id continua valido para marcar como recebido
    const patch = await app.inject({ method: "PATCH", url: `/api/recebimentos/${antes[0].id}`, payload: { valorRealizado: "300000" } });
    expect(patch.statusCode).toBe(200);
  });

  it("marca um recebimento como realizado e ele aparece agregado no fluxo de caixa", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    const recebimentoId = lista[0].id as string;

    const patch = await app.inject({ method: "PATCH", url: `/api/recebimentos/${recebimentoId}`, payload: { valorRealizado: "300000" } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe("recebido");

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo[0];
    expect(mes1.entradas).toBe("300000.00");
    expect(mes1.entradasRealizadas).toBe("300000.00");
  });

  it("marca um custo fixo como realizado e ele aparece agregado no fluxo de caixa", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const detalheCenario = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` })).json();
    const custoId = detalheCenario.custos[0].id as string;

    const patch = await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorRealizado: "52000" } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe("realizado");

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo[0];
    expect(mes1.saidas).toBe("50000.00"); // previsto continua igual
    expect(mes1.saidasRealizadas).toBe("52000.00"); // realizado pode divergir do previsto
  });

  it("meses sem nada registrado como realizado devolvem null, não zero", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes2 = fluxo.json().fluxo[1];
    expect(mes2.entradasRealizadas).toBeNull();
    expect(mes2.saidasRealizadas).toBeNull();
  });

  it("rejeita marcar como realizado um custo de incidência percentual (sem mês único)", async () => {
    const { cenarioId, empreendimentoId } = await cadastrarCenarioComVendaECusto();
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: catRes.json().id, percentual: "0.05" },
    });
    const res = await app.inject({ method: "PATCH", url: `/api/custos/${custoRes.json().id}`, payload: { valorRealizado: "1000" } });
    expect(res.statusCode).toBe(400);
  });
});
