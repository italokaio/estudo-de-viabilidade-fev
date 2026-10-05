import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — editar nome e papel de usuário", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appPlain: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    appPlain = await buildApp();
    adminId = (await prisma.usuario.findFirstOrThrow({ where: { papel: "admin" } })).id;
  });

  afterAll(async () => {
    await appPlain.close();
    await app.close();
    await prisma.$disconnect();
  });

  async function criarUsuario(papel: "usuario" | "stakeholder" | "admin", email: string) {
    const res = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Original", senha: "senha-usuario-123", papel } });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it("admin edita nome e papel; o e-mail não muda", async () => {
    const id = await criarUsuario("usuario", "editar@teste.local");
    const res = await app.inject({ method: "PATCH", url: `/api/usuarios/${id}`, payload: { nome: "Novo nome", papel: "admin", email: "outro@teste.local" } });
    expect(res.statusCode).toBe(200);
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    expect(depois.nome).toBe("Novo nome");
    expect(depois.papel).toBe("admin");
    expect(depois.email).toBe("editar@teste.local");
  });

  it("valida papel desconhecido e nome vazio", async () => {
    const id = await criarUsuario("usuario", "valida@teste.local");
    expect((await app.inject({ method: "PATCH", url: `/api/usuarios/${id}`, payload: { papel: "dono" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/usuarios/${id}`, payload: { nome: "   " } })).statusCode).toBe(400);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id } })).papel).toBe("usuario");
  });

  it("não rebaixa o último administrador, mas rebaixa quando há outro admin", async () => {
    const bloqueado = await app.inject({ method: "PATCH", url: `/api/usuarios/${adminId}`, payload: { papel: "usuario" } });
    expect(bloqueado.statusCode).toBe(400);
    expect(bloqueado.json().erro).toMatch(/último administrador/);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: adminId } })).papel).toBe("admin");

    const outroAdmin = await criarUsuario("admin", "segundo-admin@teste.local");
    const permitido = await app.inject({ method: "PATCH", url: `/api/usuarios/${adminId}`, payload: { papel: "usuario" } });
    expect(permitido.statusCode).toBe(200);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: outroAdmin } })).papel).toBe("admin");
  });

  it("bloqueia tornar stakeholder quem tem vínculo de edição, com mensagem que pede a troca do vínculo antes", async () => {
    const id = await criarUsuario("usuario", "vinculo-edicao@teste.local");
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vínculo" } });
    await app.inject({ method: "POST", url: `/api/usuarios/${id}/empreendimentos`, payload: { empreendimentoIds: [emp.json().id], papel: "edicao" } });
    const res = await app.inject({ method: "PATCH", url: `/api/usuarios/${id}`, payload: { papel: "stakeholder" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/vínculo de edição em 1 empreendimento/);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id } })).papel).toBe("usuario");

    await app.inject({ method: "POST", url: `/api/usuarios/${id}/empreendimentos`, payload: { empreendimentoIds: [emp.json().id], papel: "leitura" } });
    const depois = await app.inject({ method: "PATCH", url: `/api/usuarios/${id}`, payload: { papel: "stakeholder" } });
    expect(depois.statusCode).toBe(200);
  });

  it("usuário sem papel de admin recebe 403", async () => {
    const alvo = await criarUsuario("stakeholder", "alvo@teste.local");
    const email = "nao-admin@teste.local";
    const criado = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Comum", senha: "senha-comum-123", papel: "usuario" } });
    const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha: "senha-comum-123" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    expect(criado.statusCode).toBe(201);
    const res = await appPlain.inject({ method: "PATCH", url: `/api/usuarios/${alvo}`, headers: { cookie }, payload: { nome: "Não pode" } });
    expect(res.statusCode).toBe(403);
  });

  it("o rebaixamento vale na requisição seguinte: sessão antiga de admin rebaixado perde o poder", async () => {
    const segundoAdmin = await criarUsuario("admin", "segundo-sessao@teste.local");
    const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email: "segundo-sessao@teste.local", senha: "senha-usuario-123" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    expect((await appPlain.inject({ method: "GET", url: "/api/usuarios", headers: { cookie } })).statusCode).toBe(200);

    await app.inject({ method: "PATCH", url: `/api/usuarios/${segundoAdmin}`, payload: { papel: "usuario" } });
    expect((await appPlain.inject({ method: "GET", url: "/api/usuarios", headers: { cookie } })).statusCode).toBe(403);
  });
});
