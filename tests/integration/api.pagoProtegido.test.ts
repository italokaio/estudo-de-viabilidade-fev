import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("correções que deixariam parcela paga sem base são recusadas, com contorno", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;
  let condicaoId: string;
  let cenarioId: string;
  let custoComissaoId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Protegido" } })).json().id as string;
    tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "PR" } });
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
    return app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
  }

  async function pagarComissaoNoMes(mes: number) {
    await fluxo();
    const parcela = await prisma.desembolsoCusto.findFirstOrThrow({ where: { custo: { cenarioId }, mes } });
    await prisma.desembolsoCusto.update({ where: { id: parcela.id }, data: { status: "realizado", valorRealizado: "1234.56" } });
    return parcela.id;
  }

  function esperaRecusa(res: { statusCode: number; json: () => any }, operacao: string) {
    expect(res.statusCode).toBe(400);
    const erro = res.json().erro as string;
    expect(erro).toContain(operacao);
    expect(erro).toContain('"Comissão" no mês');
    expect(erro).toContain("R$ 1.234,56 pagos");
    expect(erro).toContain("Estornar");
    expect(erro).toContain("marque o pagamento de novo");
  }

  it("excluir venda: recusada, venda e parcela paga permanecem", async () => {
    const vendaId = await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const res = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    esperaRecusa(res, "Excluir esta venda");
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(1);
    expect(await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: parcelaId } })).toMatchObject({ status: "realizado", valorRealizado: "1234.56" });
  });

  it("excluir venda sem parcela paga segue normalmente", async () => {
    const vendaId = await vender(2);
    await fluxo();
    const res = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    expect(res.statusCode).toBe(204);
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(0);
  });

  it("mudar o mês da venda: recusada, mês original preservado", async () => {
    const vendaId = await vender(2);
    await pagarComissaoNoMes(2);
    const res = await app.inject({ method: "PATCH", url: `/api/vendas/${vendaId}`, payload: { mesOrigem: 5 } });
    esperaRecusa(res, "Mudar o mês desta venda");
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: vendaId } })).mesOrigem).toBe(2);
  });

  it("mudar o mês da venda sem parcela paga segue normalmente", async () => {
    const vendaId = await vender(2);
    const res = await app.inject({ method: "PATCH", url: `/api/vendas/${vendaId}`, payload: { mesOrigem: 5 } });
    expect(res.statusCode).toBe(200);
  });

  it("excluir linha de premissa que gera venda projetada: recusada, linha e parcela permanecem", async () => {
    const premissa = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 4, unidadesPrevistas: "1" }] } });
    expect(premissa.statusCode).toBe(201);
    await pagarComissaoNoMes(4);
    const linha = await prisma.premissaVelocidadeVendas.findFirstOrThrow({ where: { cenarioId, mes: 4 } });
    const res = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha.id}` });
    esperaRecusa(res, "Excluir esta linha de premissa de velocidade");
    expect(await prisma.premissaVelocidadeVendas.count({ where: { id: linha.id } })).toBe(1);
  });

  it("excluir linha de premissa sem parcela paga segue normalmente", async () => {
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 4, unidadesPrevistas: "1" }] } });
    const linha = await prisma.premissaVelocidadeVendas.findFirstOrThrow({ where: { cenarioId, mes: 4 } });
    const res = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/premissas-velocidade/${linha.id}` });
    expect(res.statusCode).toBe(204);
  });

  it("excluir custo percentual com parcela paga: recusado, custo e parcela permanecem", async () => {
    await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const res = await app.inject({ method: "DELETE", url: `/api/custos/${custoComissaoId}` });
    esperaRecusa(res, "Excluir este custo");
    expect(await prisma.custo.count({ where: { id: custoComissaoId } })).toBe(1);
    expect(await prisma.desembolsoCusto.count({ where: { id: parcelaId, status: "realizado" } })).toBe(1);
  });

  it("excluir custo fixo com realizado registrado: recusado, custo e realizado permanecem", async () => {
    const categoriaFixa = (await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Projeto", tipoIncidencia: "fixo", papel: "custo" },
    })).json().id as string;
    const custoFixo = (await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaFixa, valorPrevisto: "5000", competenciaMes: 3, recorrencia: "unico" },
    })).json().id as string;
    expect((await app.inject({ method: "PATCH", url: `/api/custos/${custoFixo}`, payload: { valorRealizado: "4800" } })).statusCode).toBe(200);
    const res = await app.inject({ method: "DELETE", url: `/api/custos/${custoFixo}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toContain("Excluir este custo");
    expect(res.json().erro).toContain('"Projeto" no mês 3');
    expect(res.json().erro).toContain("R$ 4.800,00 pagos");
    expect(await prisma.custo.findUniqueOrThrow({ where: { id: custoFixo } })).toMatchObject({ status: "realizado", valorRealizado: "4800" });
  });

  it("excluir custo sem nenhum pagamento segue normalmente", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/custos/${custoComissaoId}` });
    expect(res.statusCode).toBe(204);
  });

  it("editar custo percentual sem remover o mês: segue permitido, realizado permanece na linha", async () => {
    await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const res = await app.inject({ method: "PATCH", url: `/api/custos/${custoComissaoId}`, payload: { percentual: "0.06" } });
    expect(res.statusCode).toBe(200);
    const linha = await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: parcelaId } });
    expect(linha.status).toBe("realizado");
    expect(linha.valorRealizado).toBe("1234.56");
  });

  it("editar custo percentual para zero: segue permitido, o mês continua existindo com valor zero e o realizado permanece", async () => {
    await vender(2);
    const parcelaId = await pagarComissaoNoMes(2);
    const res = await app.inject({ method: "PATCH", url: `/api/custos/${custoComissaoId}`, payload: { percentual: "0" } });
    expect(res.statusCode).toBe(200);
    await fluxo();
    expect(await prisma.desembolsoCusto.findUniqueOrThrow({ where: { id: parcelaId } })).toMatchObject({ valorPrevisto: "0", status: "realizado", valorRealizado: "1234.56" });
  });
});
