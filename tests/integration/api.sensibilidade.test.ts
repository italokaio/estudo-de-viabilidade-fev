import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a simulacao de sensibilidade pela API: reroda o motor (sem
 * nenhuma mudanca em src/core/motorRecebimentos.ts, motorCustos.ts ou
 * motorFluxoCaixa.ts) com uma premissa perturbada, para cada variacao
 * pedida. Nunca persiste nada -- ao contrario de /fluxo-caixa, que roda
 * o motor E grava RecebimentoProjetado, esta rota so le.
 */
describe("API — sensibilidade", () => {
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
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Sensibilidade Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "50000", competenciaMes: 1 } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    return { cenarioId };
  }

  it("eixo custo com variações padrão (5 pontos), variação 0 no meio", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/sensibilidade?eixo=custo` });
    expect(res.statusCode).toBe(200);
    const pontos = res.json();
    expect(pontos).toHaveLength(5);
    expect(pontos.map((p: any) => p.variacao)).toEqual(["-0.2", "-0.1", "0", "0.1", "0.2"]);
  });

  it("eixo vgv: aumentar o preço de venda aumenta o VPL", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/sensibilidade?eixo=vgv&variacoes=-0.1,0,0.1` });
    const pontos = res.json();
    const vplNeg = Number(pontos[0].vpl);
    const vplBase = Number(pontos[1].vpl);
    const vplPos = Number(pontos[2].vpl);
    expect(vplNeg).toBeLessThan(vplBase);
    expect(vplBase).toBeLessThan(vplPos);
  });

  it("eixo velocidadeVendas com variações customizadas", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/sensibilidade?eixo=velocidadeVendas&variacoes=0,3` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it("rejeita eixo inválido", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/sensibilidade?eixo=inexistente` });
    expect(res.statusCode).toBe(400);
  });

  it("não persiste nenhum RecebimentoProjetado (diferente de /fluxo-caixa)", async () => {
    const { cenarioId } = await cadastrarCenarioComVendaECusto();
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/sensibilidade?eixo=custo` });
    const recebimentos = await prisma.recebimentoProjetado.count({ where: { venda: { cenarioId } } });
    expect(recebimentos).toBe(0);
  });

  it("404 para cenário inexistente", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cenarios/id-inexistente/sensibilidade" });
    expect(res.statusCode).toBe(404);
  });

  it("usuário sem vínculo ao empreendimento recebe 404", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.sens@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.sens@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;
    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Sensibilidade Sem Vínculo" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });

    await criarUsuario({ email: "usuario.sens@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.sens@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({
      method: "GET",
      url: `/api/cenarios/${cenarioRes.json().id}/sensibilidade`,
      headers: { cookie: cookieUsuario },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
