import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa autenticacao, sessao e permissoes pela API. Diferente dos outros
 * arquivos de integracao, este NAO usa buildAuthenticatedApp() — o proprio
 * fluxo de login/permissao e o que esta sendo testado aqui.
 */
describe("API — autenticação e permissões", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("qualquer rota /api/* sem sessão devolve 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/empreendimentos" });
    expect(res.statusCode).toBe(401);
  });

  it("login com credenciais corretas devolve o usuário e um cookie de sessão", async () => {
    await criarUsuario({ email: "ana@local.test", nome: "Ana", senha: "senha123", papel: "admin" });
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@local.test", senha: "senha123" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().nome).toBe("Ana");
    expect(res.json().papel).toBe("admin");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("login com senha errada devolve 401 e nenhum cookie", async () => {
    await criarUsuario({ email: "ana@local.test", nome: "Ana", senha: "senha123", papel: "admin" });
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@local.test", senha: "errada" } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("uma vez logado, o cookie dá acesso às rotas protegidas e GET /api/auth/me devolve o usuário", async () => {
    await criarUsuario({ email: "ana@local.test", nome: "Ana", senha: "senha123", papel: "usuario" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("ana@local.test");

    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.statusCode).toBe(200);
  });

  it("logout encerra a sessão — o mesmo cookie deixa de funcionar", async () => {
    await criarUsuario({ email: "ana@local.test", nome: "Ana", senha: "senha123", papel: "admin" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });

    const res = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });

  it("usuário comum (não-admin) recebe 403 ao tentar excluir", async () => {
    await criarUsuario({ email: "usuario@local.test", nome: "Usuário Comum", senha: "senha123", papel: "usuario" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie }, payload: { nome: "Teste" } });
    expect(criado.statusCode).toBe(201);

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${criado.json().id}`, headers: { cookie } });
    expect(del.statusCode).toBe(403);
  });

  it("admin consegue criar, listar e excluir usuários; usuário comum recebe 403", async () => {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const criado = await app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: { email: "novo@local.test", nome: "Novo Usuário", senha: "senha456" },
    });
    expect(criado.statusCode).toBe(201);
    expect(criado.json().papel).toBe("usuario"); // default

    const lista = await app.inject({ method: "GET", url: "/api/usuarios", headers: { cookie: cookieAdmin } });
    expect(lista.json()).toHaveLength(2);

    // o proprio usuario comum tentando listar usuarios -> 403
    const loginComum = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "novo@local.test", senha: "senha456" } });
    const cookieComum = loginComum.headers["set-cookie"] as string;
    const listaBloqueada = await app.inject({ method: "GET", url: "/api/usuarios", headers: { cookie: cookieComum } });
    expect(listaBloqueada.statusCode).toBe(403);

    const del = await app.inject({ method: "DELETE", url: `/api/usuarios/${criado.json().id}`, headers: { cookie: cookieAdmin } });
    expect(del.statusCode).toBe(204);
  });

  it("admin não consegue excluir a si mesmo", async () => {
    const admin = await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const res = await app.inject({ method: "DELETE", url: `/api/usuarios/${admin.id}`, headers: { cookie } });
    expect(res.statusCode).toBe(400);
  });

  it("rejeita cadastro de usuário com email duplicado", async () => {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const res = await app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie },
      payload: { email: "admin@local.test", nome: "Outro", senha: "senha456" },
    });
    expect(res.statusCode).toBe(400);
  });

  /**
   * Redefinicao de senha assistida por admin (achado F14, docs/DECISOES.md
   * — "seguranca de sessao"): sem infraestrutura de email neste projeto, a
   * recuperacao real e um admin definindo a nova senha diretamente.
   */
  it("admin redefine a senha de um usuário — a senha antiga para de funcionar e a nova passa a funcionar", async () => {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const usuario = await criarUsuario({ email: "usuario@local.test", nome: "Usuário", senha: "senhaAntiga", papel: "usuario" });
    const loginAdmin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/usuarios/${usuario.id}/senha`,
      headers: { cookie: cookieAdmin },
      payload: { senha: "senhaNova123" },
    });
    expect(res.statusCode).toBe(200);

    const loginAntiga = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario@local.test", senha: "senhaAntiga" } });
    expect(loginAntiga.statusCode).toBe(401);

    const loginNova = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario@local.test", senha: "senhaNova123" } });
    expect(loginNova.statusCode).toBe(200);
  });

  it("redefinir a senha encerra as sessões ativas do usuário", async () => {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const usuario = await criarUsuario({ email: "usuario@local.test", nome: "Usuário", senha: "senhaAntiga", papel: "usuario" });
    const loginAdmin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;
    const loginUsuario = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario@local.test", senha: "senhaAntiga" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    await app.inject({ method: "PATCH", url: `/api/usuarios/${usuario.id}/senha`, headers: { cookie: cookieAdmin }, payload: { senha: "senhaNova123" } });

    const res = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieUsuario } });
    expect(res.statusCode).toBe(401);
  });

  it("usuário comum recebe 403 ao tentar redefinir a senha de outro usuário", async () => {
    const admin = await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    await criarUsuario({ email: "usuario@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/usuarios/${admin.id}/senha`,
      headers: { cookie: cookieUsuario },
      payload: { senha: "outraSenha123" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejeita senha nova com menos de 6 caracteres, e 404 para usuário inexistente", async () => {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const usuario = await criarUsuario({ email: "usuario@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const curta = await app.inject({ method: "PATCH", url: `/api/usuarios/${usuario.id}/senha`, headers: { cookie }, payload: { senha: "123" } });
    expect(curta.statusCode).toBe(400);

    const inexistente = await app.inject({ method: "PATCH", url: "/api/usuarios/id-inexistente/senha", headers: { cookie }, payload: { senha: "senhaValida123" } });
    expect(inexistente.statusCode).toBe(404);
  });
});
