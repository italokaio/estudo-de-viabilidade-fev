import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o controle de acesso por empreendimento (achado F5, docs/DECISOES.md):
 * um usuario "usuario" so ve/acessa empreendimentos vinculados via
 * EmpreendimentoUsuario; admin sempre tem acesso total. Nao usa
 * buildAuthenticatedApp() pois o proprio fluxo de permissao e o testado aqui.
 */
describe("API — permissão por empreendimento", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function login(email: string, senha: string) {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha } });
    return res.headers["set-cookie"] as string;
  }

  async function criarAdminLogado() {
    await criarUsuario({ email: "admin@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    return login("admin@local.test", "senha123");
  }

  async function criarUsuarioComumLogado() {
    await criarUsuario({ email: "usuario@local.test", nome: "Usuário Comum", senha: "senha123", papel: "usuario" });
    return login("usuario@local.test", "senha123");
  }

  it("usuário comum sem vínculo não vê nenhum empreendimento em GET /api/empreendimentos", async () => {
    const cookieAdmin = await criarAdminLogado();
    await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });

    const cookieComum = await criarUsuarioComumLogado();
    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieComum } });
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toHaveLength(0);
  });

  it("usuário comum sem vínculo recebe 404 ao acessar diretamente um empreendimento existente", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;

    const cookieComum = await criarUsuarioComumLogado();
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieComum } });
    expect(res.statusCode).toBe(404);
  });

  it("após vínculo pelo admin, usuário comum passa a ver e acessar o empreendimento", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;

    const usuarioComum = await criarUsuario({ email: "usuario@local.test", nome: "Usuário Comum", senha: "senha123", papel: "usuario" });
    const cookieComum = await login("usuario@local.test", "senha123");

    const semAcesso = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieComum } });
    expect(semAcesso.statusCode).toBe(404);

    const vincular = await app.inject({
      method: "POST",
      url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
      headers: { cookie: cookieAdmin },
      payload: { empreendimentoId },
    });
    expect(vincular.statusCode).toBe(201);
    expect(vincular.json()).toHaveLength(1);

    const comAcesso = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieComum } });
    expect(comAcesso.statusCode).toBe(200);

    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieComum } });
    expect(lista.json()).toHaveLength(1);
  });

  it("admin sempre acessa qualquer empreendimento, independente de vínculo", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;

    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieAdmin } });
    expect(res.statusCode).toBe(200);

    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieAdmin } });
    expect(lista.json()).toHaveLength(1);
  });

  it("empreendimento criado por usuário comum é vinculado automaticamente a ele", async () => {
    const cookieComum = await criarUsuarioComumLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieComum }, payload: { nome: "Meu Empreendimento" } });
    expect(criado.statusCode).toBe(201);

    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieComum } });
    expect(lista.json()).toHaveLength(1);
    expect(lista.json()[0].nome).toBe("Meu Empreendimento");
  });

  it("usuário comum não consegue gerenciar vínculos de acesso de outros usuários (403)", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;

    const outroUsuario = await criarUsuario({ email: "outro@local.test", nome: "Outro", senha: "senha123", papel: "usuario" });
    const cookieComum = await criarUsuarioComumLogado();

    const tentativa = await app.inject({
      method: "POST",
      url: `/api/usuarios/${outroUsuario.id}/empreendimentos`,
      headers: { cookie: cookieComum },
      payload: { empreendimentoId },
    });
    expect(tentativa.statusCode).toBe(403);

    const tentativaListar = await app.inject({
      method: "GET",
      url: `/api/usuarios/${outroUsuario.id}/empreendimentos`,
      headers: { cookie: cookieComum },
    });
    expect(tentativaListar.statusCode).toBe(403);
  });

  it("admin remove vínculo e o usuário comum perde o acesso", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;

    const usuarioComum = await criarUsuario({ email: "usuario@local.test", nome: "Usuário Comum", senha: "senha123", papel: "usuario" });
    const cookieComum = await login("usuario@local.test", "senha123");

    await app.inject({
      method: "POST",
      url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
      headers: { cookie: cookieAdmin },
      payload: { empreendimentoId },
    });

    const comAcesso = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieComum } });
    expect(comAcesso.statusCode).toBe(200);

    const remover = await app.inject({
      method: "DELETE",
      url: `/api/usuarios/${usuarioComum.id}/empreendimentos/${empreendimentoId}`,
      headers: { cookie: cookieAdmin },
    });
    expect(remover.statusCode).toBe(204);

    const semAcesso = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie: cookieComum } });
    expect(semAcesso.statusCode).toBe(404);
  });

  it("recurso aninhado (tipologia) fica bloqueado para usuário comum sem vínculo com o empreendimento pai", async () => {
    const cookieAdmin = await criarAdminLogado();
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
    const empreendimentoId = criado.json().id as string;
    const tipologiaRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      headers: { cookie: cookieAdmin },
      payload: { nome: "Studio" },
    });
    const tipologiaId = tipologiaRes.json().id as string;

    const cookieComum = await criarUsuarioComumLogado();

    const semAcessoCriarTipologia = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      headers: { cookie: cookieComum },
      payload: { nome: "Duplex" },
    });
    expect(semAcessoCriarTipologia.statusCode).toBe(404);

    const semAcessoUnidades = await app.inject({
      method: "GET",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      headers: { cookie: cookieComum },
    });
    expect(semAcessoUnidades.statusCode).toBe(404);
  });

  /**
   * Vinculo em lote (achado F22, docs/DECISOES.md — "vinculo de usuario em
   * lote"): `empreendimentoIds` (plural) vincula varios de uma vez, alem do
   * `empreendimentoId` (singular) que ja existia.
   */
  describe("vínculo em lote (achado F22)", () => {
    it("vincula vários empreendimentos de uma vez via empreendimentoIds", async () => {
      const cookieAdmin = await criarAdminLogado();
      const a = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
      const b = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Lua" } });
      const usuarioComum = await criarUsuario({ email: "lote@local.test", nome: "Usuário Lote", senha: "senha123", papel: "usuario" });

      const vincular = await app.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoIds: [a.json().id, b.json().id] },
      });
      expect(vincular.statusCode).toBe(201);
      expect(vincular.json()).toHaveLength(2);

      const cookieComum = await login("lote@local.test", "senha123");
      const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieComum } });
      expect(lista.json()).toHaveLength(2);
    });

    it("empreendimentoId (singular) continua funcionando, sem quebrar compatibilidade", async () => {
      const cookieAdmin = await criarAdminLogado();
      const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
      const usuarioComum = await criarUsuario({ email: "singular@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });

      const vincular = await app.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoId: criado.json().id },
      });
      expect(vincular.statusCode).toBe(201);
      expect(vincular.json()).toHaveLength(1);
    });

    it("rejeita quando nem empreendimentoId nem empreendimentoIds são enviados", async () => {
      const cookieAdmin = await criarAdminLogado();
      const usuarioComum = await criarUsuario({ email: "vazio@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });

      const res = await app.inject({ method: "POST", url: `/api/usuarios/${usuarioComum.id}/empreendimentos`, headers: { cookie: cookieAdmin }, payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it("404 quando algum id da lista não existe, e não vincula nenhum dos válidos", async () => {
      const cookieAdmin = await criarAdminLogado();
      const a = await app.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Sol" } });
      const usuarioComum = await criarUsuario({ email: "parcial@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });

      const res = await app.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoIds: [a.json().id, "inexistente"] },
      });
      expect(res.statusCode).toBe(404);

      const cookieComum = await login("parcial@local.test", "senha123");
      const lista = await app.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie: cookieComum } });
      expect(lista.json()).toHaveLength(0);
    });
  });
});
