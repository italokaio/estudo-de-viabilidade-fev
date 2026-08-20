import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a segunda estrategia de precificacao (achado F2, docs/DECISOES.md)
 * pela API: gerar unidades com preco derivado de uma cascata por andar, em
 * vez do precoVenda direto identico usado em /api/tipologias/:id/unidades.
 */
describe("API — geração de unidades com cascata de preço por andar", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarTipologia() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Andar Teste" } });
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/tipologias`,
      payload: { nome: "2 Quartos" },
    });
    return tip.json().id as string;
  }

  it("gera unidades com preço crescente por andar (incremento fixo)", async () => {
    const tipologiaId = await cadastrarTipologia();

    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades-por-andar`,
      payload: {
        prefixoNumero: "AP",
        andares: [
          { andar: 1, quantidade: 2 },
          { andar: 2, quantidade: 2 },
          { andar: 10, quantidade: 1 },
        ],
        precificacao: { precoBase: "300000", andarBase: 1, incremento: "5000", tipoIncremento: "fixo" },
      },
    });
    expect(res.statusCode).toBe(201);
    const unidades = res.json();
    expect(unidades).toHaveLength(5);

    const precosPorAndar = Object.fromEntries(unidades.map((u: any) => [u.andar, u.precoVenda]));
    expect(precosPorAndar[1]).toBe("300000.00");
    expect(precosPorAndar[2]).toBe("305000.00");
    expect(precosPorAndar[10]).toBe("345000.00");
  });

  it("gera unidades com incremento percentual composto", async () => {
    const tipologiaId = await cadastrarTipologia();
    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades-por-andar`,
      payload: {
        prefixoNumero: "AP",
        andares: [{ andar: 3, quantidade: 1 }],
        precificacao: { precoBase: "300000", andarBase: 1, incremento: "0.02", tipoIncremento: "percentual" },
      },
    });
    expect(res.statusCode).toBe(201);
    // 300000 * 1.02^2 = 312120.00
    expect(res.json()[0].precoVenda).toBe("312120.00");
  });

  it("rejeita sem andares ou sem precificação", async () => {
    const tipologiaId = await cadastrarTipologia();
    const semAndares = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades-por-andar`,
      payload: { prefixoNumero: "AP", andares: [], precificacao: { precoBase: "300000", andarBase: 1, incremento: "5000", tipoIncremento: "fixo" } },
    });
    expect(semAndares.statusCode).toBe(400);

    const semPrecificacao = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades-por-andar`,
      payload: { prefixoNumero: "AP", andares: [{ andar: 1, quantidade: 1 }] },
    });
    expect(semPrecificacao.statusCode).toBe(400);
  });
});
