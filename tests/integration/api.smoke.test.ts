import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { importarSplendido } from "../../src/import/importadorSplendido.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a API via app.inject() (Fastify) — sem abrir porta real. A API e
 * uma casca fina (ver api/src/app.ts): este teste confirma que a casca
 * devolve o formato certo e os mesmos numeros que o motor produz
 * diretamente, nao uma logica de negocio nova.
 */
describe("API — casca sobre o motor", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cenarioId: string;

  beforeAll(async () => {
    await resetDatabase();
    const { cenarioId: id } = await importarSplendido({ participaFluxoCaixaExtras: false });
    cenarioId = id;
    await gerarVendasDePremissaVelocidade(cenarioId);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /api/empreendimentos lista o Splendido com seu cenário", async () => {
    const res = await app.inject({ method: "GET", url: "/api/empreendimentos" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const splendido = body.find((e: { nome: string }) => e.nome === "Splendido");
    expect(splendido).toBeDefined();
    expect(splendido.cenarios).toHaveLength(1);
    expect(splendido.cenarios[0].id).toBe(cenarioId);
  });

  it("GET /api/cenarios/:id/fluxo-caixa devolve os mesmos indicadores que o motor direto", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.empreendimento).toBe("Splendido");
    expect(body.fluxo).toHaveLength(40);
    // golden numbers documentados em docs/DIVERGENCIAS_PLANILHA.md
    expect(body.indicadores.mesPico).toBe(30);
    expect(body.indicadores.mesRecuperacao).toBe(38);
    expect(body.indicadores.necessidadeMaximaCapital).toBe("22178011.63");
    expect(body.indicadores.vpl).toBe("14152789.47");
  });

  it("GET /api/cenarios/:id/fluxo-caixa com id inexistente devolve 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cenarios/nao-existe/fluxo-caixa" });
    expect(res.statusCode).toBe(404);
  });
});
