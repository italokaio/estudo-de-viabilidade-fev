import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa as rotas de cadastro (empreendimento/tipologia/unidade) via
 * app.inject() — mesma abordagem do api.smoke.test.ts. Estas rotas sao
 * a unica forma de os dados entrarem no sistema pela interface, em vez
 * de por script de importacao (ver src/import/).
 */
describe("API — cadastro (empreendimento/tipologia/unidade)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("POST /api/empreendimentos cria um empreendimento novo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/empreendimentos",
      payload: { nome: "Vila Jacaranda", incorporador: "Construtora Teste", endereco: "Rua das Flores, 100" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.nome).toBe("Vila Jacaranda");
    expect(body.id).toBeDefined();
  });

  it("POST /api/empreendimentos rejeita nome vazio", async () => {
    const res = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "  " } });
    expect(res.statusCode).toBe(400);
  });

  it("cadastra empreendimento, tipologia e unidades em lote de ponta a ponta", async () => {
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Recanto Teste" } });
    const empreendimentoId = criado.json().id as string;

    const tipologiaRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio Compacto", areaPrivativaPadrao: "28.5", precoUnitarioPadrao: "310000" },
    });
    expect(tipologiaRes.statusCode).toBe(201);
    const tipologiaId = tipologiaRes.json().id as string;

    const unidadesRes = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: 12, precoVenda: "310000", areaPrivativa: "28.5", prefixoNumero: "ST" },
    });
    expect(unidadesRes.statusCode).toBe(201);
    expect(unidadesRes.json()).toHaveLength(12);

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(detalhe.statusCode).toBe(200);
    const body = detalhe.json();
    expect(body.tipologias).toHaveLength(1);
    expect(body.tipologias[0].quantidadeUnidades).toBe(12);
  });

  it("POST /api/tipologias/:id/unidades com quantidade inválida devolve 400", async () => {
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Recanto Teste 2" } });
    const empreendimentoId = criado.json().id as string;
    const tipologiaRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio" },
    });
    const tipologiaId = tipologiaRes.json().id as string;

    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: 0, precoVenda: "100000", prefixoNumero: "ST" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/empreendimentos/:id com id inexistente devolve 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/empreendimentos/nao-existe" });
    expect(res.statusCode).toBe(404);
  });
});
