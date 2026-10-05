import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — valores decimais digitados com espaço ou vírgula", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let cenarioId: string;
  let tipologiaId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Decimais" } });
    empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto" } });
    tipologiaId = tip.json().id as string;
    const cen = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    cenarioId = cen.json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("cronograma recusa vírgula e aceita percentual com espaço no fim", async () => {
    const comVirgula = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "0,5" }] },
    });
    expect(comVirgula.statusCode).toBe(400);
    expect(comVirgula.json().erro).toContain("ponto decimal");

    const ok = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1 " }] },
    });
    expect(ok.statusCode).toBe(201);
  });

  it("índice de correção aceita variação negativa", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/indices-correcao`,
      payload: { grupo: "padrao", mes: 1, percentual: "-0.002" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("condição de pagamento normaliza o percentual da modalidade e recusa valor acima de 1", async () => {
    const ok = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Ato", percentual: "1 ", tipoDistribuicao: "unica_na_venda" }] },
    });
    expect(ok.statusCode).toBe(201);

    const acima = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Errada", modalidades: [{ nome: "Ato", percentual: "4", tipoDistribuicao: "unica_na_venda" }] },
    });
    expect(acima.statusCode).toBe(400);
  });

  it("financiamento recusa taxa com vírgula", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "1000000", taxaJurosMensal: "0,9", mesAmortizacao: 3 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toContain("ponto decimal");
  });

  it("premissa de velocidade recusa unidades com vírgula", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1,5" }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toContain("Unidades previstas");
  });

  it("destinatário de comissão recusa split com vírgula", async () => {
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: cat.json().id as string, percentual: "0.04" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/custos/${custo.json().id as string}/destinatarios-comissao`,
      payload: { nome: "Corretor", percentualSplit: "0,5" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toContain("ponto decimal");
  });

  it("faixa de comissão recusa percentual acima de 1", async () => {
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão progressiva", tipoIncidencia: "faixas_vgv_acumulado" },
    });
    const custo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: cat.json().id as string },
    });
    const custoId = custo.json().id as string;
    const res = await app.inject({
      method: "POST",
      url: `/api/custos/${custoId}/faixas-comissao`,
      payload: { volumeAte: null, percentual: "5" },
    });
    expect(res.statusCode).toBe(400);
  });
});
