import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a estrutura de comissao (achado F11, docs/DECISOES.md): um Custo de
 * incidencia "pct_vgv_vendido_no_mes" pode ser escopado a uma unica
 * tipologia via Custo.tipologiaId — sem tabela nova, o mesmo mecanismo
 * generico de sempre, so com um filtro a mais. Permite percentuais de
 * comissao diferentes por tipologia (ex.: loja x apartamento).
 */
describe("API — estrutura de comissão (custo escopado por tipologia)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com duas tipologias (Apartamento e Loja), cada uma com uma venda no mes 1. */
  async function cadastrarComDuasTipologias() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Comissão Teste" } });
    const empreendimentoId = emp.json().id as string;

    const apto = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apartamento", precoUnitarioPadrao: "100000" } });
    const apartamentoId = apto.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${apartamentoId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "AP" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${apartamentoId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });

    const loja = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Loja", precoUnitarioPadrao: "50000" } });
    const lojaId = loja.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${lojaId}/unidades`, payload: { quantidade: 1, precoVenda: "50000", prefixoNumero: "LJ" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${lojaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });

    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" } });
    const categoriaComissaoId = cat.json().id as string;
    const catFixa = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Taxa fixa", tipoIncidencia: "fixo" } });
    const categoriaFixaId = catFixa.json().id as string;

    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: {
        itens: [
          { tipologiaId: apartamentoId, mes: 1, unidadesPrevistas: "1" },
          { tipologiaId: lojaId, mes: 1, unidadesPrevistas: "1" },
        ],
      },
    });
    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    if (gerar.statusCode !== 200) throw new Error(`gerar-vendas falhou no setup: ${gerar.payload}`);

    return { empreendimentoId, cenarioId, apartamentoId, lojaId, categoriaComissaoId, categoriaFixaId };
  }

  it("custo de comissão escopado a uma tipologia incide só sobre as vendas daquela tipologia", async () => {
    const { cenarioId, lojaId, categoriaComissaoId } = await cadastrarComDuasTipologias();

    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaComissaoId, tipologiaId: lojaId, percentual: "0.1" },
    });
    expect(custoRes.statusCode).toBe(201);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo.find((f: any) => f.mes === 1);
    // so a venda da loja (50000) entra na base -- o apartamento (100000) e ignorado por este custo.
    expect(mes1.saidas).toBe("5000.00");
  });

  it("sem tipologiaId, o custo de comissão continua incidindo sobre todas as vendas do cenário (comportamento original)", async () => {
    const { cenarioId, categoriaComissaoId } = await cadastrarComDuasTipologias();

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaComissaoId, percentual: "0.1" },
    });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo.find((f: any) => f.mes === 1);
    // apartamento (100000) + loja (50000) = 150000 * 10%
    expect(mes1.saidas).toBe("15000.00");
  });

  it("GET /api/cenarios/:id expõe tipologiaId e tipologiaNome no custo escopado", async () => {
    const { cenarioId, lojaId, categoriaComissaoId } = await cadastrarComDuasTipologias();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaComissaoId, tipologiaId: lojaId, percentual: "0.1" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const custo = detalhe.json().custos[0];
    expect(custo.tipologiaId).toBe(lojaId);
    expect(custo.tipologiaNome).toBe("Loja");
  });

  it("rejeita tipologiaId em custo de incidência fixa (escopo só faz sentido para pct_vgv_vendido_no_mes)", async () => {
    const { cenarioId, apartamentoId, categoriaFixaId } = await cadastrarComDuasTipologias();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaFixaId, tipologiaId: apartamentoId, valorPrevisto: "1000", competenciaMes: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/tipologia/i);
  });

  it("404 para tipologiaId inexistente", async () => {
    const { cenarioId, categoriaComissaoId } = await cadastrarComDuasTipologias();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaComissaoId, tipologiaId: "id-inexistente", percentual: "0.1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("duplicar um cenário preserva o escopo por tipologia do custo de comissão", async () => {
    const { cenarioId, lojaId, categoriaComissaoId } = await cadastrarComDuasTipologias();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaComissaoId, tipologiaId: lojaId, percentual: "0.1" } });

    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    const custo = detalhe.json().custos[0];
    expect(custo.tipologiaId).toBe(lojaId);
    expect(custo.tipologiaNome).toBe("Loja");
  });
});
