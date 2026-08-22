import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a comissão paga na curva de recebimento (achado F25,
 * docs/DECISOES.md): tipoIncidencia="pct_recebido_no_mes" gera a comissão
 * proporcionalmente a cada parcela projetada de RecebimentoProjetado, no
 * mesmo mês dela — diferente de pct_vgv_vendido_no_mes (tudo de uma vez no
 * mês da venda) e de pct_recebido_mes_anterior (agregado do cenário
 * inteiro, defasado em um mês, sem saber de qual venda veio).
 */
describe("API — comissão paga na curva de recebimento (achado F25)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Venda de R$200.000 no mês 1, paga em duas parcelas: 40% no mês 1, 60% no mês 6. */
  async function cadastrarVendaParcelada() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Comissão Curva Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "200000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "200000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "Entrada + saldo",
        modalidades: [
          { nome: "Entrada", percentual: "0.4", tipoDistribuicao: "mes_fixo", mesFixo: 1 },
          { nome: "Saldo", percentual: "0.6", tipoDistribuicao: "mes_fixo", mesFixo: 6 },
        ],
      },
    });
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Comissão", tipoIncidencia: "pct_recebido_no_mes" } });
    const categoriaId = cat.json().id as string;

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { empreendimentoId, cenarioId, tipologiaId, categoriaId };
  }

  it("a comissão acompanha cada parcela recebida, no mesmo mês dela — não tudo de uma vez no mês da venda", async () => {
    const { cenarioId, categoriaId } = await cadastrarVendaParcelada();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0.1" } });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo.find((f: any) => f.mes === 1);
    const mes6 = fluxo.json().fluxo.find((f: any) => f.mes === 6);
    // mes1: 200000 * 40% * 10% = 8000; mes6: 200000 * 60% * 10% = 12000
    expect(mes1.saidas).toBe("8000.00");
    expect(mes6.saidas).toBe("12000.00");
  });

  it("escopado a uma tipologia, incide só sobre as vendas daquela tipologia (mesmo mecanismo do achado F11)", async () => {
    const { empreendimentoId, cenarioId, tipologiaId, categoriaId } = await cadastrarVendaParcelada();
    const outraTip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Loja", precoUnitarioPadrao: "50000" },
    });
    const outraTipId = outraTip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${outraTipId}/unidades`, payload: { quantidade: 1, precoVenda: "50000", prefixoNumero: "LJ" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${outraTipId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId: outraTipId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, tipologiaId, percentual: "0.1" } });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes1 = fluxo.json().fluxo.find((f: any) => f.mes === 1);
    // so a parcela do Studio (200000*40%=80000) entra na base -- a Loja (50000, a vista) e ignorada por este custo escopado.
    expect(mes1.saidas).toBe("8000.00");
  });

  it("sem tipologiaId, continua incidindo sobre todas as vendas do cenário", async () => {
    const { cenarioId, categoriaId } = await cadastrarVendaParcelada();
    const semTipologia = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0.1" } });
    expect(semTipologia.statusCode).toBe(201);
    expect(semTipologia.json().tipologiaId).toBeNull();
  });

  it("as parcelas de comissão por curva de recebimento podem ser marcadas como realizadas (achado F21)", async () => {
    const { cenarioId, categoriaId } = await cadastrarVendaParcelada();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0.1" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    expect(lista).toHaveLength(2);
    const doMes1 = lista.find((d: any) => d.mes === 1);
    expect(doMes1.valorPrevisto).toBe("8000");

    const patch = await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${doMes1.id}`, payload: { valorRealizado: "7800" } });
    expect(patch.statusCode).toBe(200);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo.find((f: any) => f.mes === 1).saidasRealizadas).toBe("7800.00");
  });
});
