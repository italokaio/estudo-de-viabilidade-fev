import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — substituição atômica do cronograma", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Cronograma" } })).json().id as string;
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } })).json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "0.3" }, { mes: 2, percentualExecucaoMensal: "0.3" }, { mes: 3, percentualExecucaoMensal: "0.4" }] },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function linhas() {
    return prisma.cronogramaFisicoFinanceiro.findMany({ where: { cenarioId }, orderBy: { mes: "asc" } });
  }

  async function trocar(pontos: unknown) {
    return app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos } });
  }

  it("troca todos os meses de uma vez e a soma fica em 100%", async () => {
    const res = await trocar([{ mes: 1, percentualExecucaoMensal: "0.5" }, { mes: 2, percentualExecucaoMensal: "0.5" }]);
    expect(res.statusCode).toBe(200);
    const depois = await linhas();
    expect(depois.map((l) => [l.mes, l.percentualExecucaoMensal])).toEqual([
      [1, "0.5"],
      [2, "0.5"],
    ]);
  });

  it("recusa soma diferente de 100% e mantém o cronograma anterior intacto", async () => {
    const antes = await linhas();
    const res = await trocar([{ mes: 1, percentualExecucaoMensal: "0.5" }, { mes: 2, percentualExecucaoMensal: "0.4" }]);
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/soma dos percentuais = 0\.9/);
    expect(await linhas()).toEqual(antes);
  });

  it("recusa mês fora do horizonte, mês repetido e percentual inválido, sem tocar no cronograma", async () => {
    const antes = await linhas();
    const foraDoHorizonte = await trocar([{ mes: 13, percentualExecucaoMensal: "1" }]);
    expect(foraDoHorizonte.statusCode).toBe(400);
    expect(foraDoHorizonte.json().erro).toMatch(/entre 1 e 12/);

    const repetido = await trocar([{ mes: 1, percentualExecucaoMensal: "0.5" }, { mes: 1, percentualExecucaoMensal: "0.5" }]);
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().erro).toMatch(/repetidos/);

    for (const ruim of ["abc", "0,5", "2"]) {
      const res = await trocar([{ mes: 1, percentualExecucaoMensal: ruim }]);
      expect(res.statusCode, ruim).toBe(400);
    }
    expect(await linhas()).toEqual(antes);
  });

  it("bloqueia a troca quando uma parcela de custo de obra já está paga, com mensagem clara", async () => {
    const categoria = await prisma.categoriaCusto.create({ data: { empreendimentoId, nome: "Obra", tipoIncidencia: "pct_execucao" } });
    await prisma.custo.create({ data: { empreendimentoId, cenarioId, categoriaId: categoria.id, valorPrevisto: "100000", grupoIndiceCorrecao: "padrao" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const desembolso = await prisma.desembolsoCusto.findFirstOrThrow({ where: { custo: { cenarioId } }, orderBy: { mes: "asc" } });
    await prisma.desembolsoCusto.update({ where: { id: desembolso.id }, data: { status: "realizado", valorRealizado: "30000" } });

    const antes = await linhas();
    const res = await trocar([{ mes: 1, percentualExecucaoMensal: "1" }]);
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/marcada\(s\) como paga\(s\)/);
    expect(res.json().erro).toMatch(/estorne esses pagamentos de obra/);
    expect(await linhas()).toEqual(antes);
    expect((await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: desembolso.id } })).valorRealizado).toBe("30000");
  });

  it("salvar os mesmos valores não muda nenhum número do cenário", async () => {
    const categoria = await prisma.categoriaCusto.create({ data: { empreendimentoId, nome: "Obra", tipoIncidencia: "pct_execucao" } });
    await prisma.custo.create({ data: { empreendimentoId, cenarioId, categoriaId: categoria.id, valorPrevisto: "100000", grupoIndiceCorrecao: "padrao" } });
    const antes = await (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    const mesmos = (await linhas()).map((l) => ({ mes: l.mes, percentualExecucaoMensal: l.percentualExecucaoMensal }));
    const res = await trocar(mesmos);
    expect(res.statusCode).toBe(200);
    const depois = await (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    expect(depois.fluxo).toEqual(antes.fluxo);
    expect(depois.indicadores).toEqual(antes.indicadores);
  });

  it("documenta a falha da edição antiga em duas chamadas: apagar e depois recusar a criação deixa o cenário sem cronograma", async () => {
    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/cronograma` });
    const criacaoInvalida = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "0.5" }] },
    });
    expect(criacaoInvalida.statusCode).toBe(400);
    expect(await linhas()).toHaveLength(0);
  });
});
