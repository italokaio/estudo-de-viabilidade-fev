import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Terceiro item da lista de candidatos (correção monetária, distrato,
 * terreno pela interface, polimento de lacunas menores): polimento de
 * quatro lacunas pequenas deixadas em aberto — edição de modalidades pela
 * tela (achado: a tela so expunha nome/percentual/tipoDistribuicao,
 * faltava periodicidadeMeses/mesFixo/repeticoesSobreTotal/geraEventoParcial
 * para pre-preencher um formulario de edicao), edicao ponto a ponto de
 * cronograma (excluir+recriar do lado do cliente, sem rota nova), estorno
 * de valor realizado (recebimento e custo), e edicao de uma permuta ja
 * registrada.
 */
describe("API — polimento (modalidades completas, estorno, editar permuta)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComTipologia() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Polimento Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "100000" } });
    return { empreendimentoId, tipologiaId: tip.json().id as string };
  }

  it("GET /api/empreendimentos/:id devolve periodicidade/mês fixo/repetições/parcial de cada modalidade (necessário para editar pela tela)", async () => {
    const { empreendimentoId, tipologiaId } = await cadastrarEmpreendimentoComTipologia();
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "Mista",
        modalidades: [
          { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
          { nome: "Reforço", percentual: "0.3", tipoDistribuicao: "periodica", periodicidadeMeses: 6 },
          { nome: "Chaves", percentual: "0.5", tipoDistribuicao: "mes_fixo", mesFixo: 24, repeticoesSobreTotal: 2 },
        ],
      },
    });

    const detalhe = await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}` });
    const modalidades = detalhe.json().tipologias[0].condicoesPagamento[0].modalidades;
    const reforco = modalidades.find((m: any) => m.nome === "Reforço");
    expect(reforco.periodicidadeMeses).toBe(6);
    expect(reforco.geraEventoParcial).toBe(false);
    const chaves = modalidades.find((m: any) => m.nome === "Chaves");
    expect(chaves.mesFixo).toBe(24);
    expect(chaves.repeticoesSobreTotal).toBe(2);
  });

  it("estorna um recebimento marcado como recebido, voltando ao status previsto", async () => {
    const { tipologiaId, empreendimentoId } = await cadastrarEmpreendimentoComTipologia();
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 } });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const recebimentos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    const recebimentoId = recebimentos[0].id as string;

    await app.inject({ method: "PATCH", url: `/api/recebimentos/${recebimentoId}`, payload: { valorRealizado: "100000" } });
    const estornado = await app.inject({ method: "PATCH", url: `/api/recebimentos/${recebimentoId}`, payload: { estornar: true } });
    expect(estornado.statusCode).toBe(200);
    expect(estornado.json().status).toBe("previsto");
    expect(estornado.json().valorRealizado).toBeNull();
  });

  it("estorna um custo marcado como realizado, voltando ao status previsto", async () => {
    const { empreendimentoId } = await cadastrarEmpreendimentoComTipologia();
    const catRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Terreno", tipoIncidencia: "fixo" } });
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 } });
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioRes.json().id}/custos`,
      payload: { categoriaId: catRes.json().id, valorPrevisto: "50000", competenciaMes: 1 },
    });
    const custoId = custoRes.json().id as string;

    await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { valorRealizado: "52000" } });
    const estornado = await app.inject({ method: "PATCH", url: `/api/custos/${custoId}`, payload: { estornar: true } });
    expect(estornado.statusCode).toBe(200);
    expect(estornado.json().status).toBe("previsto");
    expect(estornado.json().valorRealizado).toBeNull();
  });

  it("edita uma permuta já registrada (contraparte, documento, valor atribuído)", async () => {
    const { tipologiaId } = await cadastrarEmpreendimentoComTipologia();
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;
    await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "João da Silva", valorAtribuido: "90000" } });

    const editado = await app.inject({
      method: "PATCH",
      url: `/api/unidades/${unidadeId}/permuta`,
      payload: { nomeContraparte: "João Pereira da Silva", documento: "123.456.789-00", valorAtribuido: "95000" },
    });
    expect(editado.statusCode).toBe(200);
    expect(editado.json().nomeContraparte).toBe("João Pereira da Silva");
    expect(editado.json().documento).toBe("123.456.789-00");
    expect(editado.json().valorAtribuido).toBe("95000");

    const listaDepois = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    expect(listaDepois[0].status).toBe("permutada");
    expect(listaDepois[0].permuta.nomeContraparte).toBe("João Pereira da Silva");
  });

  it("rejeita editar permuta com nome vazio, e 404 para unidade sem permuta registrada", async () => {
    const { tipologiaId } = await cadastrarEmpreendimentoComTipologia();
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    const unidadeId = unidades[0].id as string;

    const semPermuta = await app.inject({ method: "PATCH", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "Alguém" } });
    expect(semPermuta.statusCode).toBe(404);

    await app.inject({ method: "POST", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "João" } });
    const nomeVazio = await app.inject({ method: "PATCH", url: `/api/unidades/${unidadeId}/permuta`, payload: { nomeContraparte: "  " } });
    expect(nomeVazio.statusCode).toBe(400);
  });
});
