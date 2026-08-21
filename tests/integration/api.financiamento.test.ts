import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o financiamento de producao pela API (achado F8, docs/DECISOES.md):
 * diferente de indice de correcao/sensibilidade, financiamento MUDA o
 * fluxo de caixa de verdade -- liberacoes (via cronograma) e amortizacao
 * entram na consolidacao real, refletidas em entradas/saidas/indicadores.
 */
describe("API — financiamento de produção", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com custo de obra (100000, mês 1) e cronograma 50%/50% (meses 1 e 2), horizonte 4. */
  async function cadastrarCenarioComCustoECronograma() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Financiamento Teste" } });
    const empreendimentoId = emp.json().id as string;
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 4 } });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "100000", competenciaMes: 1 } });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "0.5" }, { mes: 2, percentualExecucaoMensal: "0.5" }] },
    });
    return { empreendimentoId, cenarioId };
  }

  it("GET /api/cenarios/:id devolve financiamento=null quando nenhum foi cadastrado", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(res.json().financiamento).toBeNull();
  });

  it("POST cadastra o financiamento e reduz a necessidade máxima de capital durante a obra", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    const antes = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const necessidadeAntes = Number(antes.json().indicadores.necessidadeMaximaCapital);

    // mesAmortizacao alem do horizonte (4 meses): isola o efeito de reducao
    // do pico durante a construcao, sem misturar com o pagamento do
    // financiamento (que precisaria de receita de venda para nao apenas
    // adiar o problema -- ver tests/core/motorFinanceiro.financiamento.test.ts).
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valorContratado).toBe("100000");

    const depois = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const necessidadeDepois = Number(depois.json().indicadores.necessidadeMaximaCapital);
    expect(necessidadeDepois).toBeLessThan(necessidadeAntes);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().financiamento.mesAmortizacao).toBe(5);
  });

  it("fluxo-caixa devolve a série de liberação/amortização/saldo devedor por mês", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 4 },
    });
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const financiamento = res.json().financiamento;
    expect(financiamento).toHaveLength(4);
    expect(financiamento[0].liberacao).toBe("50000.00");
    expect(financiamento[1].liberacao).toBe("50000.00");
    expect(financiamento[3].amortizacao).toBe("100000.00");
  });

  it("POST de novo atualiza o financiamento existente em vez de duplicar", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "100000", taxaJurosMensal: "0.01", mesAmortizacao: 4 } });
    const segunda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "150000", taxaJurosMensal: "0.02", mesAmortizacao: 5 } });
    expect(segunda.json().valorContratado).toBe("150000");

    const total = await prisma.financiamentoProducao.count({ where: { cenarioId } });
    expect(total).toBe(1);
  });

  it("rejeita valores inválidos", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    const semValor = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { taxaJurosMensal: "0.01", mesAmortizacao: 4 } });
    expect(semValor.statusCode).toBe(400);
    const mesInvalido = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "100000", taxaJurosMensal: "0.01", mesAmortizacao: 0 } });
    expect(mesInvalido.statusCode).toBe(400);
  });

  it("DELETE remove o financiamento — o cenário volta a não ter financiamento", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 4 } });
    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/financiamento` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().financiamento).toBeNull();
  });

  it("usuário comum recebe 403 ao tentar excluir o financiamento", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Financiamento Perm" } });
    const cenarioRes = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 4 } });
    const cenarioId = cenarioRes.json().id as string;
    await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 4 } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/financiamento` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar cadastrar financiamento", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.financ@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.financ@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;
    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Financiamento Sem Vínculo" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 4 },
    });

    await criarUsuario({ email: "usuario.financ@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.financ@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioRes.json().id}/financiamento`,
      headers: { cookie: cookieUsuario },
      payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 4 },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });

  /**
   * Tabela de amortização SAC/Price (achado F16, docs/DECISOES.md):
   * alternativas ao pagamento único, com parcelas ao longo de vários meses.
   */
  it("cadastra financiamento com amortização SAC e a série de fluxo mostra parcelas decrescentes", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "SAC Teste" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 5 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });

    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "120000", taxaJurosMensal: "0.01", mesAmortizacao: 2, tipoAmortizacao: "sac", numeroParcelas: 4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tipoAmortizacao).toBe("sac");
    expect(res.json().numeroParcelas).toBe(4);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const financiamento = fluxo.json().financiamento;
    // 4 parcelas de 30000 de principal cada (120000/4); parcela total decresce mes a mes
    expect(Number(financiamento[1].amortizacao)).toBeGreaterThan(Number(financiamento[2].amortizacao));
    expect(Number(financiamento[2].amortizacao)).toBeGreaterThan(Number(financiamento[3].amortizacao));
    // ultima parcela (mes 5, indice 4) zera o saldo devedor
    expect(financiamento[4].saldoDevedor).toBe("0.00");
  });

  it("cadastra financiamento com amortização Price e todas as parcelas têm o mesmo valor", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Price Teste" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 5 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "120000", taxaJurosMensal: "0.01", mesAmortizacao: 2, tipoAmortizacao: "price", numeroParcelas: 4 },
    });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const parcelas = fluxo.json().financiamento.slice(1, 5).map((f: any) => f.amortizacao);
    expect(new Set(parcelas).size).toBe(1); // todas as parcelas identicas
  });

  it("rejeita SAC/Price sem numeroParcelas, e tipoAmortizacao inválido", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    const semParcelas = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "100000", taxaJurosMensal: "0.01", mesAmortizacao: 4, tipoAmortizacao: "sac" },
    });
    expect(semParcelas.statusCode).toBe(400);

    const tipoInvalido = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "100000", taxaJurosMensal: "0.01", mesAmortizacao: 4, tipoAmortizacao: "bullet" },
    });
    expect(tipoInvalido.statusCode).toBe(400);
  });

  it("sem tipoAmortizacao, continua se comportando como pagamento único (compatibilidade retroativa)", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoECronograma();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 4 },
    });
    expect(res.json().tipoAmortizacao).toBe("unico");
    expect(res.json().numeroParcelas).toBeNull();
  });

  it("duplicar um cenário preserva a tabela de amortização configurada", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "SAC Duplicar" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 5 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/financiamento`,
      payload: { valorContratado: "120000", taxaJurosMensal: "0.01", mesAmortizacao: 2, tipoAmortizacao: "sac", numeroParcelas: 4 },
    });

    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    expect(detalhe.json().financiamento.tipoAmortizacao).toBe("sac");
    expect(detalhe.json().financiamento.numeroParcelas).toBe(4);
  });
});
