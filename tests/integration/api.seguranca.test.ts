import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { prisma } from "../../src/db/client.js";
import { criarUsuario } from "../../src/db/auth.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fechamento e hardening da Fase 1 — segurança básica (item 10 do pedido):
 * CORS deixou de aceitar qualquer origem (`origin: true`) e o login ganhou
 * rate limiting (achado F29, docs/DECISOES.md). O limite de login é
 * configurável via RATE_LIMIT_LOGIN_MAX especificamente para este teste
 * forçar um valor baixo e provar o bloqueio de forma determinística —
 * sob a suíte inteira (process.env.VITEST), o padrão é bem mais alto,
 * nunca atingido pelo uso normal dos outros ~40 arquivos de teste.
 */
describe("API — segurança básica (fechamento/hardening da Fase 1)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("rate limiting no login", () => {
    const RATE_LIMIT_ENV = "RATE_LIMIT_LOGIN_MAX";

    beforeEach(async () => {
      await resetDatabase();
      process.env[RATE_LIMIT_ENV] = "3";
    });

    afterEach(() => {
      delete process.env[RATE_LIMIT_ENV];
    });

    it("bloqueia com 429 depois de exceder o limite de tentativas por minuto", async () => {
      const app = await buildApp();
      await criarUsuario({ email: "seguranca@local.test", nome: "Seguranca", senha: "senha-correta-123", papel: "usuario" });

      // 3 tentativas (o limite configurado) — todas devem passar pelo rate
      // limiter e chegar na lógica de autenticação (mesmo que a senha
      // esteja errada, a resposta é 401, não 429).
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "seguranca@local.test", senha: "senha-errada" } });
        expect(res.statusCode).toBe(401);
      }

      // a 4a tentativa estoura o limite -- 429, nem chega a checar a senha.
      const bloqueada = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "seguranca@local.test", senha: "senha-errada" } });
      expect(bloqueada.statusCode).toBe(429);

      // mesmo uma senha CORRETA é bloqueada enquanto o limite estiver
      // estourado -- o rate limit protege o endpoint inteiro, não só
      // tentativas malsucedidas.
      const correta = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "seguranca@local.test", senha: "senha-correta-123" } });
      expect(correta.statusCode).toBe(429);

      await app.close();
    });
  });

  describe("CORS restrito", () => {
    it("não reflete uma origem arbitrária — só as origens de desenvolvimento conhecidas", async () => {
      const app = await buildApp();
      const respostaOrigemDesconhecida = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: "https://site-malicioso-qualquer.com" },
        payload: { email: "x@x.com", senha: "x" },
      });
      // @fastify/cors so ecoa Access-Control-Allow-Origin quando a origem
      // da requisicao esta na lista permitida -- uma origem fora da lista
      // simplesmente nao recebe o header, o que o navegador trata como
      // "requisicao cross-origin nao autorizada" (o corpo da resposta em
      // si nao é bloqueado pelo Fastify, é o navegador quem aplica isso).
      expect(respostaOrigemDesconhecida.headers["access-control-allow-origin"]).toBeUndefined();

      const respostaOrigemConhecida = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: "http://localhost:5173" },
        payload: { email: "x@x.com", senha: "x" },
      });
      expect(respostaOrigemConhecida.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

      await app.close();
    });
  });
});
