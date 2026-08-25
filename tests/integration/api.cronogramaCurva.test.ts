import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.3 — curva combinada do cronograma físico-financeiro
 * (/cronograma-curva, montarCurvaCronogramaDoCenario + calcularCurvaCronograma,
 * docs/DECISOES.md — a definir). Cobre a agregação em si (percentual
 * acumulado, desembolso mensal/acumulado) e o teste fundamental pedido:
 * cronograma -> motor -> desembolsos -> fluxo de caixa -> necessidade de
 * capital, incluindo o caso em que a MESMA soma de custo distribuída em
 * meses diferentes muda a necessidade de capital porque muda a posição da
 * curva de obra em relação à curva de vendas.
 */
describe("API — curva do cronograma físico-financeiro (Fase 2.3)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComCenario(nome: string, horizonteProjecaoMeses = 6) {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome } });
    const empreendimentoId = emp.json().id as string;

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses },
    });
    const cenarioId = cenarioRes.json().id as string;

    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Obra", tipoIncidencia: "pct_execucao" },
    });
    const categoriaObraId = cat.json().id as string;

    return { empreendimentoId, cenarioId, categoriaObraId };
  }

  it("cronograma-curva acumula percentual físico e desembolso financeiro de um custo pct_execucao", async () => {
    const { cenarioId, categoriaObraId } = await cadastrarEmpreendimentoComCenario("Vila Cronograma Curva");
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaObraId, valorPrevisto: "1000000" },
    });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: {
        pontos: [
          { mes: 1, percentualExecucaoMensal: "0.5" },
          { mes: 2, percentualExecucaoMensal: "0.3" },
          { mes: 3, percentualExecucaoMensal: "0.2" },
        ],
      },
    });

    const curva = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/cronograma-curva` })).json();
    expect(curva.pontos).toEqual([
      { mes: 1, percentualExecucaoMensal: "0.5", percentualAcumulado: "0.5", desembolsoMensal: "500000.00", desembolsoAcumulado: "500000.00" },
      { mes: 2, percentualExecucaoMensal: "0.3", percentualAcumulado: "0.8", desembolsoMensal: "300000.00", desembolsoAcumulado: "800000.00" },
      { mes: 3, percentualExecucaoMensal: "0.2", percentualAcumulado: "1", desembolsoMensal: "200000.00", desembolsoAcumulado: "1000000.00" },
    ]);
  });

  it("cronograma-curva ignora desembolsos de custos que não são pct_execucao", async () => {
    const { empreendimentoId, cenarioId, categoriaObraId } = await cadastrarEmpreendimentoComCenario("Vila Cronograma Curva — filtro de incidência");
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaObraId, valorPrevisto: "1000000" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });

    const catFixo = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Publicidade", tipoIncidencia: "fixo" },
    });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: catFixo.json().id, valorPrevisto: "999999", competenciaMes: 1 },
    });

    const curva = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/cronograma-curva` })).json();
    expect(curva.pontos).toEqual([{ mes: 1, percentualExecucaoMensal: "1", percentualAcumulado: "1", desembolsoMensal: "1000000.00", desembolsoAcumulado: "1000000.00" }]);
  });

  it("teste fundamental: mudar o cronograma recalcula os desembolsos, o fluxo de caixa e a necessidade máxima de capital", async () => {
    const { empreendimentoId, cenarioId, categoriaObraId } = await cadastrarEmpreendimentoComCenario("Vila Cronograma Fundamental");

    // vendas geram uma unica entrada de 1.200.000 no mes 3 -- a posicao da
    // curva de obra (antes ou depois do mes 3) e o que decide se a
    // necessidade de capital aparece ou nao.
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 3, unidadesPrevistas: "4" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: categoriaObraId, valorPrevisto: "1200000" } });

    // cronograma A: obra inteira no mes 1, antes da entrada do mes 3 --
    // gera necessidade de capital de 1.200.000 (nenhuma entrada ainda).
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });
    const fluxoA = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    expect(fluxoA.indicadores.necessidadeMaximaCapital).toBe("1200000.00");
    const desembolsosA = await prisma.desembolsoCusto.findMany({ where: { custo: { cenarioId } } });
    expect(desembolsosA.map((d) => d.mes)).toEqual([1]);

    // cronograma B: obra inteira no mes 4, depois da entrada do mes 3 --
    // a venda ja cobriu o caixa antes da obra comecar, necessidade de
    // capital cai para zero. Mesma soma de custo (1.200.000), curva diferente.
    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/cronograma` });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 4, percentualExecucaoMensal: "1" }] } });
    const fluxoB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    expect(fluxoB.indicadores.necessidadeMaximaCapital).toBe("0.00");
    expect(fluxoB.indicadores.necessidadeMaximaCapital).not.toBe(fluxoA.indicadores.necessidadeMaximaCapital);
    const desembolsosB = await prisma.desembolsoCusto.findMany({ where: { custo: { cenarioId } } });
    expect(desembolsosB.map((d) => d.mes)).toEqual([4]);

    // a curva combinada reflete a mesma mudanca.
    const curvaB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/cronograma-curva` })).json();
    expect(curvaB.pontos).toEqual([{ mes: 4, percentualExecucaoMensal: "1", percentualAcumulado: "1", desembolsoMensal: "1200000.00", desembolsoAcumulado: "1200000.00" }]);
  });

  it("isolamento A×B: cronograma cadastrado em A não aparece na curva de B", async () => {
    const { cenarioId: cenarioA, categoriaObraId: categoriaA } = await cadastrarEmpreendimentoComCenario("Empreendimento A — isolamento cronograma");
    const { cenarioId: cenarioB } = await cadastrarEmpreendimentoComCenario("Empreendimento B — isolamento cronograma");

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioA}/custos`, payload: { categoriaId: categoriaA, valorPrevisto: "1000000" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioA}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });

    const curvaB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioB}/cronograma-curva` })).json();
    expect(curvaB.pontos).toEqual([]);
  });

  it("404 para cenário inexistente", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cenarios/inexistente/cronograma-curva" });
    expect(res.statusCode).toBe(404);
  });

  describe("permissões (achado F23, docs/DECISOES.md)", () => {
    it("vínculo 'leitura' bloqueia POST/DELETE de cronograma com 403, mas GET /cronograma-curva funciona", async () => {
      const appAdmin = await buildApp();
      const { criarUsuario } = await import("../../src/db/auth.js");
      await criarUsuario({ email: "admin-cronograma@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
      const loginAdmin = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin-cronograma@local.test", senha: "senha123" } });
      const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

      const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Cronograma Permissão" } });
      const empreendimentoId = emp.json().id as string;
      const cenarioRes = await appAdmin.inject({
        method: "POST",
        url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
        headers: { cookie: cookieAdmin },
        payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
      });
      const cenarioId = cenarioRes.json().id as string;

      const usuarioComum = await criarUsuario({ email: "leitura-cronograma@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
      await appAdmin.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoId, papel: "leitura" },
      });
      const loginComum = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "leitura-cronograma@local.test", senha: "senha123" } });
      const cookieComum = loginComum.headers["set-cookie"] as string;

      const post = await appAdmin.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/cronograma`,
        headers: { cookie: cookieComum },
        payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] },
      });
      expect(post.statusCode).toBe(403);

      const del = await appAdmin.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/cronograma`, headers: { cookie: cookieComum } });
      expect(del.statusCode).toBe(403);

      const get = await appAdmin.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/cronograma-curva`, headers: { cookie: cookieComum } });
      expect(get.statusCode).toBe(200);
      expect(get.json().pontos).toEqual([]);

      await appAdmin.close();
    });
  });
});
