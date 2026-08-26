import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { importarTesteA } from "../../src/import/importadorTesteA.js";
import { importarTesteB } from "../../src/import/importadorTesteB.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.4 — comparação de N cenários do mesmo empreendimento, escolhidos
 * livremente (GET /api/empreendimentos/:id/cenarios/comparacao), diferente
 * da comparação de 1 nível por derivação (achado F18, GET
 * /cenarios/:id/comparacao — não alterada nesta fase). Nenhuma mudança em
 * src/core: VGV/recebimentos/custos são somas diretas sobre o que o motor
 * e o banco já produzem.
 */
describe("API — comparação de cenários (Fase 2.4)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComVendas(nome: string, quantidadeUnidades: number, unidadesVendidas: number) {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "200000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: quantidadeUnidades, precoVenda: "200000", prefixoNumero: "ST" },
    });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const categoriaComissaoId = cat.json().id as string;

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: String(unidadesVendidas) }] },
    });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: categoriaComissaoId, percentual: "0.05" },
    });
    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    if (gerar.statusCode !== 200) throw new Error(`gerar-vendas falhou no setup: ${gerar.payload}`);

    return { empreendimentoId, tipologiaId, cenarioId, categoriaComissaoId };
  }

  it("agrega VGV, total de recebimentos previsto, total de custos previsto e saldo final corretamente", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoComVendas("Vila Comparação — agregação", 5, 5);
    // 5 unidades x 200.000 = 1.000.000 VGV; comissao 5% = 50.000

    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${cenarioId}` });
    expect(res.statusCode).toBe(200);
    const cenarios = res.json().cenarios;
    expect(cenarios).toHaveLength(1);
    const c = cenarios[0];
    expect(c.indicadores.vgv).toBe("1000000.00");
    expect(c.indicadores.totalRecebimentosPrevisto).toBe("1000000.00"); // à vista: recebido = vendido
    expect(c.indicadores.totalCustosPrevisto).toBe("50000.00");
    expect(c.indicadores.saldoFinal).toBe("950000.00"); // 1.000.000 - 50.000
    expect(c.fluxoMensal.length).toBe(6); // horizonteProjecaoMeses
    expect(c.premissas.velocidadeVendas.totalUnidadesPrevistas).toBe("5.00");
    expect(c.premissas.custos).toHaveLength(1);
    expect(c.premissas.custos[0].categoriaNome).toBe("Comissão");
    expect(c.premissas.custos[0].percentual).toBe("0.05");
    expect(c.premissas.cronograma).toBeNull(); // nenhum cronograma cadastrado neste cenario
    expect(c.premissas.financiamento).toBeNull();
  });

  it("cenário de outro empreendimento é ignorado silenciosamente (isolamento, R12)", async () => {
    const { empreendimentoId: empA, cenarioId: cenarioA } = await cadastrarEmpreendimentoComVendas("Empreendimento A — isolamento comparação", 5, 5);
    const { cenarioId: cenarioB } = await cadastrarEmpreendimentoComVendas("Empreendimento B — isolamento comparação", 5, 5);

    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}/cenarios/comparacao?ids=${cenarioA},${cenarioB}` });
    expect(res.statusCode).toBe(200);
    const cenarios = res.json().cenarios;
    expect(cenarios.map((c: any) => c.id)).toEqual([cenarioA]);
  });

  it("400 sem nenhum id", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila sem ids" } });
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${emp.json().id}/cenarios/comparacao` });
    expect(res.statusCode).toBe(400);
  });

  it("404 para empreendimento inexistente", async () => {
    const res = await app.inject({ method: "GET", url: "/api/empreendimentos/id-inexistente/cenarios/comparacao?ids=x" });
    expect(res.statusCode).toBe(404);
  });

  describe("permissões (achado F23, docs/DECISOES.md)", () => {
    it("vínculo 'leitura' consegue comparar cenários (é uma rota de leitura)", async () => {
      const appAdmin = await buildApp();
      const { criarUsuario } = await import("../../src/db/auth.js");
      await criarUsuario({ email: "admin-comparacao@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
      const loginAdmin = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin-comparacao@local.test", senha: "senha123" } });
      const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

      const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Comparação Permissão" } });
      const empreendimentoId = emp.json().id as string;
      const cenarioRes = await appAdmin.inject({
        method: "POST",
        url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
        headers: { cookie: cookieAdmin },
        payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
      });
      const cenarioId = cenarioRes.json().id as string;

      const usuarioComum = await criarUsuario({ email: "leitura-comparacao@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
      await appAdmin.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoId, papel: "leitura" },
      });
      const loginComum = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "leitura-comparacao@local.test", senha: "senha123" } });
      const cookieComum = loginComum.headers["set-cookie"] as string;

      const res = await appAdmin.inject({
        method: "GET",
        url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${cenarioId}`,
        headers: { cookie: cookieComum },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().cenarios).toHaveLength(1);

      await appAdmin.close();
    });
  });

  it("teste fundamental: Base -> duplicar para Otimista com premissa alterada -> motor roda -> indicadores mudam -> Base permanece intacto -> duplicar Base para Pessimista com outra premissa -> comparar os três juntos", async () => {
    // 10 unidades no total -- 5 para o cenario Base, 5 de estoque restante
    // para o cenario duplicado gerar suas proprias vendas (Venda nao e
    // copiada na duplicacao, achado F10; PremissaVelocidadeVendas e
    // copiada, entao o duplicado reaproveita a mesma premissa clonada).
    const { empreendimentoId, tipologiaId, cenarioId: baseId } = await cadastrarEmpreendimentoComVendas("Vila Teste Fundamental Cenários", 10, 5);

    // ----- Otimista: mesma premissa de velocidade/vendas, comissao MENOR (2% em vez de 5%) -----
    const dupOtimista = await app.inject({ method: "POST", url: `/api/cenarios/${baseId}/duplicar`, payload: { nome: "Otimista" } });
    const otimistaId = dupOtimista.json().id as string;
    const detalheOtimista = await app.inject({ method: "GET", url: `/api/cenarios/${otimistaId}` });
    const custoOtimistaId = detalheOtimista.json().custos[0].id as string;
    await app.inject({ method: "PATCH", url: `/api/custos/${custoOtimistaId}`, payload: { percentual: "0.02" } });
    const gerarOtimista = await app.inject({ method: "POST", url: `/api/cenarios/${otimistaId}/gerar-vendas` });
    expect(gerarOtimista.statusCode).toBe(200); // ainda ha 5 unidades de estoque

    const comparacaoBaseOtimista = await app.inject({
      method: "GET",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${baseId},${otimistaId}`,
    });
    expect(comparacaoBaseOtimista.statusCode).toBe(200);
    const [baseAntes, otimista] = comparacaoBaseOtimista.json().cenarios;
    expect(baseAntes.indicadores.vgv).toBe("1000000.00");
    expect(otimista.indicadores.vgv).toBe("1000000.00"); // mesmo VGV -- so o custo mudou
    expect(baseAntes.indicadores.totalCustosPrevisto).toBe("50000.00"); // 5%
    expect(otimista.indicadores.totalCustosPrevisto).toBe("20000.00"); // 2%
    expect(Number(otimista.indicadores.saldoFinal)).toBeGreaterThan(Number(baseAntes.indicadores.saldoFinal));
    expect(Number(otimista.indicadores.vpl)).toBeGreaterThan(Number(baseAntes.indicadores.vpl));

    // ----- Base permanece intacto -----
    const baseDepois = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${baseId}` });
    expect(baseDepois.json().cenarios[0].indicadores.totalCustosPrevisto).toBe("50000.00");

    // ----- Pessimista: derivado de Base, com financiamento de producao adicionado (premissa diferente da comissao usada no Otimista) -----
    const dupPessimista = await app.inject({ method: "POST", url: `/api/cenarios/${baseId}/duplicar`, payload: { nome: "Pessimista" } });
    const pessimistaId = dupPessimista.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${pessimistaId}/financiamento`,
      payload: { valorContratado: "300000", taxaJurosMensal: "0.02", mesAmortizacao: 5 },
    });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${pessimistaId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] },
    });

    const comparacaoCompleta = await app.inject({
      method: "GET",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${baseId},${otimistaId},${pessimistaId}`,
    });
    expect(comparacaoCompleta.statusCode).toBe(200);
    const tresVersoes = comparacaoCompleta.json().cenarios;
    expect(tresVersoes.map((c: any) => c.nome).sort()).toEqual(["Base", "Otimista", "Pessimista"]);
    const pessimista = tresVersoes.find((c: any) => c.nome === "Pessimista");
    expect(pessimista.premissas.financiamento).not.toBeNull();
    expect(pessimista.premissas.financiamento.valorContratado).toBe("300000");
    expect(pessimista.premissas.cronograma).not.toBeNull();
    // financiamento libera capital conforme a curva do cronograma -- a
    // liberacao entra como entrada extra, alterando o saldo final em
    // relacao ao Base (mesma comissao 5%, sem financiamento).
    const baseFinal = tresVersoes.find((c: any) => c.nome === "Base");
    expect(pessimista.indicadores.saldoFinal).not.toBe(baseFinal.indicadores.saldoFinal);

    // sanity: nao usa tipologiaId de outro empreendimento por engano
    expect(tipologiaId).toBeTruthy();
  });

  it("genericidade: funciona para empreendimentos fictícios (não só Splendido)", async () => {
    const { empreendimentoId: empA, cenarioId: cenarioA } = await importarTesteA();
    const { empreendimentoId: empB, cenarioId: cenarioB } = await importarTesteB();

    const resA = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}/cenarios/comparacao?ids=${cenarioA}` });
    expect(resA.statusCode).toBe(200);
    expect(resA.json().cenarios).toHaveLength(1);

    const resB = await app.inject({ method: "GET", url: `/api/empreendimentos/${empB}/cenarios/comparacao?ids=${cenarioB}` });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().cenarios).toHaveLength(1);

    // cada empreendimento so ve o seu proprio cenario, mesmo pedindo os dois ids no mesmo empreendimento
    const resCruzado = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}/cenarios/comparacao?ids=${cenarioA},${cenarioB}` });
    expect(resCruzado.json().cenarios.map((c: any) => c.id)).toEqual([cenarioA]);
  });
});
