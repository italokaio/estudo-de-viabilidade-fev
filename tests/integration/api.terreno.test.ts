import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o cadastro de terreno pela interface — ate aqui so entrava via
 * script de importacao (src/import/). Terreno e 1:1 com empreendimento
 * (Terreno.empreendimentoId @unique), entao a rota e um upsert: a mesma
 * chamada cria na primeira vez e atualiza depois.
 */
describe("API — terreno", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimento() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Terreno Teste" } });
    return emp.json().id as string;
  }

  it("GET /api/empreendimentos/:id devolve terreno=null quando nenhum foi cadastrado", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(res.json().terreno).toBeNull();
  });

  it("POST cadastra o terreno na primeira vez", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const res = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/terreno`,
      payload: { areaValor: "5000", areaStatusValidacao: "validado", formaAquisicao: "compra" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().areaValor).toBe("5000");
    expect(res.json().areaUnidade).toBe("m2");
    expect(res.json().areaStatusValidacao).toBe("validado");

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(detalhe.json().terreno.areaValor).toBe("5000");
    expect(detalhe.json().terreno.formaAquisicao).toBe("compra");
  });

  it("POST de novo atualiza o terreno existente em vez de duplicar", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terreno`, payload: { areaValor: "5000", areaStatusValidacao: "pendente" } });
    const segunda = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/terreno`,
      payload: { areaValor: "5200", areaStatusValidacao: "validado", areaObservacao: "medição atualizada" },
    });
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().areaValor).toBe("5200");
    expect(segunda.json().areaStatusValidacao).toBe("validado");
    expect(segunda.json().areaObservacao).toBe("medição atualizada");

    const total = await prisma.terreno.count({ where: { empreendimentoId } });
    expect(total).toBe(1);
  });

  it("404 para empreendimento inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/empreendimentos/id-inexistente/terreno", payload: { areaValor: "1000" } });
    expect(res.statusCode).toBe(404);
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar cadastrar terreno", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.terreno@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.terreno@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;
    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Terreno Sem Vínculo" } });

    await criarUsuario({ email: "usuario.terreno@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.terreno@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/terreno`,
      headers: { cookie: cookieUsuario },
      payload: { areaValor: "1000" },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
