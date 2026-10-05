import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — nível de acesso por empreendimento (usado pela tela para esconder escrita)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appPlain: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    appPlain = await buildApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Nível de acesso" } })).json().id as string;
  });

  afterAll(async () => {
    await appPlain.close();
    await app.close();
    await prisma.$disconnect();
  });

  async function sessaoDe(papel: "usuario" | "stakeholder", vinculo: "edicao" | "leitura") {
    const email = `nivel-${papel}-${vinculo}@teste.local`;
    const senha = "senha-nivel-123";
    const criado = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Teste nível", senha, papel } });
    const usuarioId = criado.json().id as string;
    await app.inject({ method: "POST", url: `/api/usuarios/${usuarioId}/empreendimentos`, payload: { empreendimentoIds: [empreendimentoId], papel: vinculo } });
    const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    return cookie;
  }

  it("admin recebe 'admin' na lista e no detalhe", async () => {
    const lista = await app.inject({ method: "GET", url: "/api/empreendimentos" });
    expect(lista.json().find((e: { id: string }) => e.id === empreendimentoId).nivelAcesso).toBe("admin");
    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(detalhe.json().nivelAcesso).toBe("admin");
  });

  it("usuário com vínculo de edição recebe 'edicao'", async () => {
    const cookie = await sessaoDe("usuario", "edicao");
    const lista = await appPlain.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.json().find((e: { id: string }) => e.id === empreendimentoId).nivelAcesso).toBe("edicao");
    const detalhe = await appPlain.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie } });
    expect(detalhe.json().nivelAcesso).toBe("edicao");
  });

  it("usuário com vínculo de leitura recebe 'leitura' e a API nega escrita", async () => {
    const cookie = await sessaoDe("usuario", "leitura");
    const lista = await appPlain.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.json().find((e: { id: string }) => e.id === empreendimentoId).nivelAcesso).toBe("leitura");
    const escrita = await appPlain.inject({ method: "PATCH", url: `/api/empreendimentos/${empreendimentoId}`, headers: { cookie }, payload: { nome: "Não pode" } });
    expect(escrita.statusCode).toBe(403);
  });

  it("stakeholder só tem vínculo de leitura e não pode criar empreendimento", async () => {
    const cookie = await sessaoDe("stakeholder", "leitura");
    const lista = await appPlain.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.json().find((e: { id: string }) => e.id === empreendimentoId).nivelAcesso).toBe("leitura");
    const criar = await appPlain.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie }, payload: { nome: "Novo" } });
    expect(criar.statusCode).toBe(403);
  });
});
