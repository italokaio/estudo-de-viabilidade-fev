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

  /**
   * Permuta parcial (achado F24, docs/DECISOES.md — "permuta parcial: dividir
   * uma unidade entre multiplas contrapartes"): cadastro nominal de quem mais
   * divide a mesma permuta, mesmo espirito do split nominal de comissao
   * (achado F13) — puramente informativo, nunca lido pelo motor.
   */
  describe("permuta parcial — split entre múltiplas contrapartes (achado F24)", () => {
    async function cadastrarUnidadePermutada() {
      const { tipologiaId, empreendimentoId } = await cadastrarTipologiaComUnidades(1);
      const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
      const unidadeId = unidades[0].id as string;
      await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "João da Silva" } });
      const listaAtualizada = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
      const permutaId = listaAtualizada.find((u: any) => u.id === unidadeId).permuta.id as string;
      return { empreendimentoId, tipologiaId, unidadeId, permutaId };
    }

    it("cadastra uma contraparte adicional e ela aparece na listagem da unidade", async () => {
      const { tipologiaId, permutaId } = await cadastrarUnidadePermutada();
      const res = await app.inject({
        method: "POST",
        url: `/api/permutas/${permutaId}/contrapartes`,
        payload: { nome: "Maria Sócia", percentualSplit: "0.4" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().nome).toBe("Maria Sócia");

      const lista = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
      const unidade = lista.find((u: any) => u.permuta?.id === permutaId);
      expect(unidade.permuta.contrapartes).toHaveLength(1);
      expect(unidade.permuta.contrapartes[0].percentualSplit).toBe("0.4");
    });

    it("aceita a soma exata de 100% entre contrapartes", async () => {
      const { permutaId } = await cadastrarUnidadePermutada();
      const p1 = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.6" } });
      expect(p1.statusCode).toBe(201);
      const p2 = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "B", percentualSplit: "0.4" } });
      expect(p2.statusCode).toBe(201);
    });

    it("rejeita ultrapassar 100% na soma dos splits", async () => {
      const { permutaId } = await cadastrarUnidadePermutada();
      await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.6" } });
      const excesso = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "B", percentualSplit: "0.5" } });
      expect(excesso.statusCode).toBe(400);
    });

    it("edita o percentual de uma contraparte respeitando o limite contra as demais", async () => {
      const { permutaId } = await cadastrarUnidadePermutada();
      const a = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });
      await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "B", percentualSplit: "0.3" } });

      const excesso = await app.inject({ method: "PATCH", url: `/api/contrapartes-permuta/${a.json().id}`, payload: { percentualSplit: "0.8" } });
      expect(excesso.statusCode).toBe(400);

      const ok = await app.inject({ method: "PATCH", url: `/api/contrapartes-permuta/${a.json().id}`, payload: { percentualSplit: "0.7" } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().percentualSplit).toBe("0.7");
    });

    it("exclui uma contraparte", async () => {
      const { tipologiaId, permutaId } = await cadastrarUnidadePermutada();
      const c = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });

      const del = await app.inject({ method: "DELETE", url: `/api/contrapartes-permuta/${c.json().id}` });
      expect(del.statusCode).toBe(204);

      const lista = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
      const unidade = lista.find((u: any) => u.permuta?.id === permutaId);
      expect(unidade.permuta.contrapartes).toHaveLength(0);
    });

    it("usuário comum recebe 403 ao tentar excluir uma contraparte", async () => {
      const { permutaId } = await cadastrarUnidadePermutada();
      const c = await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });

      const appUsuario = await buildAuthenticatedApp("usuario");
      const res = await appUsuario.inject({ method: "DELETE", url: `/api/contrapartes-permuta/${c.json().id}` });
      expect(res.statusCode).toBe(403);
      await appUsuario.close();
    });

    it("404 para permuta inexistente ao cadastrar contraparte", async () => {
      const res = await app.inject({ method: "POST", url: `/api/permutas/inexistente/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });
      expect(res.statusCode).toBe(404);
    });

    it("desfazer a permuta remove as contrapartes junto (regressão do padrão F10/F11/F13/F17/F21)", async () => {
      const { unidadeId, permutaId } = await cadastrarUnidadePermutada();
      await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });

      const del = await app.inject({ method: "DELETE", url: `/api/unidades/${unidadeId}/permuta` });
      expect(del.statusCode).toBe(204);
    });

    it("excluir um empreendimento com contrapartes de permuta cadastradas não falha (regressão de exclusão em cascata)", async () => {
      const { empreendimentoId, permutaId } = await cadastrarUnidadePermutada();
      await app.inject({ method: "POST", url: `/api/permutas/${permutaId}/contrapartes`, payload: { nome: "A", percentualSplit: "0.5" } });

      const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${empreendimentoId}` });
      expect(del.statusCode).toBe(204);
    });
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
