import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa faixas de comissão progressiva por VGV acumulado (achado F28,
 * docs/DECISOES.md — "faixas de comissão progressivas por volume vendido"):
 * o percentual não é um valor único no Custo, é uma tabela cadastrada à
 * parte, com volumeAte estritamente crescente e no máximo uma faixa aberta
 * (sempre a última) — validado na API a cada criação/edição.
 */
describe("API — faixas de comissão progressiva por VGV acumulado (achado F28)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComCustoFaixas() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Faixas Teste" } });
    const empreendimentoId = emp.json().id as string;
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão progressiva", tipoIncidencia: "faixas_vgv_acumulado" },
    });
    const categoriaId = cat.json().id as string;
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId } });
    const custoId = custoRes.json().id as string;
    return { empreendimentoId, cenarioId, categoriaId, custoId };
  }

  it("cria um custo de faixas sem exigir valorPrevisto nem percentual", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    const custo = await prisma.custo.findUnique({ where: { id: custoId } });
    expect(custo?.valorPrevisto).toBeNull();
    expect(custo?.percentual).toBeNull();
  });

  it("cadastra faixas em ordem crescente de volumeAte, a última sem limite", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    const f1 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    expect(f1.statusCode).toBe(201);
    const f2 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "2000000", percentual: "0.04" } });
    expect(f2.statusCode).toBe(201);
    const f3 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });
    expect(f3.statusCode).toBe(201);
    expect(f3.json().volumeAte).toBeNull();
  });

  it("rejeita uma faixa com volumeAte igual ao de uma faixa já existente (limite duplicado, ambíguo)", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    const igual = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.04" } });
    expect(igual.statusCode).toBe(400);
  });

  it("aceita cadastrar uma faixa com volumeAte menor que uma já existente — a ordem de cadastro não importa, o motor sempre ordena por volumeAte", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    const menor = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "500000", percentual: "0.02" } });
    expect(menor.statusCode).toBe(201);
  });

  it("rejeita cadastrar uma segunda faixa aberta (sem limite) — só pode haver uma", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });
    const segundaAberta = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.06" } });
    expect(segundaAberta.statusCode).toBe(400);
  });

  it("aceita cadastrar uma faixa fechada depois que uma faixa aberta já existe — ela entra abaixo da aberta na tabela ordenada", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });
    const depois = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "3000000", percentual: "0.04" } });
    expect(depois.statusCode).toBe(201);
  });

  it("rejeita faixa para um custo cuja categoria não é de faixas progressivas", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Não Faixas" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/categorias-custo`,
      payload: { nome: "Comissão simples", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/custos`, payload: { categoriaId: cat.json().id, percentual: "0.05" } });
    const res = await app.inject({ method: "POST", url: `/api/custos/${custoRes.json().id}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/cenarios/:id expõe as faixas de cada custo", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const custo = detalhe.json().custos.find((c: any) => c.id === custoId);
    expect(custo.faixasComissao).toHaveLength(2);
    expect(custo.faixasComissao[0].percentual).toBe("0.03");
    expect(custo.faixasComissao[1].volumeAte).toBeNull();
  });

  it("PATCH edita o percentual de uma faixa", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    const criada = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    const id = criada.json().id as string;

    const editado = await app.inject({ method: "PATCH", url: `/api/faixas-comissao/${id}`, payload: { percentual: "0.035" } });
    expect(editado.statusCode).toBe(200);
    expect(editado.json().percentual).toBe("0.035");
  });

  it("PATCH rejeita editar volumeAte para um valor igual ao de outra faixa do mesmo custo", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    const f2 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "2000000", percentual: "0.04" } });

    const res = await app.inject({ method: "PATCH", url: `/api/faixas-comissao/${f2.json().id}`, payload: { volumeAte: "1000000" } });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH aceita editar volumeAte para um valor menor que o de outra faixa — reordena a tabela", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    const f2 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "2000000", percentual: "0.04" } });

    const res = await app.inject({ method: "PATCH", url: `/api/faixas-comissao/${f2.json().id}`, payload: { volumeAte: "500000" } });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE remove uma faixa", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoFaixas();
    const criada = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });

    const del = await app.inject({ method: "DELETE", url: `/api/faixas-comissao/${criada.json().id}` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const custo = detalhe.json().custos.find((c: any) => c.id === custoId);
    expect(custo.faixasComissao).toHaveLength(0);
  });

  it("usuário comum recebe 403 ao tentar excluir uma faixa", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Faixas Perm" } });
    const cenarioRes = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cat = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/categorias-custo`, payload: { nome: "Comissão", tipoIncidencia: "faixas_vgv_acumulado" } });
    const custoRes = await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/custos`, payload: { categoriaId: cat.json().id } });
    const criada = await appAdmin.inject({ method: "POST", url: `/api/custos/${custoRes.json().id}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/faixas-comissao/${criada.json().id}` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("excluir um custo com faixas cadastradas não falha (cascade manual)", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });

    const del = await app.inject({ method: "DELETE", url: `/api/custos/${custoId}` });
    expect(del.statusCode).toBe(204);

    const restantes = await prisma.faixaComissao.findMany({ where: { custoId } });
    expect(restantes).toHaveLength(0);
  });

  it("duplicar um cenário preserva as faixas de comissão do custo original", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });

    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    const custoNovo = detalhe.json().custos[0];
    expect(custoNovo.faixasComissao).toHaveLength(2);
    const idsOriginais = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` })).json().custos[0].faixasComissao.map((f: any) => f.id);
    const idsNovos = custoNovo.faixasComissao.map((f: any) => f.id);
    expect(idsNovos.some((id: string) => idsOriginais.includes(id))).toBe(false);
  });

  it("404 para custo inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/custos/id-inexistente/faixas-comissao", payload: { volumeAte: "1000000", percentual: "0.03" } });
    expect(res.statusCode).toBe(404);
  });

  it("rejeita percentual ausente", async () => {
    const { custoId } = await cadastrarCenarioComCustoFaixas();
    const res = await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000" } });
    expect(res.statusCode).toBe(400);
  });

  /** Venda de R$800.000 no mês 1 e R$500.000 no mês 2, ambas à vista, sob uma tabela de duas faixas + uma aberta. */
  async function cadastrarCenarioComVendasEFaixas() {
    const { empreendimentoId, cenarioId, custoId } = await cadastrarCenarioComCustoFaixas();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: "1000000", percentual: "0.03" } });
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/faixas-comissao`, payload: { volumeAte: null, percentual: "0.05" } });

    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "800000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 2, precoVenda: "800000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }, { tipologiaId, mes: 2, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { cenarioId };
  }

  it("o fluxo de caixa reflete a comissão calculada pelas faixas — 3% na primeira venda, 5% na segunda (cruzou a faixa aberta)", async () => {
    const { cenarioId } = await cadastrarCenarioComVendasEFaixas();
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo.find((f: any) => f.mes === 1);
    const mes2 = fluxo.json().fluxo.find((f: any) => f.mes === 2);
    // mes1: acumulado 800.000 (<=1.000.000) -> 3% de 800.000 = 24.000
    expect(mes1.saidas).toBe("24000.00");
    // mes2: acumulado 1.600.000 (faixa aberta, > 1.000.000) -> 5% de 800.000 = 40.000
    expect(mes2.saidas).toBe("40000.00");
  });
});
