import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fechamento e hardening da Fase 1 — bug crítico encontrado na auditoria
 * técnica: excluir um empreendimento ou cenário que tem um custo com split
 * nominal de comissão (DestinatarioComissao) cadastrado falhava com
 * violação de chave estrangeira. `excluirCusto()` já limpava
 * `destinatarioComissao` antes de apagar o Custo (achado F13), mas
 * `excluirEmpreendimento()` e `excluirCenario()` — que também apagam Custo
 * em lote — nunca receberam a mesma limpeza.
 *
 * Causa raiz: nenhuma relação do schema declarava `onDelete`, então toda
 * cascata dependia de alguém lembrar de replicar a limpeza manual em TODOS
 * os lugares que apagam o pai — um padrão que já tinha causado o mesmo bug
 * 6 vezes antes (achados F10/F11/F13/F17/F21/F24) e por isso já era
 * estruturalmente frágil, não um acidente isolado.
 *
 * Correção arquitetural (não um try/catch): `DestinatarioComissao`,
 * `FaixaComissao` e `DesembolsoCusto` (filhas puras de `Custo`, sem sentido
 * de negócio independente) e `ContrapartePermuta` (filha pura de `Permuta`)
 * ganharam `onDelete: Cascade` no schema — o banco agora apaga essas linhas
 * sozinho quando o pai é apagado, eliminando esta classe de bug de vez em
 * vez de exigir lembrar de replicar `deleteMany()` em mais um lugar cada
 * vez que um novo caminho de exclusão em lote for criado.
 */
describe("API — integridade referencial (fechamento e hardening da Fase 1)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComCustoEDestinatario() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Integridade Teste" } });
    const empreendimentoId = emp.json().id as string;
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, percentual: "0.05" } });
    const custoId = custoRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.6" } });
    return { empreendimentoId, cenarioId, custoId };
  }

  it("excluir um EMPREENDIMENTO com destinatário de comissão cadastrado não falha por violação de chave estrangeira", async () => {
    const { empreendimentoId, custoId } = await cadastrarCenarioComCustoEDestinatario();

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${empreendimentoId}` });
    expect(del.statusCode).toBe(204);

    // a exclusão precisa ter arrastado o destinatário junto — nenhum órfão apontando pra um custo que não existe mais.
    const restantes = await prisma.destinatarioComissao.findMany({ where: { custoId } });
    expect(restantes).toHaveLength(0);
  });

  it("excluir um CENÁRIO com destinatário de comissão cadastrado não falha por violação de chave estrangeira", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoEDestinatario();

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}` });
    expect(del.statusCode).toBe(204);

    const restantes = await prisma.destinatarioComissao.findMany({ where: { custoId } });
    expect(restantes).toHaveLength(0);
  });

  /**
   * Segundo problema real encontrado nesta auditoria de integridade
   * referencial (independente do bug de DestinatarioComissao acima):
   * Custo.tipologiaId (escopo opcional por tipologia, achado F11) não tem
   * onDelete no schema. Reproduzido diretamente contra o Prisma: o padrão
   * implícito do Prisma para uma relação opcional sem onDelete declarado é
   * SetNull, não Restrict -- excluir a Tipologia não lança nenhum erro, só
   * zera silenciosamente Custo.tipologiaId. Isso muda o comportamento do
   * custo sem aviso: de "só incide sobre as vendas desta tipologia" para
   * "incide sobre TODAS as vendas do cenário" -- uma comissão que deveria
   * valer só para um produto passa a valer para todos, sem ninguém decidir
   * isso explicitamente. excluirTipologia() já bloqueia a exclusão se
   * houver unidade vendida/reservada (mesmo espírito); faltava o mesmo
   * bloqueio para Custo escopado.
   */
  it("excluir uma tipologia com um custo escopado a ela é bloqueado, em vez de silenciosamente remover o escopo do custo", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Integridade Tipologia" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio" } });
    const tipologiaId = tip.json().id as string;
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    const custoRes = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioRes.json().id}/custos`,
      payload: { categoriaId: cat.json().id, tipologiaId, percentual: "0.05" },
    });
    const custoId = custoRes.json().id as string;

    const del = await app.inject({ method: "DELETE", url: `/api/tipologias/${tipologiaId}` });
    expect(del.statusCode).toBe(400);
    expect(del.json().erro).toMatch(/custo/i);

    // o escopo do custo precisa continuar intacto -- não pode ter virado null silenciosamente.
    const custoDepois = await prisma.custo.findUnique({ where: { id: custoId } });
    expect(custoDepois?.tipologiaId).toBe(tipologiaId);
  });
});
