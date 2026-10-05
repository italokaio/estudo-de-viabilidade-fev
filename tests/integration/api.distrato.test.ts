import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o cancelamento de venda (distrato, achado F7, docs/DECISOES.md):
 * Venda.status='distratada' ja e suficiente para o motor financeiro (ele
 * so busca vendas status="ativa") -- esta fatia registra a acao e o valor
 * retido/a reembolsar sobre o que ja foi efetivamente recebido.
 */
describe("API — distrato", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com 1 unidade vendida a vista no mes 1 (100000), horizonte 3. */
  async function cadastrarVendaAVista() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Distrato Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;
    const vendaId = unidades[0].venda.id as string;
    return { empreendimentoId, tipologiaId, cenarioId, unidadeId, vendaId };
  }

  it("registra distrato sem nada recebido ainda: valor retido e a reembolsar são zero", async () => {
    const { tipologiaId, vendaId } = await cadastrarVendaAVista();
    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().valorRecebidoAteDistrato).toBe("0.00");
    expect(res.json().valorRetido).toBe("0.00");
    expect(res.json().valorReembolsar).toBe("0.00");

    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(unidades[0].status).toBe("estoque");
    expect(unidades[0].venda.status).toBe("distratada");
  });

  it("calcula retenção sobre o previsto das parcelas anteriores ao mês do distrato, sem exigir recebimento marcado", async () => {
    const { cenarioId, vendaId } = await cadastrarVendaAVista();
    // RecebimentoProjetado so e persistido no primeiro recalculo do fluxo (achado F1) -- forca esse recalculo antes de listar.
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const recebimentos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    expect(recebimentos).toHaveLength(1);
    const previsto = Number(recebimentos[0].valorPrevisto);

    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 2, percentualRetencao: "0.2" } });
    expect(res.statusCode).toBe(201);
    expect(Number(res.json().valorRecebidoAteDistrato)).toBeCloseTo(previsto, 2);
    expect(Number(res.json().valorRetido)).toBeCloseTo(previsto * 0.2, 2);
    expect(Number(res.json().valorReembolsar)).toBeCloseTo(previsto * 0.8, 2);
  });

  it("rejeita distrato de venda já distratada", async () => {
    const { vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });
    const segunda = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });
    expect(segunda.statusCode).toBe(400);
  });

  it("404 para venda inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/vendas/id-inexistente/distrato", payload: { mesDistrato: 1 } });
    expect(res.statusCode).toBe(404);
  });

  it("a venda distratada some do fluxo de caixa no próximo recálculo", async () => {
    const { cenarioId, vendaId } = await cadastrarVendaAVista();
    const antes = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(antes.json().fluxo[0].entradas).toBe("100000.00");

    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });

    const depois = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(depois.json().fluxo[0].entradas).toBe("0.00");
  });

  it("desfaz o distrato: venda volta ativa, unidade volta vendida", async () => {
    const { tipologiaId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });

    const del = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}/distrato` });
    expect(del.statusCode).toBe(204);

    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(unidades[0].status).toBe("vendida");
    expect(unidades[0].venda.status).toBe("ativa");
  });

  it("bloqueia desfazer distrato se a unidade já foi revendida", async () => {
    const { tipologiaId, cenarioId, unidadeId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });

    // revende a mesma unidade (agora em estoque) gerando uma nova venda
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 2, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    const unidadesDepois = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(unidadesDepois.find((u: any) => u.id === unidadeId).status).toBe("vendida");

    const del = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}/distrato` });
    expect(del.statusCode).toBe(400);
  });

  it("usuário comum recebe 403 ao tentar desfazer um distrato", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Distrato Perm" } });
    const tip = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    await appAdmin.inject({ method: "POST", url: `/api/tipologias/${tip.json().id}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const cenarioRes = await appAdmin.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    await appAdmin.inject({
      method: "POST",
      url: `/api/tipologias/${tip.json().id}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/premissas-velocidade`, payload: { itens: [{ tipologiaId: tip.json().id, mes: 1, unidadesPrevistas: "1" }] } });
    await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/gerar-vendas` });
    const unidades = (await appAdmin.inject({ method: "GET", url: `/api/tipologias/${tip.json().id}/unidades` })).json();
    const vendaId = unidades[0].venda.id as string;
    await appAdmin.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 1 } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/vendas/${vendaId}/distrato` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar registrar distrato", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.distrato@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.distrato@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Distrato Sem Vínculo" } });
    const tip = await rawApp.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/tipologias`, headers: { cookie: cookieAdmin }, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    await rawApp.inject({ method: "POST", url: `/api/tipologias/${tip.json().id}/unidades`, headers: { cookie: cookieAdmin }, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    await rawApp.inject({
      method: "POST",
      url: `/api/tipologias/${tip.json().id}/condicoes-pagamento`,
      headers: { cookie: cookieAdmin },
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await rawApp.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/premissas-velocidade`, headers: { cookie: cookieAdmin }, payload: { itens: [{ tipologiaId: tip.json().id, mes: 1, unidadesPrevistas: "1" }] } });
    await rawApp.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/gerar-vendas`, headers: { cookie: cookieAdmin } });
    const unidades = (await rawApp.inject({ method: "GET", url: `/api/tipologias/${tip.json().id}/unidades`, headers: { cookie: cookieAdmin } })).json();
    const vendaId = unidades[0].venda.id as string;

    await criarUsuario({ email: "usuario.distrato@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.distrato@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, headers: { cookie: cookieUsuario }, payload: { mesDistrato: 1 } });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
