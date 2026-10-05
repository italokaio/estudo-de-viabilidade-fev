import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Criação de empreendimento pelo papel "usuario", sem nenhum vínculo prévio: o criador
 * recebe vínculo de edição automaticamente, vê o empreendimento na lista e consegue editá-lo.
 */
describe("API — usuário sem vínculo cria empreendimento", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appPlain: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let usuarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    appPlain = await buildApp();
    const email = "criador-sem-vinculo@teste.local";
    usuarioId = (await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Criador", senha: "senha-criador-123", papel: "usuario" } })).json().id as string;
    const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha: "senha-criador-123" } });
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  });

  afterAll(async () => {
    await appPlain.close();
    await app.close();
    await prisma.$disconnect();
  });

  it("recebe vínculo de edição no empreendimento criado, vê e consegue editá-lo", async () => {
    const criado = await appPlain.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie }, payload: { nome: "Criado pelo usuário" } });
    expect(criado.statusCode).toBe(201);
    const id = criado.json().id as string;

    const vinculo = await prisma.empreendimentoUsuario.findUnique({ where: { usuarioId_empreendimentoId: { usuarioId, empreendimentoId: id } } });
    expect(vinculo?.papel).toBe("edicao");

    const lista = await appPlain.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.json().map((e: { id: string }) => e.id)).toContain(id);
    expect(lista.json().find((e: { id: string }) => e.id === id).nivelAcesso).toBe("edicao");

    const editado = await appPlain.inject({ method: "PATCH", url: `/api/empreendimentos/${id}`, headers: { cookie }, payload: { nome: "Editado pelo criador" } });
    expect(editado.statusCode).toBe(200);
  });

  it("não vê empreendimentos criados por outro usuário sem vínculo", async () => {
    const outro = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Do admin" } });
    const lista = await appPlain.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    expect(lista.json().map((e: { id: string }) => e.id)).not.toContain(outro.json().id);
  });
});
