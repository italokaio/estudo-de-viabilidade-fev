import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";

describe("API — editar e excluir linhas de premissa de velocidade", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaA: string;
  let tipologiaB: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Edição de premissa" } });
    empreendimentoId = emp.json().id as string;
    tipologiaA = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto A", precoUnitarioPadrao: "300000" } })).json().id as string;
    tipologiaB = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto B", precoUnitarioPadrao: "200000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaA}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "A" } });
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaB}/unidades`, payload: { quantidade: 3, precoVenda: "200000", prefixoNumero: "B" } });
    const modalidades = [
      { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" },
    ];
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaA}/condicoes-pagamento`, payload: { nome: "Padrão A", modalidades } });
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaB}/condicoes-pagamento`, payload: { nome: "Padrão B", modalidades } });
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Teste", horizonteProjecaoMeses: 12 } })).json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function adicionar(tipologiaId: string, mes: number, unidadesPrevistas: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes, unidadesPrevistas }] },
    });
    expect(res.statusCode).toBe(201);
  }

  async function linhas() {
    return prisma.premissaVelocidadeVendas.findMany({ where: { cenarioId }, orderBy: [{ tipologiaId: "asc" }, { mes: "asc" }, { id: "asc" }] });
  }

  async function detalhe() {
    return (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` })).json() as {
      premissasVelocidade: { id: string; tipologiaNome: string; mes: number; unidadesPrevistas: string }[];
      avisos: string[];
    };
  }

  it("edita a quantidade de uma linha sem tocar nas linhas irmãs e sem mudar o VGV além da diferença", async () => {
    await adicionar(tipologiaA, 2, "2");
    await adicionar(tipologiaA, 2, "3");
    const [primeira, segunda] = await linhas();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade/${primeira!.id}`,
      payload: { unidadesPrevistas: "5" },
    });
    expect(res.statusCode).toBe(200);

    const depois = await linhas();
    expect(depois).toHaveLength(2);
    expect(depois.find((l) => l.id === primeira!.id)!.unidadesPrevistas).toBe("5");
    expect(depois.find((l) => l.id === segunda!.id)!.unidadesPrevistas).toBe("3");

    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    expect(dados.resumoExecutivo.vgv).toBe("2400000.00"); // 8 unidades × 300000
  });

  it("o POST continua somando linhas iguais, e cada linha é um registro separado", async () => {
    await adicionar(tipologiaA, 2, "2");
    await adicionar(tipologiaA, 2, "3");
    expect(await linhas()).toHaveLength(2);
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    expect(dados.resumoExecutivo.vgv).toBe("1500000.00"); // 5 unidades × 300000
  });

  it("valida a quantidade na edição com as mesmas regras do cadastro", async () => {
    await adicionar(tipologiaA, 2, "2");
    const [linha] = await linhas();
    const url = `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}`;
    for (const ruim of ["abc", "-1", "5,5", ""]) {
      const res = await app.inject({ method: "PATCH", url, payload: { unidadesPrevistas: ruim } });
      expect(res.statusCode, `valor "${ruim}"`).toBe(400);
    }
    const semCampo = await app.inject({ method: "PATCH", url, payload: {} });
    expect(semCampo.statusCode).toBe(400);
    expect((await linhas())[0]!.unidadesPrevistas).toBe("2");
  });

  it("recusa editar ou excluir uma linha que pertence a outro cenário", async () => {
    await adicionar(tipologiaA, 2, "2");
    const [linha] = await linhas();
    const outro = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Outro", horizonteProjecaoMeses: 12 } })).json().id as string;

    const patch = await app.inject({ method: "PATCH", url: `/api/cenarios/${outro}/premissas-velocidade/${linha!.id}`, payload: { unidadesPrevistas: "9" } });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${outro}/premissas-velocidade/${linha!.id}` });
    expect(del.statusCode).toBe(404);
    expect((await linhas())[0]!.unidadesPrevistas).toBe("2");
  });

  it("exclui uma linha, e a projeção deixa de contar essa linha", async () => {
    await adicionar(tipologiaA, 2, "2");
    await adicionar(tipologiaB, 3, "1");
    const [linhaA] = (await linhas()).filter((l) => l.tipologiaId === tipologiaA);

    const res = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linhaA!.id}` });
    expect(res.statusCode).toBe(204);
    expect(await linhas()).toHaveLength(1);

    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    expect(dados.resumoExecutivo.vgv).toBe("200000.00");
  });

  it("o aviso de premissa acima do total reage à edição e à exclusão", async () => {
    await adicionar(tipologiaA, 1, "5"); // tipologia A tem 4 unidades
    expect((await detalhe()).avisos).toHaveLength(1);
    expect((await detalhe()).avisos[0]).toMatch(/Apto A.*soma 5 unidades, mas a tipologia tem 4/);

    const [linha] = await linhas();
    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}`, payload: { unidadesPrevistas: "4" } });
    expect((await detalhe()).avisos).toEqual([]);

    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}`, payload: { unidadesPrevistas: "6" } });
    expect((await detalhe()).avisos).toHaveLength(1);

    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}` });
    expect((await detalhe()).avisos).toEqual([]);
  });

  it("a edição e a exclusão não mexem em tipologia com venda real no cenário", async () => {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId: tipologiaA, status: "estoque" } });
    const condicao = await prisma.condicaoPagamento.findFirstOrThrow({ where: { tipologiaId: tipologiaA } });
    const venda = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/vendas`,
      payload: { unidadeId: unidade.id, condicaoPagamentoId: condicao.id, mesOrigem: 1, comprador: "Real" },
    });
    expect(venda.statusCode).toBe(201);
    await adicionar(tipologiaA, 2, "2");
    const antes = await montarDadosRelatorioViabilidade(cenarioId);
    const [linha] = await linhas();

    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}`, payload: { unidadesPrevistas: "9" } });
    expect((await montarDadosRelatorioViabilidade(cenarioId)).resumoExecutivo.vgv).toBe(antes.resumoExecutivo.vgv);

    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha!.id}` });
    expect((await montarDadosRelatorioViabilidade(cenarioId)).resumoExecutivo.vgv).toBe(antes.resumoExecutivo.vgv);
  });
});
