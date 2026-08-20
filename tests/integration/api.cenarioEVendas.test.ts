import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o restante do ciclo de cadastro pela API — cenario, condicao de
 * pagamento e premissa de velocidade — ate o ponto em que um
 * empreendimento cadastrado do zero (nao importado por script) gera
 * Vendas reais e aparece no fluxo de caixa com numeros nao triviais.
 */
describe("API — cenário, condição de pagamento e geração de vendas", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComEstoque() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Jacaranda Teste" } });
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

    return { empreendimentoId, tipologiaId };
  }

  it("cadastra cenário, condição de pagamento e premissa de velocidade, gera vendas e alimenta o fluxo de caixa", async () => {
    const { empreendimentoId, tipologiaId } = await cadastrarEmpreendimentoComEstoque();

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    expect(cenarioRes.statusCode).toBe(201);
    const cenarioId = cenarioRes.json().id as string;

    const condicaoRes = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "À vista",
        modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }],
      },
    });
    expect(condicaoRes.statusCode).toBe(201);

    const premissaRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "4" }] },
    });
    expect(premissaRes.statusCode).toBe(201);

    const gerarRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    expect(gerarRes.statusCode).toBe(200);
    expect(gerarRes.json().totalVendasCriadas).toBe(4);

    const detalheCenario = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalheCenario.json().totalVendasGeradas).toBe(4);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.statusCode).toBe(200);
    const body = fluxo.json();
    // 4 unidades x R$300.000 à vista no mês 1 = R$1.200.000 de entrada no mês 1
    expect(body.fluxo[0].entradas).toBe("1200000.00");
  });

  it("rejeita condição de pagamento cuja soma de modalidades não fecha em 100%", async () => {
    const { tipologiaId } = await cadastrarEmpreendimentoComEstoque();
    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "Inválida",
        modalidades: [{ nome: "Ato", percentual: "0.5", tipoDistribuicao: "unica_na_venda" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("gerar-vendas sem condição de pagamento cadastrada devolve 400 com a causa", async () => {
    const { empreendimentoId, tipologiaId } = await cadastrarEmpreendimentoComEstoque();
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] },
    });

    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/CondicaoPagamento/);
  });

  it("POST /api/empreendimentos/:id/cenarios rejeita horizonte inválido", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Teste Cenário" } });
    const res = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});
