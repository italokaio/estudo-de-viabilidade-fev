import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.5 — papel Stakeholder (docs/DECISOES.md, achado F34): visualização
 * apenas, por empreendimento, concedida explicitamente por um admin.
 * Reaproveita quase toda a arquitetura de permissão já existente (achados
 * F5/F23) — só três pontos novos: validação do papel na criação de
 * usuário, bloqueio de vínculo "edicao" para Stakeholder, e bloqueio de
 * criação de empreendimento. O resto (isolamento por empreendimento,
 * bloqueio de escrita) já vem de graça de `garantirAcesso`.
 */
describe("API — papel Stakeholder (Fase 2.5)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("criar usuário aceita papel 'stakeholder' e rejeita papel inválido", async () => {
    const ok = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email: "sh1@local.test", nome: "SH1", senha: "senha123", papel: "stakeholder" } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().papel).toBe("stakeholder");

    const invalido = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email: "sh2@local.test", nome: "SH2", senha: "senha123", papel: "diretor" } });
    expect(invalido.statusCode).toBe(400);
  });

  it("vínculo de Stakeholder nunca pode ser 'edicao'", async () => {
    const usuario = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email: "sh3@local.test", nome: "SH3", senha: "senha123", papel: "stakeholder" } });
    const usuarioId = usuario.json().id as string;
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Stakeholder Vínculo" } });
    const empreendimentoId = emp.json().id as string;

    const rejeitado = await app.inject({
      method: "POST",
      url: `/api/usuarios/${usuarioId}/empreendimentos`,
      payload: { empreendimentoId, papel: "edicao" },
    });
    expect(rejeitado.statusCode).toBe(400);
    expect(rejeitado.json().erro).toMatch(/leitura/);

    const aceito = await app.inject({
      method: "POST",
      url: `/api/usuarios/${usuarioId}/empreendimentos`,
      payload: { empreendimentoId, papel: "leitura" },
    });
    expect(aceito.statusCode).toBe(201);
  });

  it("Stakeholder não pode criar empreendimentos", async () => {
    await criarUsuario({ email: "sh-criador@local.test", nome: "SH", senha: "senha123", papel: "stakeholder" });
    const appCru = await buildApp();
    const login = await appCru.inject({ method: "POST", url: "/api/auth/login", payload: { email: "sh-criador@local.test", senha: "senha123" } });
    const cookie = login.headers["set-cookie"] as string;

    const res = await appCru.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie }, payload: { nome: "Não deveria existir" } });
    expect(res.statusCode).toBe(403);
    await appCru.close();
  });

  it("teste fundamental do Stakeholder: acesso concedido a A, negado a B, aplicado no backend, inclusive nos relatórios", async () => {
    // ----- setup como admin -----
    const empA = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Empreendimento A — Stakeholder" } });
    const empreendimentoAId = empA.json().id as string;
    const empB = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Empreendimento B — Stakeholder" } });
    const empreendimentoBId = empB.json().id as string;

    const cenarioA = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoAId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioAId = cenarioA.json().id as string;
    const cenarioB = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoBId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioBId = cenarioB.json().id as string;

    const stakeholder = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email: "sh-fundamental@local.test", nome: "SH Fundamental", senha: "senha123", papel: "stakeholder" } });
    const stakeholderId = stakeholder.json().id as string;
    // concede A, NAO concede B
    await app.inject({ method: "POST", url: `/api/usuarios/${stakeholderId}/empreendimentos`, payload: { empreendimentoId: empreendimentoAId, papel: "leitura" } });

    // ----- autentica como Stakeholder (instancia crua, sem o cookie fixo de admin) -----
    const appSh = await buildApp();
    const login = await appSh.inject({ method: "POST", url: "/api/auth/login", payload: { email: "sh-fundamental@local.test", senha: "senha123" } });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"] as string;

    // 1. lista de empreendimentos so mostra A
    const lista = await appSh.inject({ method: "GET", url: "/api/empreendimentos", headers: { cookie } });
    const nomes = lista.json().map((e: any) => e.nome);
    expect(nomes).toContain("Empreendimento A — Stakeholder");
    expect(nomes).not.toContain("Empreendimento B — Stakeholder");

    // 2. gera/visualiza relatorio de A
    const relatorioA = await appSh.inject({ method: "GET", url: `/api/cenarios/${cenarioAId}/relatorios/viabilidade.pdf`, headers: { cookie } });
    expect(relatorioA.statusCode).toBe(200);
    expect(relatorioA.rawPayload.subarray(0, 4).toString()).toBe("%PDF");

    // 3. tenta relatorio de B direto pela API -- 404, sem vazar nenhum dado de B
    const relatorioB = await appSh.inject({ method: "GET", url: `/api/cenarios/${cenarioBId}/relatorios/viabilidade.pdf`, headers: { cookie } });
    expect(relatorioB.statusCode).toBe(404);
    expect(relatorioB.json().erro).toBeTruthy();

    // 3b. o mesmo vale acessando B pelo empreendimentoId diretamente (comparativo)
    const comparativoB = await appSh.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoBId}/relatorios/comparacao.pdf?ids=${cenarioBId}`, headers: { cookie } });
    expect(comparativoB.statusCode).toBe(404);

    // 4. nao pode escrever em A, mesmo tendo acesso de leitura a A
    const escrita = await appSh.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoAId}/tipologias`,
      headers: { cookie },
      payload: { nome: "Studio" },
    });
    expect(escrita.statusCode).toBe(403);

    // 5. nao pode alterar cenarios (duplicar/excluir) mesmo em A
    const duplicar = await appSh.inject({ method: "POST", url: `/api/cenarios/${cenarioAId}/duplicar`, headers: { cookie }, payload: { nome: "Cópia" } });
    expect(duplicar.statusCode).toBe(403);

    await appSh.close();
  });
});
