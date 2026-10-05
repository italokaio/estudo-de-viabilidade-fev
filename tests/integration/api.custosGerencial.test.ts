import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.2 — visão gerencial de Custos (achado F31, docs/DECISOES.md):
 * PREVISTO/REALIZADO/SALDO/DESVIO por custo (/custos-resumo), distribuição
 * mensal por custo (/distribuicao-mensal), o recálculo do motor logo após
 * criar/editar um custo, a correção de permissão em DELETE /api/custos/:id,
 * e o teste fundamental de integração pedido: criar custo -> motor roda ->
 * fluxo de caixa reflete -> necessidade de capital reflete -> nenhuma
 * duplicata em DesembolsoCusto (não existe MovimentoCaixa neste sistema —
 * o fluxo de caixa nunca é persistido, sempre recalculado, achado F1).
 */
describe("API — visão gerencial de custos (Fase 2.2)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComVendas(nomeEmpreendimento = "Vila Custo Gerencial") {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: nomeEmpreendimento } });
    const empreendimentoId = emp.json().id as string;

    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "ST" },
    });
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

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "4" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { empreendimentoId, cenarioId, tipologiaId };
  }

  it("custos-resumo calcula previsto/realizado/saldo/desvio para um custo fixo, antes e depois de marcar realizado", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const categoriaId = cat.json().id as string;
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId, valorPrevisto: "500000", competenciaMes: 1, recorrencia: "unico" },
    });
    const custoId = custoRes.json().id as string;

    const resumo1 = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` })).json();
    const linha1 = resumo1.find((r: any) => r.id === custoId);
    expect(linha1.totalPrevisto).toBe("500000.00");
    expect(linha1.totalRealizado).toBe("0.00");
    expect(linha1.saldoARealizar).toBe("500000.00");
    expect(linha1.desvio).toBe("-500000.00");
    expect(linha1.desvioPercentual).toBe("-100.00");

    await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorRealizado: "520000" } });

    const resumo2 = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` })).json();
    const linha2 = resumo2.find((r: any) => r.id === custoId);
    expect(linha2.totalRealizado).toBe("520000.00");
    expect(linha2.saldoARealizar).toBe("-20000.00");
    expect(linha2.desvio).toBe("20000.00");
    expect(linha2.desvioPercentual).toBe("4.00");
  });

  it("custos-resumo soma o previsto de um custo percentual a partir dos desembolsos calculados pelo motor", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const categoriaId = cat.json().id as string;
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0.05" } });
    const custoId = custoRes.json().id as string;

    // 4 unidades x 300.000 = 1.200.000 vendido no mes 1 -> 5% = 60.000
    const resumo = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` })).json();
    const linha = resumo.find((r: any) => r.id === custoId);
    expect(linha.totalPrevisto).toBe("60000.00");
    expect(linha.totalRealizado).toBe("0.00");

    const desembolsos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/desembolsos-custos` })).json();
    const desembolsoId = desembolsos.find((d: any) => d.custoId === custoId).id as string;
    await app.inject({ method: "PATCH", url: `/api/desembolsos-custos/${desembolsoId}`, payload: { valorRealizado: "60000" } });

    const resumo2 = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` })).json();
    expect(resumo2.find((r: any) => r.id === custoId).totalRealizado).toBe("60000.00");
  });

  it("distribuicao-mensal: custo fixo não é granular (realizado agregado); custo percentual é granular por mês", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();

    const catFixo = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Manutenção", tipoIncidencia: "fixo" },
    });
    const custoFixo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: catFixo.json().id, valorPrevisto: "10000", competenciaMes: 1, recorrencia: "mensal" },
    });
    const distribFixo = (await app.inject({ method: "GET", url: `/api/custos/${custoFixo.json().id}/distribuicao-mensal` })).json();
    expect(distribFixo.granular).toBe(false);
    expect(distribFixo.realizadoPorMes).toEqual([]);
    // recorrencia mensal: um desembolso previsto por mes do horizonte, todos de 10000
    expect(distribFixo.meses.length).toBe(12);
    expect(distribFixo.meses.every((m: any) => m.valorPrevisto === "10000")).toBe(true);

    const catPct = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custoPct = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: catPct.json().id, percentual: "0.05" } });
    const distribPct = (await app.inject({ method: "GET", url: `/api/custos/${custoPct.json().id}/distribuicao-mensal` })).json();
    expect(distribPct.granular).toBe(true);
    expect(distribPct.realizadoPorMes.length).toBe(1);
    expect(distribPct.realizadoPorMes[0].status).toBe("previsto");
  });

  it("DELETE /api/custos/:id continua exigindo papel admin, e passa a chamar garantirAcesso (achado F31)", async () => {
    // A checagem `papel !== "admin"` (pré-existente) já bloqueia qualquer
    // usuário não-admin antes de garantirAcesso ser alcançado -- e, no
    // modelo binário admin/usuário atual, um admin sempre tem nivelAcesso
    // "admin" para qualquer empreendimento (src/db/auth.ts,
    // nivelAcessoEmpreendimento), então garantirAcesso nunca nega um admin.
    // Por isso a correção é estrutural/consistência com o resto das rotas
    // de custo (todas chamam garantirAcesso), não uma mudança de
    // comportamento observável hoje -- mesma conclusão já registrada no
    // relatório de hardening da Fase 1 para este padrão. Este teste
    // confirma a regressão mais simples: exclusão por um admin continua
    // funcionando normalmente com a chamada adicional no meio do caminho.
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const custo = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: cat.json().id, valorPrevisto: "100000", competenciaMes: 1 },
    });
    const custoId = custo.json().id as string;

    // buildAuthenticatedApp() sobrescreve app.inject para sempre injetar o
    // cookie do admin, mesmo se outro `headers.cookie` for passado -- por
    // isso este teste precisa de uma instancia crua (mesmo padrao de
    // api.vendas.test.ts, describe("permissoes")) para logar como um
    // usuario comum de verdade.
    const appCru = await buildApp();
    const { criarUsuario } = await import("../../src/db/auth.js");
    await criarUsuario({ email: "usuario-comum-custos@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginComum = await appCru.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario-comum-custos@local.test", senha: "senha123" } });
    const cookieComum = loginComum.headers["set-cookie"] as string;

    const negado = await appCru.inject({ method: "DELETE", url: `/api/custos/${custoId}`, headers: { cookie: cookieComum } });
    expect(negado.statusCode).toBe(403);
    expect(await prisma.custo.findUnique({ where: { id: custoId } })).not.toBeNull();
    await appCru.close();

    const permitido = await app.inject({ method: "DELETE", url: `/api/custos/${custoId}` });
    expect(permitido.statusCode).toBe(204);
    expect(await prisma.custo.findUnique({ where: { id: custoId } })).toBeNull();
  });

  it("isolamento A×B: custo criado em A não aparece no resumo de B, nem altera a necessidade de capital de B", async () => {
    const { empreendimentoId: empA, cenarioId: cenarioA } = await cadastrarCenarioComVendas("Empreendimento A — isolamento custos");
    const { cenarioId: cenarioB } = await cadastrarCenarioComVendas("Empreendimento B — isolamento custos");

    const fluxoBAntes = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioB}/fluxo-caixa` })).json();

    const catA = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empA}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioA}/custos`,
      payload: { categoriaId: catA.json().id, valorPrevisto: "900000", competenciaMes: 1 },
    });

    const resumoB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioB}/custos-resumo` })).json();
    expect(resumoB.length).toBe(0);

    const fluxoBDepois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioB}/fluxo-caixa` })).json();
    expect(fluxoBDepois.indicadores.necessidadeMaximaCapital).toBe(fluxoBAntes.indicadores.necessidadeMaximaCapital);
    expect(fluxoBDepois.fluxo).toEqual(fluxoBAntes.fluxo);
  });

  it("teste fundamental: criar custo -> motor roda -> fluxo de caixa reflete -> necessidade de capital reflete -> sem duplicar DesembolsoCusto em recálculos repetidos", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComVendas();
    const fluxoAntes = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();

    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    // percentual deliberadamente alto (200%) para que a saida supere a
    // entrada NO MESMO MES (vendas e comissao caem ambas no mes 1 neste
    // cenario de teste) e realmente produza necessidade de capital > 0 --
    // o objetivo aqui e provar a fiacao custo->motor->fluxo->indicador, nao
    // uma premissa realista de comissao.
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, percentual: "2" } });
    const custoId = custoRes.json().id as string;

    const fluxoDepois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    expect(fluxoDepois.fluxo[0].saidas).toBe("2400000.00"); // 200% de 1.200.000
    expect(Number(fluxoDepois.indicadores.necessidadeMaximaCapital)).not.toBe(Number(fluxoAntes.indicadores.necessidadeMaximaCapital));
    expect(fluxoDepois.indicadores.necessidadeMaximaCapital).toBe("1200000.00");

    // edita o percentual duas vezes seguidas -- cada PATCH recalcula o motor
    // (rodarMotorParaCenario), e persistirDesembolsosCusto faz upsert por
    // (custoId, mes): recalcular repetidas vezes nao pode duplicar linhas.
    await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { percentual: "0.08" } });
    await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { percentual: "0.08" } });
    const desembolsos = await prisma.desembolsoCusto.findMany({ where: { custoId } });
    expect(desembolsos.length).toBe(1);
    expect(desembolsos[0]!.valorPrevisto).toBe("96000"); // 8% de 1.200.000

    // este sistema nunca persiste um MovimentoCaixa -- o fluxo de caixa e
    // sempre recalculado, nunca uma segunda fonte de verdade (achado F1).
    expect((prisma as any).movimentoCaixa).toBeUndefined();
  });
});
