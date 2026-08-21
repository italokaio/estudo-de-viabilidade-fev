import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o distrato parcial / renegociação de venda (achado F17,
 * docs/DECISOES.md): reduz Venda.valorVenda em vez de cancelar a venda
 * inteira -- a unidade continua vendida. O motor sempre le valorVenda
 * diretamente do banco, entao nenhuma mudanca em src/core/ foi necessaria
 * (mesmo padrao do achado F7).
 */
describe("API — distrato parcial (renegociação de venda)", () => {
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
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Renegociação Teste" } });
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
    const vendaId = unidades[0].venda.id as string;
    return { empreendimentoId, tipologiaId, cenarioId, vendaId };
  }

  it("registra a renegociação: reduz o valor, a unidade continua vendida e a venda continua ativa", async () => {
    const { tipologiaId, vendaId } = await cadastrarVendaAVista();
    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000", motivo: "Comprador em dificuldade" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().valorVendaAnterior).toBe("100000");
    expect(res.json().novoValorVenda).toBe("80000.00");

    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(unidades[0].status).toBe("vendida");
    expect(unidades[0].venda.status).toBe("ativa");
    expect(unidades[0].venda.valorVenda).toBe("80000.00");
    expect(unidades[0].venda.renegociacoes).toHaveLength(1);
    expect(unidades[0].venda.renegociacoes[0].motivo).toBe("Comprador em dificuldade");
  });

  it("o próximo recálculo do fluxo de caixa reflete o novo valor, menor", async () => {
    const { cenarioId, vendaId } = await cadastrarVendaAVista();
    const antes = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(antes.json().fluxo[0].entradas).toBe("100000.00");

    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000" } });

    const depois = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(depois.json().fluxo[0].entradas).toBe("80000.00");
  });

  it("rejeita um novo valor maior ou igual ao valor atual", async () => {
    const { vendaId } = await cadastrarVendaAVista();
    const maior = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "150000" } });
    expect(maior.statusCode).toBe(400);
    const igual = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "100000" } });
    expect(igual.statusCode).toBe(400);
  });

  it("rejeita um novo valor inválido ou não positivo", async () => {
    const { vendaId } = await cadastrarVendaAVista();
    const invalido = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "abc" } });
    expect(invalido.statusCode).toBe(400);
    const zero = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "0" } });
    expect(zero.statusCode).toBe(400);
    const negativo = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "-1000" } });
    expect(negativo.statusCode).toBe(400);
  });

  it("rejeita renegociar uma venda já distratada", async () => {
    const { vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato` });
    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "50000" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejeita um novo valor menor que o já efetivamente recebido — sugere distrato total", async () => {
    const { cenarioId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const recebimentos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    await app.inject({ method: "PATCH", url: `/api/recebimentos/${recebimentos[0].id}`, payload: { valorRealizado: "90000" } });

    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/distrato total/);
  });

  it("valorRealizado de uma parcela já recebida não é afetado pela renegociação", async () => {
    const { cenarioId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const recebimentos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    await app.inject({ method: "PATCH", url: `/api/recebimentos/${recebimentos[0].id}`, payload: { valorRealizado: "100000" } });

    // reduz para exatamente o que ja foi recebido -- permitido, ainda que apertado
    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "100000" } });
    expect(res.statusCode).toBe(400); // igual ao valor atual, rejeitado pela regra "precisa ser MENOR"

    const recebimentosDepois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    expect(recebimentosDepois[0].valorRealizado).toBe("100000");
  });

  it("permite mais de uma renegociação ao longo do tempo, mantendo o histórico", async () => {
    const { tipologiaId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "90000" } });
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000" } });

    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(unidades[0].venda.valorVenda).toBe("80000.00");
    expect(unidades[0].venda.renegociacoes).toHaveLength(2);
    expect(unidades[0].venda.renegociacoes[0].novoValorVenda).toBe("90000.00");
    expect(unidades[0].venda.renegociacoes[1].valorVendaAnterior).toBe("90000.00");
    expect(unidades[0].venda.renegociacoes[1].novoValorVenda).toBe("80000.00");
  });

  it("excluir o cenário não falha quando existe uma venda renegociada (renegociacaoVenda removida antes da venda)", async () => {
    const { empreendimentoId, cenarioId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000" } });

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });
    expect(del.statusCode).toBe(204);
    void empreendimentoId;
  });

  it("excluir o empreendimento não falha quando existe uma venda renegociada", async () => {
    const { empreendimentoId, vendaId } = await cadastrarVendaAVista();
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: { novoValorVenda: "80000" } });

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(del.statusCode).toBe(204);
  });

  it("404 para venda inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/vendas/id-inexistente/renegociacoes", payload: { novoValorVenda: "50000" } });
    expect(res.statusCode).toBe(404);
  });

  it("rejeita ausência de novoValorVenda", async () => {
    const { vendaId } = await cadastrarVendaAVista();
    const res = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar renegociar", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.renegocia@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.renegocia@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Renegociação Sem Vínculo" } });
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

    await criarUsuario({ email: "usuario.renegocia@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.renegocia@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({ method: "POST", url: `/api/vendas/${vendaId}/renegociacoes`, headers: { cookie: cookieUsuario }, payload: { novoValorVenda: "50000" } });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
