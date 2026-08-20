import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o cadastro nominal de permuta pela API (achado F3, docs/DECISOES.md):
 * Unidade.status='permutada' ja bastava para o motor financeiro (exclui do
 * estoque disponivel e do VGV); esta fatia registra quem recebeu o que.
 */
describe("API — permuta nominal", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarTipologiaComUnidades(quantidade = 3) {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Permuta Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade, precoVenda: "300000", prefixoNumero: "ST" } });
    return { empreendimentoId, tipologiaId };
  }

  it("lista as unidades individuais de uma tipologia", async () => {
    const { tipologiaId } = await cadastrarTipologiaComUnidades(2);
    const res = await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` });
    expect(res.statusCode).toBe(200);
    const lista = res.json();
    expect(lista).toHaveLength(2);
    expect(lista[0].status).toBe("estoque");
    expect(lista[0].permuta).toBeNull();
  });

  it("registra uma permuta, marca a unidade como permutada, e ela some do estoque disponível", async () => {
    const { tipologiaId } = await cadastrarTipologiaComUnidades(3);
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;

    const res = await app.inject({
      method: "POST",
      url: `/api/unidades/${unidadeId}/permuta`,
      payload: { nomeContraparte: "João da Silva", documento: "123.456.789-00", valorAtribuido: "310000" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().nomeContraparte).toBe("João da Silva");

    const listaDepois = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const permutada = listaDepois.find((u: any) => u.id === unidadeId);
    expect(permutada.status).toBe("permutada");
    expect(permutada.permuta.nomeContraparte).toBe("João da Silva");
  });

  it("rejeita permuta sem nome da contraparte", async () => {
    const { tipologiaId } = await cadastrarTipologiaComUnidades(1);
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const res = await app.inject({ method: "POST", url: `/api/unidades/${unidades[0].id}/permuta`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("rejeita permuta de unidade que já não está em estoque (ex.: já permutada)", async () => {
    const { tipologiaId } = await cadastrarTipologiaComUnidades(1);
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;
    await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "Maria" } });

    const segunda = await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "Outra pessoa" } });
    expect(segunda.statusCode).toBe(400);
  });

  it("desfaz uma permuta e devolve a unidade ao estoque", async () => {
    const { tipologiaId } = await cadastrarTipologiaComUnidades(1);
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;
    await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "João" } });

    const del = await app.inject({ method: "DELETE", url: `/api/unidades/${unidadeId}/permuta` });
    expect(del.statusCode).toBe(204);

    const listaDepois = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidade = listaDepois.find((u: any) => u.id === unidadeId);
    expect(unidade.status).toBe("estoque");
    expect(unidade.permuta).toBeNull();
  });

  it("uma unidade permutada não é elegível para geração de vendas (permanece excluída do VGV)", async () => {
    const { tipologiaId, empreendimentoId } = await cadastrarTipologiaComUnidades(2);
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    await app.inject({ method: "POST", url: `/api/unidades/${unidades[0].id}/permuta`, payload: { nomeContraparte: "João" } });

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
    // pede as 2 unidades, mas só 1 está em estoque (a outra foi permutada)
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    expect(gerar.statusCode).toBe(400);
    expect(gerar.json().erro).toMatch(/estoque/);
  });
});
