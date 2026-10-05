import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa edicao e exclusao de empreendimento/tipologia/cenario pela API.
 * Excluir nao e so DELETE FROM: cada uma tem uma regra de integridade
 * proprio (excluir cenario devolve as unidades vendidas ao estoque;
 * excluir tipologia e bloqueado se ela tiver unidade vendida/reservada).
 */
describe("API — edição e exclusão de cadastros", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("PATCH /api/empreendimentos/:id atualiza campos parcialmente", async () => {
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Original", incorporador: "Foo" } });
    const id = criado.json().id as string;

    const res = await app.inject({ method: "PATCH", url: `/api/empreendimentos/${id}`, payload: { nome: "Atualizado" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().nome).toBe("Atualizado");
    expect(res.json().incorporador).toBe("Foo");
  });

  it("PATCH /api/empreendimentos/:id rejeita nome vazio", async () => {
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Original" } });
    const id = criado.json().id as string;
    const res = await app.inject({ method: "PATCH", url: `/api/empreendimentos/${id}`, payload: { nome: "   " } });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /api/empreendimentos/:id apaga o empreendimento e tudo abaixo dele", async () => {
    const criado = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Para Apagar" } });
    const id = criado.json().id as string;
    await app.inject({ method: "POST", url: `/api/empreendimentos/${id}/tipologias`, payload: { nome: "Studio" } });

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${id}` });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({ method: "GET", url: `/api/empreendimentos/${id}` });
    expect(get.statusCode).toBe(404);
  });

  it("DELETE /api/tipologias/:id é bloqueado quando há unidade vendida, e libera após excluir o cenário", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Exclusão" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 2, precoVenda: "300000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const bloqueado = await app.inject({ method: "DELETE", url: `/api/tipologias/${tipologiaId}` });
    expect(bloqueado.statusCode).toBe(400);

    const delCenario = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });
    expect(delCenario.statusCode).toBe(204);

    // apos excluir o cenario, as unidades voltam para 'estoque' e a tipologia pode ser excluida
    const liberado = await app.inject({ method: "DELETE", url: `/api/tipologias/${tipologiaId}` });
    expect(liberado.statusCode).toBe(204);
  });

  it("DELETE /api/tipologias/:id exclui quando as vendas das unidades foram distratadas", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Distrato" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 2, precoVenda: "300000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const vendas = await prisma.venda.findMany({ where: { cenarioId } });
    expect(vendas.length).toBeGreaterThan(0);
    for (const venda of vendas) {
      const distrato = await app.inject({ method: "POST", url: `/api/vendas/${venda.id}/distrato`, payload: { mesDistrato: 1, percentualRetencao: "0" } });
      expect(distrato.statusCode).toBe(201);
    }

    const res = await app.inject({ method: "DELETE", url: `/api/tipologias/${tipologiaId}` });
    expect(res.statusCode).toBe(204);
    expect(await prisma.unidade.count({ where: { tipologiaId } })).toBe(0);
    expect(await prisma.venda.count({ where: { cenarioId } })).toBe(0);
  });

  it("DELETE /api/cenarios/:id devolve as unidades vendidas ao estoque e some com as vendas do cenário no fluxo de caixa", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Cenário" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 3, precoVenda: "300000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "3" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });

    const unidadesEmEstoque = await prisma.unidade.count({ where: { tipologiaId, status: "estoque" } });
    expect(unidadesEmEstoque).toBe(3);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.statusCode).toBe(404);
  });

  it("PATCH /api/cenarios/:id atualiza horizonte de projeção", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Patch Cenário" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    const res = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { horizonteProjecaoMeses: 24 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().horizonteProjecaoMeses).toBe(24);
  });

  it("PATCH /api/tipologias/:id atualiza preço padrão", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Patch Tipologia" } });
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/tipologias`, payload: { nome: "Studio" } });
    const res = await app.inject({ method: "PATCH", url: `/api/tipologias/${tip.json().id}`, payload: { precoUnitarioPadrao: "350000" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().precoUnitarioPadrao).toBe("350000");
  });
});
