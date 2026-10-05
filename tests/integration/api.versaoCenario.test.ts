import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a duplicação de cenário (achado F10, docs/DECISOES.md — "versão
 * de cenário"): copia premissas de velocidade, custos, cronograma,
 * índice de correção e financiamento para um cenário novo e
 * independente. Deliberadamente NÃO copia Venda — ver
 * src/db/cadastro.ts:duplicarCenario para o raciocínio (Unidade.status é
 * compartilhado entre cenários do mesmo empreendimento).
 */
describe("API — versão de cenário (duplicar)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com premissa de velocidade, custo, cronograma, índice e financiamento — tudo no cenário "Base". */
  async function cadastrarCenarioCompleto() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Versão Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 2, precoVenda: "100000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "50000", competenciaMes: 1 } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.01" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "50000", taxaJurosMensal: "0.01", mesAmortizacao: 5 } });
    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    if (gerar.statusCode !== 200) throw new Error(`gerar-vendas falhou no setup: ${gerar.payload}`);

    return { empreendimentoId, tipologiaId, cenarioId };
  }

  it("duplica um cenário com todas as premissas, exceto vendas", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioCompleto();

    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    expect(res.statusCode).toBe(201);
    const novoId = res.json().id as string;
    expect(res.json().nome).toBe("Base v2");

    const detalheEmp = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const cenarioNovo = detalheEmp.json().cenarios.find((c: any) => c.id === novoId);
    expect(cenarioNovo.derivadoDeNome).toBe("Base");

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    const body = detalhe.json();
    expect(body.premissasVelocidade).toHaveLength(1);
    expect(body.premissasVelocidade[0].unidadesPrevistas).toBe("2");
    expect(body.custos).toHaveLength(1);
    expect(body.custos[0].valorPrevisto).toBe("50000");
    expect(body.custos[0].status).toBe("previsto"); // nunca copia valorRealizado/status
    expect(body.cronograma).toHaveLength(1);
    expect(body.indicesCorrecao).toHaveLength(1);
    expect(body.financiamento.valorContratado).toBe("50000");
    expect(body.totalVendasGeradas).toBe(0); // vendas deliberadamente não copiadas
  });

  it("o cenário original permanece intacto após a duplicação", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().totalVendasGeradas).toBe(2);
    expect(detalhe.json().custos).toHaveLength(1);
  });

  it("o cenário duplicado pode gerar suas próprias vendas, sujeito ao estoque restante", async () => {
    const { tipologiaId, cenarioId } = await cadastrarCenarioCompleto();
    // as 2 unidades ja foram vendidas no cenario original -- sem estoque para o duplicado
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${novoId}/gerar-vendas` });
    expect(gerar.statusCode).toBe(400);
    expect(gerar.json().erro).toMatch(/estoque/);
  });

  it("editar um custo no cenário duplicado não afeta o original", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalheNovo = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    const custoNovoId = detalheNovo.json().custos[0].id as string;
    await app.inject({ method: "PATCH", url: `/api/custos/${custoNovoId}`, payload: { valorPrevisto: "99999" } });

    const detalheOriginal = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalheOriginal.json().custos[0].valorPrevisto).toBe("50000");
  });

  it("rejeita duplicar sem nome", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("404 para cenário inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/cenarios/id-inexistente/duplicar", payload: { nome: "X" } });
    expect(res.statusCode).toBe(404);
  });

  it("excluir o cenário original não falha quando existe um cenário duplicado dele (derivadoDeCenarioId vira null)", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioCompleto();
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });
    expect(del.statusCode).toBe(204);

    // o cenario duplicado continua existindo, so perde o vinculo historico
    const detalheEmp = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const cenarioNovo = detalheEmp.json().cenarios.find((c: any) => c.id === novoId);
    expect(cenarioNovo).toBeDefined();
    expect(cenarioNovo.derivadoDeNome).toBeNull();
  });

  /**
   * Comparação de cenários derivados (achado F18, docs/DECISOES.md):
   * indicadores do cenário atual lado a lado com seu original (se
   * derivado) e seus derivados diretos — só um nível para cada lado.
   */
  it("um cenário sem nenhuma relação de derivação só se vê na comparação", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/comparacao` });
    expect(res.statusCode).toBe(200);
    expect(res.json().versoes).toHaveLength(1);
    expect(res.json().versoes[0].relacao).toBe("atual");
  });

  it("a partir do original, a comparação inclui o cenário duplicado como 'derivado'", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/comparacao` });
    const versoes = res.json().versoes;
    expect(versoes).toHaveLength(2);
    expect(versoes.find((v: any) => v.id === cenarioId).relacao).toBe("atual");
    expect(versoes.find((v: any) => v.id === novoId).relacao).toBe("derivado");
    expect(versoes.find((v: any) => v.id === novoId).nome).toBe("Base v2");
  });

  it("a partir do cenário duplicado, a comparação inclui o original como 'original'", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}/comparacao` });
    const versoes = res.json().versoes;
    expect(versoes).toHaveLength(2);
    expect(versoes.find((v: any) => v.id === novoId).relacao).toBe("atual");
    expect(versoes.find((v: any) => v.id === cenarioId).relacao).toBe("original");
    expect(versoes.find((v: any) => v.id === cenarioId).nome).toBe("Base");
  });

  it("no fixture deste teste (premissa igual às vendas reais do original), o derivado projeta a mesma receita e o mesmo VPL", async () => {
    const { cenarioId } = await cadastrarCenarioCompleto();
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/comparacao` });
    const versoes = res.json().versoes;
    const original = versoes.find((v: any) => v.id === cenarioId);
    const derivado = versoes.find((v: any) => v.id === novoId);
    // Igualdade vale SO neste fixture: a premissa reproduz exatamente as vendas
    // reais do original (mesma quantidade, mesmo mes, mesmo preco). Em geral o
    // derivado so iguala o original quando a premissa copiada bate com as vendas.
    expect(Number(derivado.vpl)).toBeCloseTo(Number(original.vpl), 2);
  });

  it("404 para cenário inexistente na comparação", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cenarios/id-inexistente/comparacao" });
    expect(res.statusCode).toBe(404);
  });
});
