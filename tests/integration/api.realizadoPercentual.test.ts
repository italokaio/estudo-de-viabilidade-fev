import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o registro de valores realizados para custos de incidência
 * percentual (achado F21, docs/DECISOES.md) — extensão do mecanismo de
 * realizado × projetado (sétima fatia) além dos custos fixos, que só
 * tinham um único mês de competência para marcar. Um custo percentual
 * gera várias parcelas mensais (DesembolsoCusto), recalculadas a cada
 * rodada do motor, cada uma com seu próprio realizado.
 */
describe("API — realizado para custos percentuais", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComComissao() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Realizado Percentual Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "200000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "200000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const catFixa = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Legalização", tipoIncidencia: "fixo" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: catFixa.json().id, valorPrevisto: "10000", competenciaMes: 2 } });

    const catComissao = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" } });
    const custoComissao = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: catComissao.json().id, percentual: "0.05" } });

    // dispara o motor uma vez para persistir os DesembolsoCusto
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    return { cenarioId, empreendimentoId, custoComissaoId: custoComissao.json().id as string };
  }

  it("lista só os desembolsos de custos percentuais, nunca os de custos fixos", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` });
    expect(res.statusCode).toBe(200);
    const lista = res.json();
    expect(lista).toHaveLength(1);
    expect(lista[0].categoriaNome).toBe("Comissão");
    // venda de 200000 no mes 1, comissao 5% -> 10000
    expect(lista[0].valorPrevisto).toBe("10000");
    expect(lista[0].mes).toBe(1);
    expect(lista[0].status).toBe("previsto");
    expect(lista[0].valorRealizado).toBeNull();
  });

  it("marca um desembolso de custo percentual como pago e ele aparece agregado no fluxo de caixa", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    const desembolsoId = lista[0].id as string;

    const patch = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${desembolsoId}`, payload: { valorRealizado: "9800" } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe("realizado");

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo[0];
    expect(mes1.saidas).toBe("10000.00"); // previsto continua igual
    expect(mes1.saidasRealizadas).toBe("9800.00"); // realizado pode divergir do previsto
  });

  it("estorna um desembolso realizado, voltando a status previsto sem valor", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    const desembolsoId = lista[0].id as string;
    await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${desembolsoId}`, payload: { valorRealizado: "9800" } });

    const estorno = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${desembolsoId}`, payload: { estornar: true } });
    expect(estorno.statusCode).toBe(200);
    expect(estorno.json().status).toBe("previsto");
    expect(estorno.json().valorRealizado).toBeNull();

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[0].saidasRealizadas).toBeNull();
  });

  it("o id de um desembolso não muda quando o fluxo de caixa é recalculado (mesmo achado da sétima fatia)", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const antes = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();

    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    const depois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    expect(depois).toHaveLength(1);
    expect(depois[0].id).toBe(antes[0].id);

    const patch = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${antes[0].id}`, payload: { valorRealizado: "10000" } });
    expect(patch.statusCode).toBe(200);
  });

  it("rejeita registrar realizado sem valor", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    const res = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${lista[0].id}`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("404 para desembolso inexistente", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/inexistente`, payload: { valorRealizado: "100" } });
    expect(res.statusCode).toBe(404);
  });

  it("excluir o custo percentual remove seus desembolsos junto (regressão do padrão F10/F11/F13/F17/F21)", async () => {
    const { cenarioId, custoComissaoId } = await cadastrarCenarioComComissao();
    const del = await app.inject({ method: "DELETE", url: `/api/custos/${custoComissaoId}` });
    expect(del.statusCode).toBe(204);

    const lista = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` });
    expect(lista.json()).toHaveLength(0);
  });

  it("excluir um cenário com um desembolso percentual já marcado como pago não falha (regressão de exclusão em cascata)", async () => {
    const { cenarioId } = await cadastrarCenarioComComissao();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${lista[0].id}`, payload: { valorRealizado: "9800" } });

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });
    expect(del.statusCode).toBe(204);
  });

  it("excluir um empreendimento com um desembolso percentual já marcado como pago não falha (regressão de exclusão em cascata)", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComComissao();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${lista[0].id}`, payload: { valorRealizado: "9800" } });

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(del.statusCode).toBe(204);
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao listar desembolsos de custo", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.realizadopct@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.realizadopct@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Realizado Pct Sem Vínculo" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await criarUsuario({ email: "usuario.realizadopct@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.realizadopct@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos`, headers: { cookie: cookieUsuario } });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
