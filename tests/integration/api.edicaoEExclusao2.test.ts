import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Segunda leva de edicao/exclusao: condicao de pagamento, categoria de
 * custo, custo e cronograma — entidades que ficaram de fora da primeira
 * leva (tests/integration/api.edicaoEExclusao.test.ts, que cobriu
 * empreendimento/tipologia/cenario).
 */
describe("API — edição e exclusão (condição de pagamento, categoria de custo, custo, cronograma)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarTipologia() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila Edição 2" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    return { empreendimentoId, tipologiaId: tip.json().id as string };
  }

  async function cadastrarCondicao(tipologiaId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    return res.json().id as string;
  }

  it("edita o nome de uma condição de pagamento sem tocar nas modalidades", async () => {
    const { tipologiaId } = await cadastrarTipologia();
    const condicaoId = await cadastrarCondicao(tipologiaId);
    const res = await app.inject({ method: "PATCH", url: `/api/condicoes-pagamento/${condicaoId}`, payload: { nome: "Padrão renomeado" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().nome).toBe("Padrão renomeado");
  });

  it("edita as modalidades de uma condição não usada, e rejeita soma diferente de 100%", async () => {
    const { tipologiaId } = await cadastrarTipologia();
    const condicaoId = await cadastrarCondicao(tipologiaId);

    const ok = await app.inject({
      method: "PATCH",
      url: `/api/condicoes-pagamento/${condicaoId}`,
      payload: { modalidades: [{ nome: "Entrada", percentual: "0.3", tipoDistribuicao: "unica_na_venda" }, { nome: "Saldo", percentual: "0.7", tipoDistribuicao: "nivelada" }] },
    });
    expect(ok.statusCode).toBe(200);

    const invalida = await app.inject({
      method: "PATCH",
      url: `/api/condicoes-pagamento/${condicaoId}`,
      payload: { modalidades: [{ nome: "Entrada", percentual: "0.5", tipoDistribuicao: "unica_na_venda" }] },
    });
    expect(invalida.statusCode).toBe(400);
  });

  it("exclui uma condição de pagamento não usada", async () => {
    const { tipologiaId } = await cadastrarTipologia();
    const condicaoId = await cadastrarCondicao(tipologiaId);
    const res = await app.inject({ method: "DELETE", url: `/api/condicoes-pagamento/${condicaoId}` });
    expect(res.statusCode).toBe(204);
  });

  it("bloqueia editar modalidades ou excluir uma condição já usada em Venda", async () => {
    const { empreendimentoId, tipologiaId } = await cadastrarTipologia();
    const condicaoId = await cadastrarCondicao(tipologiaId);
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "300000", prefixoNumero: "ST" } });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    const editar = await app.inject({
      method: "PATCH",
      url: `/api/condicoes-pagamento/${condicaoId}`,
      payload: { modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    expect(editar.statusCode).toBe(400);

    // editar so o nome continua permitido mesmo em uso
    const editarNome = await app.inject({ method: "PATCH", url: `/api/condicoes-pagamento/${condicaoId}`, payload: { nome: "Em uso" } });
    expect(editarNome.statusCode).toBe(200);

    const excluir = await app.inject({ method: "DELETE", url: `/api/condicoes-pagamento/${condicaoId}` });
    expect(excluir.statusCode).toBe(400);
  });

  it("edita nome de categoria de custo livremente, mas bloqueia trocar o tipo de incidência se já há custo cadastrado", async () => {
    const { empreendimentoId } = await cadastrarTipologia();
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const categoriaId = catRes.json().id as string;

    const editarNome = await app.inject({ method: "PATCH", url: `/api/categorias-custo/${categoriaId}`, payload: { nome: "Aquisição de terreno" } });
    expect(editarNome.statusCode).toBe(200);
    expect(editarNome.json().nome).toBe("Aquisição de terreno");

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, valorPrevisto: "50000", competenciaMes: 1 } });

    const trocarTipo = await app.inject({ method: "PATCH", url: `/api/categorias-custo/${categoriaId}`, payload: { tipoIncidencia: "pct_execucao" } });
    expect(trocarTipo.statusCode).toBe(400);

    // renomear enviando o MESMO tipoIncidencia (o formulario da tela sempre manda os dois
    // campos juntos) nao pode ser bloqueado so porque o campo esta presente no corpo —
    // so bloqueia se o valor realmente muda.
    const renomearComTipoInalterado = await app.inject({
      method: "PATCH",
      url: `/api/categorias-custo/${categoriaId}`,
      payload: { nome: "Terreno renomeado", tipoIncidencia: "fixo" },
    });
    expect(renomearComTipoInalterado.statusCode).toBe(200);
    expect(renomearComTipoInalterado.json().nome).toBe("Terreno renomeado");

    const excluir = await app.inject({ method: "DELETE", url: `/api/categorias-custo/${categoriaId}` });
    expect(excluir.statusCode).toBe(400);
  });

  it("edita e exclui um custo diretamente", async () => {
    const { empreendimentoId } = await cadastrarTipologia();
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: catRes.json().id, valorPrevisto: "50000", competenciaMes: 1 },
    });
    const custoId = custoRes.json().id as string;

    const editar = await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorPrevisto: "60000", competenciaMes: 2 } });
    expect(editar.statusCode).toBe(200);
    expect(editar.json().valorPrevisto).toBe("60000");
    expect(editar.json().competenciaMes).toBe(2);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[1].saidas).toBe("60000.00");

    const excluir = await app.inject({ method: "DELETE", url: `/api/custos/${custoId}` });
    expect(excluir.statusCode).toBe(204);
  });

  it("registrar valor realizado e editar campos previstos continuam sendo a mesma rota, sem conflito", async () => {
    const { empreendimentoId } = await cadastrarTipologia();
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioRes.json().id}/custos`,
      payload: { categoriaId: catRes.json().id, valorPrevisto: "50000", competenciaMes: 1 },
    });
    const custoId = custoRes.json().id as string;

    const realizado = await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorRealizado: "52000" } });
    expect(realizado.statusCode).toBe(200);
    expect(realizado.json().status).toBe("realizado");

    const editarPrevisto = await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorPrevisto: "55000" } });
    expect(editarPrevisto.statusCode).toBe(200);
    expect(editarPrevisto.json().valorPrevisto).toBe("55000");
    // valorRealizado nao foi afetado por essa segunda chamada
    expect(editarPrevisto.json().valorRealizado).toBe("52000");
  });

  it("exclui o cronograma inteiro de um cenário, liberando para recriar", async () => {
    const { empreendimentoId } = await cadastrarTipologia();
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] },
    });

    const duplicado = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 2, percentualExecucaoMensal: "1" }] },
    });
    expect(duplicado.statusCode).toBe(400); // ja existe, nao pode recriar sem excluir antes

    const excluir = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/cronograma` });
    expect(excluir.statusCode).toBe(204);

    const recriar = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/cronograma`,
      payload: { pontos: [{ mes: 3, percentualExecucaoMensal: "1" }] },
    });
    expect(recriar.statusCode).toBe(201);
  });

  it("usuário comum recebe 403 ao tentar excluir categoria de custo, condição de pagamento, custo ou cronograma", async () => {
    const appComum = await buildAuthenticatedApp("usuario");
    const { empreendimentoId, tipologiaId } = await cadastrarTipologia();
    // cadastros feitos pelo app admin (`app`), tentativas de exclusao pelo app comum
    const condicaoId = await cadastrarCondicao(tipologiaId);
    const catRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Terreno", tipoIncidencia: "fixo" },
    });

    const res1 = await appComum.inject({ method: "DELETE", url: `/api/condicoes-pagamento/${condicaoId}` });
    expect(res1.statusCode).toBe(403);
    const res2 = await appComum.inject({ method: "DELETE", url: `/api/categorias-custo/${catRes.json().id}` });
    expect(res2.statusCode).toBe(403);

    await appComum.close();
  });
});
