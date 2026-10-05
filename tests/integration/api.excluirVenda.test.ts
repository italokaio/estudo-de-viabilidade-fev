import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — excluir venda lançada por engano", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appPlain: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;
  let condicaoId: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    appPlain = await buildApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Excluir venda" } })).json().id as string;
    tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "AP" } });
    condicaoId = (await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    })).json().id as string;
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } })).json().id as string;
  });

  afterAll(async () => {
    await appPlain.close();
    await app.close();
    await prisma.$disconnect();
  });

  async function vender(cenario: string, mesOrigem: number) {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenario}/vendas`, payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem, comprador: "Teste" } });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function fluxo(cenario: string) {
    return (await app.inject({ method: "GET", url: `/api/cenarios/${cenario}/fluxo-caixa` })).json();
  }

  it("admin exclui venda ativa sem realizado: unidade volta ao estoque e recebimentos saem", async () => {
    const vendaId = await vender(cenarioId, 1);
    expect((await prisma.recebimentoProjetado.count({ where: { vendaId } }))).toBeGreaterThan(0);
    const res = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    expect(res.statusCode).toBe(204);
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(0);
    expect(await prisma.recebimentoProjetado.count({ where: { vendaId } })).toBe(0);
    expect(await prisma.unidade.count({ where: { tipologiaId, status: "estoque" } })).toBe(4);
  });

  it("bloqueia a exclusão quando algum recebimento da venda já está marcado como recebido", async () => {
    const vendaId = await vender(cenarioId, 1);
    const recebimento = await prisma.recebimentoProjetado.findFirstOrThrow({ where: { vendaId } });
    await prisma.recebimentoProjetado.update({ where: { id: recebimento.id }, data: { status: "recebido", valorRealizado: "1000" } });
    const res = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/marcado\(s\) como recebido\(s\)/);
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(1);
  });

  it("recusa excluir venda distratada, com mensagem sobre o histórico financeiro", async () => {
    const vendaId = await vender(cenarioId, 1);
    await app.inject({ method: "POST", url: `/api/vendas/${vendaId}/distrato`, payload: { mesDistrato: 3, percentualRetencao: "0" } });
    const res = await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/distratada/);
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(1);
  });

  it("usuário sem papel de admin recebe 403, mesmo com vínculo de edição", async () => {
    const vendaId = await vender(cenarioId, 1);
    const email = "excluir-venda-edicao@teste.local";
    const criado = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Edição", senha: "senha-venda-123", papel: "usuario" } });
    await app.inject({ method: "POST", url: `/api/usuarios/${criado.json().id}/empreendimentos`, payload: { empreendimentoIds: [empreendimentoId], papel: "edicao" } });
    const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha: "senha-venda-123" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await appPlain.inject({ method: "DELETE", url: `/api/vendas/${vendaId}`, headers: { cookie } });
    expect(res.statusCode).toBe(403);
    expect(await prisma.venda.count({ where: { id: vendaId } })).toBe(1);
  });

  it("o cenário é recalculado: após excluir, o fluxo é igual ao de quando a venda nunca existiu", async () => {
    await vender(cenarioId, 1);
    const soUmaVenda = await fluxo(cenarioId);
    const segunda = await vender(cenarioId, 2);
    expect((await fluxo(cenarioId)).indicadores.vpl).not.toBe(soUmaVenda.indicadores.vpl);
    await app.inject({ method: "DELETE", url: `/api/vendas/${segunda}` });
    const depois = await fluxo(cenarioId);
    expect(depois.fluxo).toEqual(soUmaVenda.fluxo);
    expect(depois.indicadores).toEqual(soUmaVenda.indicadores);
  });

  it("a unidade liberada fica disponível para outro cenário do mesmo empreendimento (estoque compartilhado)", async () => {
    const outro = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Outro", horizonteProjecaoMeses: 12 } })).json().id as string;
    const vendaId = await vender(cenarioId, 1);
    await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${outro}/vendas`, payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem: 2, comprador: "Outro" } });
    expect(res.statusCode).toBe(201);
  });

  it("consulta de impacto avisa só quando a venda é a única da tipologia e há premissa para ela", async () => {
    const unica = await vender(cenarioId, 1);
    const semPremissa = await app.inject({ method: "GET", url: `/api/vendas/${unica}/impacto-exclusao` });
    expect(semPremissa.json().premissaPassaraValer).toBe(false);

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 3, unidadesPrevistas: "1" }] } });
    expect((await app.inject({ method: "GET", url: `/api/vendas/${unica}/impacto-exclusao` })).json().premissaPassaraValer).toBe(true);

    await vender(cenarioId, 2);
    expect((await app.inject({ method: "GET", url: `/api/vendas/${unica}/impacto-exclusao` })).json().premissaPassaraValer).toBe(false);
  });

  it("ao excluir a única venda da tipologia no cenário, a projeção por premissa passa a valer e muda o VGV (comportamento documentado)", async () => {
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 2, unidadesPrevistas: "2" }] } });
    const vendaId = await vender(cenarioId, 1);
    const comVenda = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${cenarioId}` });
    expect(comVenda.json().cenarios[0].indicadores.vgv).toBe("300000.00");
    await app.inject({ method: "DELETE", url: `/api/vendas/${vendaId}` });
    const semVenda = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${cenarioId}` });
    expect(semVenda.json().cenarios[0].indicadores.vgv).toBe("600000.00");
  });
});
