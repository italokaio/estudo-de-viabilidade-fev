import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("parcela de custo paga sem base é preservada (sem base — previsto removido)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;
  let condicaoId: string;
  let cenarioId: string;
  let custoComissaoId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Sem base" } })).json().id as string;
    tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "SB" } });
    condicaoId = (await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    })).json().id as string;
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } })).json().id as string;
    const categoria = (await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes", papel: "comissao_corretagem" },
    })).json().id as string;
    custoComissaoId = (await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoria, percentual: "0.05" } })).json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function vender(mesOrigem: number) {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem, comprador: "X" } });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function fluxo() {
    return (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
  }

  async function pagarComissaoNoMes(mes: number) {
    await fluxo();
    const parcela = await prisma.desembolsoCusto.findFirstOrThrow({ where: { custo: { cenarioId }, mes } });
    await prisma.desembolsoCusto.update({ where: { id: parcela.id }, data: { status: "realizado", valorRealizado: "1234.56" } });
    return parcela.id;
  }

  it("distrato da venda do mês com comissão paga: a parcela fica sem base, previsto zero, realizado mantido", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const distrato = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    expect(distrato.statusCode).toBe(201);
    const depois = await fluxo();
    const linha = await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: parcelaId } });
    expect(linha.valorPrevisto).toBe("0");
    expect(linha.valorRealizado).toBe("1234.56");
    expect(linha.status).toBe("realizado");
    const mes2 = depois.fluxo.find((f: { mes: number }) => f.mes === 2);
    expect(mes2.saidas).toBe("0.00");
    expect(mes2.saidasRealizadas).toBe("1234.56");
  });

  it("a linha sem base aparece na lista de desembolsos do cenário com previsto zero", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await fluxo();
    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    const linha = lista.find((d: { id: string }) => d.id === parcelaId);
    expect(linha).toMatchObject({ valorPrevisto: "0", valorRealizado: "1234.56", status: "realizado" });
  });

  it("estornar a parcela sem base remove a linha (ela não tem mais razão de existir)", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await fluxo();
    const res = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${parcelaId}`, payload: { estornar: true } });
    expect(res.statusCode).toBe(200);
    expect(await prisma.desembolsoCusto.count({ where: { id: parcelaId } })).toBe(0);
    await fluxo();
    expect(await prisma.desembolsoCusto.count({ where: { custo: { cenarioId }, mes: 2 } })).toBe(0);
  });

  it("a linha sem base é apagada na regeneração seguinte depois de estornada na tela de custos (sem realizado restante)", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await fluxo();
    await prisma.desembolsoCusto.update({ where: { id: parcelaId }, data: { status: "previsto", valorRealizado: null } });
    await fluxo();
    expect(await prisma.desembolsoCusto.count({ where: { id: parcelaId } })).toBe(0);
  });

  it("desfazer o distrato devolve o previsto ao mês e mantém o realizado na mesma linha", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const distrato = await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}/distrato` });
    const depois = await fluxo();
    expect(distrato.statusCode).toBe(201);
    const linha = await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: parcelaId } });
    expect(linha.valorPrevisto).not.toBe("0");
    expect(linha.valorRealizado).toBe("1234.56");
    expect(depois.fluxo.find((f: { mes: number }) => f.mes === 2).saidas).not.toBe("0.00");
  });

  it("números oficiais: sem parcela paga, distrato segue apagando a parcela obsoleta como antes", async () => {
    const vendaId = await vender(2);
    await fluxo();
    expect(await prisma.desembolsoCusto.count({ where: { custo: { cenarioId }, mes: 2 } })).toBe(1);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await fluxo();
    expect(await prisma.desembolsoCusto.count({ where: { custo: { cenarioId }, mes: 2 } })).toBe(0);
  });

  it("divisão por zero: custo com previsto zero e realizado > 0 não gera NaN, Infinity nem desvio percentual", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    await fluxo();
    const resumo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` });
    expect(resumo.statusCode).toBe(200);
    expect(resumo.body).not.toMatch(/NaN|Infinity/);
    const custo = resumo.json().find((c: { id: string }) => c.id === custoComissaoId);
    expect(custo.totalPrevisto).toBe("0.00");
    expect(custo.totalRealizado).toBe("1234.56");
    expect(custo.desvioPercentual).toBeNull();
    expect(parcelaId).toBeTruthy();
  });
});
