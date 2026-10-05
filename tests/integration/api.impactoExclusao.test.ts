import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — consulta de impacto para confirmar exclusão de cenário e empreendimento", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;
  let condicaoId: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Impacto" } })).json().id as string;
    tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 2, precoVenda: "300000", prefixoNumero: "IM" } });
    condicaoId = (await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    })).json().id as string;
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } })).json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("cenário sem nada registrado: todos os contadores zero", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/impacto-exclusao` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ vendas: 0, recebimentosRecebidos: 0, parcelasCustoPagas: 0, custosFixosRealizados: 0 });
  });

  it("cenário com venda, recebimento recebido, parcela paga e custo fixo realizado: conta cada um", async () => {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem: 1, comprador: "X" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const rec = await prisma.recebimentoProjetado.findFirstOrThrow({ where: { venda: { cenarioId } } });
    await prisma.recebimentoProjetado.update({ where: { id: rec.id }, data: { status: "recebido", valorRealizado: "100" } });
    const categoriaComissao = (await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes", papel: "comissao_corretagem" },
    })).json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaComissao, percentual: "0.05" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const parcela = await prisma.desembolsoCusto.findFirstOrThrow({ where: { custo: { cenarioId } } });
    await prisma.desembolsoCusto.update({ where: { id: parcela.id }, data: { status: "realizado", valorRealizado: "50" } });
    const categoriaFixa = (await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Projeto", tipoIncidencia: "fixo", papel: "custo" },
    })).json().id as string;
    const custoFixo = (await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaFixa, valorPrevisto: "5000", competenciaMes: 2, recorrencia: "unico" } })).json().id as string;
    await app.inject({ method: "PATCH", url: `/api/custos/${custoFixo}`, payload: { valorRealizado: "4800" } });

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/impacto-exclusao` });
    expect(res.json()).toEqual({ vendas: 1, recebimentosRecebidos: 1, parcelasCustoPagas: 1, custosFixosRealizados: 1 });
  });

  it("empreendimento: conta cenários e soma o impacto de todos eles", async () => {
    const outro = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Outro", horizonteProjecaoMeses: 12 } })).json().id as string;
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${outro}/vendas`, payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem: 1, comprador: "Y" } });
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/impacto-exclusao` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cenarios: 2, vendas: 1, recebimentosRecebidos: 0, parcelasCustoPagas: 0, custosFixosRealizados: 0 });
  });

  it("empreendimento inexistente devolve 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/empreendimentos/nao-existe/impacto-exclusao" });
    expect(res.statusCode).toBe(404);
  });
});
