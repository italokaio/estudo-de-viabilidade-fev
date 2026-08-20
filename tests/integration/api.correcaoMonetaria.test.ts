import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o indice de correcao monetaria (achado F6, docs/DECISOES.md): uma
 * serie de variacao mensal cadastrada por cenario, aplicada por cima do
 * valor nominal ja calculado pelo motor de recebimentos -- sem indice
 * cadastrado, o comportamento e identico ao motor antes desta fatia.
 */
describe("API — índice de correção monetária", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com 1 unidade vendida no mês 1, recebimento único ("chaves") no mês 3 — janela de 2 meses para correção. */
  async function cadastrarCenarioComRecebimentoNoMes3() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Teste" } });
    const empreendimentoId = emp.json().id as string;

    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "100000" },
    });
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
      payload: { nome: "Chaves", modalidades: [{ nome: "Chaves", percentual: "1", tipoDistribuicao: "mes_fixo", mesFixo: 3 }] },
    });

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { empreendimentoId, cenarioId };
  }

  it("sem índice cadastrado, entradasCorrigidas é idêntico a entradas", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    expect(mes3.entradas).toBe("100000.00");
    expect(mes3.entradasCorrigidas).toBe("100000.00");
  });

  it("POST /api/cenarios/:id/indices-correcao rejeita mês e percentual inválidos", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    const semMes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { percentual: "0.01" } });
    expect(semMes.statusCode).toBe(400);
    const semPercentual = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2 } });
    expect(semPercentual.statusCode).toBe(400);
    const percentualInvalido = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "abc" } });
    expect(percentualInvalido.statusCode).toBe(400);
  });

  it("cadastra a série de índice e o fluxo de caixa aplica a correção composta corretamente", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();

    const p1 = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.10" } });
    expect(p1.statusCode).toBe(201);
    const p2 = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.10" } });
    expect(p2.statusCode).toBe(201);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([
      { mes: 2, percentual: "0.10" },
      { mes: 3, percentual: "0.10" },
    ]);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    // venda no mes 1, recebimento no mes 3: fator = 1.10 * 1.10 = 1.21
    expect(mes3.entradas).toBe("100000.00");
    expect(mes3.entradasCorrigidas).toBe("121000.00");
  });

  it("reenviar o mesmo mês faz upsert (substitui o percentual, não duplica)", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.10" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.05" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([{ mes: 2, percentual: "0.05" }]);
  });

  it("aceita percentual negativo (deflação)", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "-0.10" } });
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[2].entradasCorrigidas).toBe("90000.00");
  });

  it("DELETE remove o ponto e o mês volta a não corrigir", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.20" } });

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/3` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([]);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[2].entradasCorrigidas).toBe("100000.00");
  });

  it("usuário comum recebe 403 ao tentar excluir um ponto de índice", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Perm" } });
    const cenarioRes = await appAdmin.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.05" } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/2` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar cadastrar índice", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.correcao@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.correcao@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Correção Sem Vínculo" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await criarUsuario({ email: "usuario.correcao@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.correcao@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/indices-correcao`,
      headers: { cookie: cookieUsuario },
      payload: { mes: 2, percentual: "0.05" },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
