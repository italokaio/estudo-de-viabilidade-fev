import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o cadastro de terreno pela interface. Estendido (achado F26,
 * docs/DECISOES.md — "múltiplas matrículas/áreas por empreendimento") de
 * 1:1 (upsert) para 1:N: um empreendimento pode ter mais de uma matrícula,
 * cada uma com seu próprio POST/PATCH/DELETE por id.
 */
describe("API — terreno (múltiplas matrículas, achado F26)", () => {
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

  it("GET /api/empreendimentos/:id devolve terrenos=[] quando nenhum foi cadastrado", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(res.json().terrenos).toEqual([]);
  });

  it("POST cadastra uma matrícula", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const res = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/terrenos`,
      payload: { numeroMatricula: "12.345", areaValor: "5000", areaStatusValidacao: "validado", formaAquisicao: "compra" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().areaValor).toBe("5000");
    expect(res.json().numeroMatricula).toBe("12.345");
    expect(res.json().areaUnidade).toBe("m2");
    expect(res.json().areaStatusValidacao).toBe("validado");

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(detalhe.json().terrenos).toHaveLength(1);
    expect(detalhe.json().terrenos[0].formaAquisicao).toBe("compra");
  });

  it("POST de novo cadastra uma segunda matrícula, sem substituir a primeira", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "111", areaValor: "3000" } });
    await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "222", areaValor: "2000" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const terrenos = detalhe.json().terrenos;
    expect(terrenos).toHaveLength(2);
    expect(terrenos.map((t: any) => t.numeroMatricula).sort()).toEqual(["111", "222"]);

    const total = await prisma.terreno.count({ where: { empreendimentoId } });
    expect(total).toBe(2);
  });

  it("PATCH edita uma matrícula específica pelo próprio id, sem afetar as outras", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const a = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "111", areaValor: "3000" } });
    await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "222", areaValor: "2000" } });

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/terrenos/${a.json().id}`,
      payload: { areaValor: "3200", areaStatusValidacao: "validado", areaObservacao: "medição atualizada" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().areaValor).toBe("3200");
    expect(patch.json().areaStatusValidacao).toBe("validado");
    expect(patch.json().areaObservacao).toBe("medição atualizada");

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const terrenos = detalhe.json().terrenos;
    expect(terrenos.find((t: any) => t.numeroMatricula === "111").areaValor).toBe("3200");
    expect(terrenos.find((t: any) => t.numeroMatricula === "222").areaValor).toBe("2000");
  });

  it("DELETE remove só a matrícula indicada", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const a = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "111", areaValor: "3000" } });
    await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { numeroMatricula: "222", areaValor: "2000" } });

    const del = await app.inject({ method: "DELETE", url: `/api/terrenos/${a.json().id}` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const terrenos = detalhe.json().terrenos;
    expect(terrenos).toHaveLength(1);
    expect(terrenos[0].numeroMatricula).toBe("222");
  });

  it("404 para empreendimento inexistente ao cadastrar", async () => {
    const res = await app.inject({ method: "POST", url: "/api/empreendimentos/id-inexistente/terrenos", payload: { areaValor: "1000" } });
    expect(res.statusCode).toBe(404);
  });

  it("404 para matrícula inexistente ao editar ou excluir", async () => {
    const patch = await app.inject({ method: "PATCH", url: "/api/terrenos/inexistente", payload: { areaValor: "1000" } });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({ method: "DELETE", url: "/api/terrenos/inexistente" });
    expect(del.statusCode).toBe(404);
  });

  it("usuário comum recebe 403 ao tentar excluir uma matrícula", async () => {
    const empreendimentoId = await cadastrarEmpreendimento();
    const a = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/terrenos`, payload: { areaValor: "1000" } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/terrenos/${a.json().id}` });
    expect(res.statusCode).toBe(403);
    await appUsuario.close();
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
      url: `/api/empreendimentos/${emp.json().id}/terrenos`,
      headers: { cookie: cookieUsuario },
      payload: { areaValor: "1000" },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });
});
