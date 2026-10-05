import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — mês final da modalidade nivelada", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Mês final" } });
    empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } });
    tipologiaId = tip.json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function modalidades(mesFinal: unknown) {
    return [
      { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas mensais", percentual: "0.8", tipoDistribuicao: "nivelada", mesFinal },
    ];
  }

  async function condicoesDaTipologia() {
    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const tip = detalhe.json().tipologias.find((t: { id: string }) => t.id === tipologiaId);
    return tip.condicoesPagamento as { id: string; modalidades: { nome: string; mesFinal: number | null }[] }[];
  }

  it("persiste o mês final informado e devolve no detalhe do empreendimento", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Até a entrega", modalidades: modalidades(32) },
    });
    expect(res.statusCode).toBe(201);
    const nivelada = (await condicoesDaTipologia())[0]!.modalidades.find((m) => m.nome === "Parcelas mensais");
    expect(nivelada?.mesFinal).toBe(32);
  });

  it("sem mês final, a modalidade nivelada continua sem mês final (comportamento anterior)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Até o horizonte", modalidades: modalidades(undefined) },
    });
    expect(res.statusCode).toBe(201);
    const nivelada = (await condicoesDaTipologia())[0]!.modalidades.find((m) => m.nome === "Parcelas mensais");
    expect(nivelada?.mesFinal).toBeNull();
  });

  it("recusa mês final zero, fracionário ou em modalidade que não é nivelada", async () => {
    for (const ruim of [0, 1.5]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
        payload: { nome: "Ruim", modalidades: modalidades(ruim) },
      });
      expect(res.statusCode, `mesFinal ${ruim}`).toBe(400);
    }
    const periodica = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "Periódica com fim",
        modalidades: [
          { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
          { nome: "Intermediárias", percentual: "0.8", tipoDistribuicao: "periodica", periodicidadeMeses: 6, mesFinal: 32 },
        ],
      },
    });
    expect(periodica.statusCode).toBe(400);
  });

  it("edita o mês final e aceita null para voltar ao horizonte", async () => {
    const criada = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Editável", modalidades: modalidades(32) },
    });
    const condicaoId = criada.json().id as string;

    const trocada = await app.inject({ method: "PATCH", url: `/api/condicoes-pagamento/${condicaoId}`, payload: { modalidades: modalidades(24) } });
    expect(trocada.statusCode).toBe(200);
    expect((await condicoesDaTipologia())[0]!.modalidades.find((m) => m.nome === "Parcelas mensais")?.mesFinal).toBe(24);

    const limpa = await app.inject({ method: "PATCH", url: `/api/condicoes-pagamento/${condicaoId}`, payload: { modalidades: modalidades(null) } });
    expect(limpa.statusCode).toBe(200);
    expect((await condicoesDaTipologia())[0]!.modalidades.find((m) => m.nome === "Parcelas mensais")?.mesFinal).toBeNull();
  });
});
