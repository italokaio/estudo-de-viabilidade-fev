import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — validação do valor atribuído em permuta e contrapartes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let unidadeId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Valor atribuído" } });
    empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Apto", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 3, precoVenda: "300000", prefixoNumero: "AP" } });
    unidadeId = (await prisma.unidade.findFirstOrThrow({ where: { empreendimentoId, status: "estoque" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function registrarPermuta(valorAtribuido: string | undefined) {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { empreendimentoId, status: "estoque" } });
    return app.inject({
      method: "POST",
      url: `/api/unidades/${unidade.id}/permuta`,
      payload: { nomeContraparte: "Dono do terreno", valorAtribuido },
    });
  }

  it("aceita valor com ponto decimal e tolera espaços nas pontas", async () => {
    const res = await registrarPermuta("  100000.50  ");
    expect(res.statusCode).toBe(201);
    expect(res.json().valorAtribuido).toBe("100000.50");
  });

  it("aceita valor ausente, que fica sem valor atribuído", async () => {
    const res = await registrarPermuta(undefined);
    expect(res.statusCode).toBe(201);
    expect(res.json().valorAtribuido).toBeNull();
  });

  it("recusa vírgula como separador decimal, negativo e texto", async () => {
    for (const ruim of ["100000,50", "-100", "abc", "1.000,00"]) {
      const res = await registrarPermuta(ruim);
      expect(res.statusCode, ruim).toBe(400);
      expect(res.json().erro).toMatch(/Valor atribuído deve ser um número com ponto decimal/);
    }
    expect(await prisma.permuta.count()).toBe(0);
  });

  it("valida o valor atribuído também na edição da permuta, e aceita null para limpar", async () => {
    const criada = await registrarPermuta("100000");
    const permutaId = criada.json().id as string;

    const ruim = await app.inject({ method: "PATCH", url: `/api/unidades/${unidadeId}/permuta`, payload: { valorAtribuido: "50,00" } });
    expect(ruim.statusCode).toBe(400);

    const limpa = await app.inject({ method: "PATCH", url: `/api/unidades/${unidadeId}/permuta`, payload: { valorAtribuido: null } });
    expect(limpa.statusCode).toBe(200);
    expect((await prisma.permuta.findUniqueOrThrow({ where: { id: permutaId } })).valorAtribuido).toBeNull();
  });

  describe("contrapartes", () => {
    let permutaId: string;

    beforeEach(async () => {
      const criada = await registrarPermuta("100000");
      permutaId = criada.json().id as string;
    });

    it("recusa valor com vírgula ao cadastrar contraparte, sem criar o registro", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/permutas/${permutaId}/contrapartes`,
        payload: { nome: "Sócio", percentualSplit: "0.5", valorAtribuido: "50000,00" },
      });
      expect(res.statusCode).toBe(400);
      expect(await prisma.contrapartePermuta.count({ where: { permutaId } })).toBe(0);
    });

    it("aceita valor válido ao cadastrar e recusa valor inválido ao editar", async () => {
      const ok = await app.inject({
        method: "POST",
        url: `/api/permutas/${permutaId}/contrapartes`,
        payload: { nome: "Sócio", percentualSplit: "0.5", valorAtribuido: " 50000.00 " },
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().valorAtribuido).toBe("50000.00");

      const ruim = await app.inject({
        method: "PATCH",
        url: `/api/contrapartes-permuta/${ok.json().id}`,
        payload: { valorAtribuido: "-1" },
      });
      expect(ruim.statusCode).toBe(400);
      expect((await prisma.contrapartePermuta.findUniqueOrThrow({ where: { id: ok.json().id } })).valorAtribuido).toBe("50000.00");
    });
  });
});
