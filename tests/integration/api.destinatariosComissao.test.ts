import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o split nominal de comissão (achado F13, docs/DECISOES.md): quem
 * recebe a comissão de um custo e como ela se divide — cadastro nominal
 * puro, mesmo espírito de Permuta/Distrato, nunca lido pelo motor
 * financeiro (nenhum destes testes toca /fluxo-caixa).
 */
describe("API — destinatários de comissão (split nominal)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarCenarioComCustoComissao() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Split Teste" } });
    const empreendimentoId = emp.json().id as string;
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cenarioId = cenarioRes.json().id as string;
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Comissão de vendas", tipoIncidencia: "pct_vgv_vendido_no_mes" } });
    const custoRes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, percentual: "0.06" } });
    const custoId = custoRes.json().id as string;
    return { empreendimentoId, cenarioId, custoId };
  }

  it("cadastra um destinatário nominal para um custo", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    const res = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.6" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().nome).toBe("Corretor João");
    expect(res.json().percentualSplit).toBe("0.6");
  });

  it("GET /api/cenarios/:id expõe os destinatários de cada custo", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoComissao();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.6" } });
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Imobiliária XYZ", percentualSplit: "0.4" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const custo = detalhe.json().custos.find((c: any) => c.id === custoId);
    expect(custo.destinatariosComissao).toHaveLength(2);
    expect(custo.destinatariosComissao.map((d: any) => d.nome)).toEqual(["Corretor João", "Imobiliária XYZ"]);
  });

  it("rejeita split que ultrapassa 100% do custo", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.7" } });
    const res = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Imobiliária XYZ", percentualSplit: "0.4" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/100%/);
  });

  it("aceita split que soma exatamente 100%", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.6" } });
    const res = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Imobiliária XYZ", percentualSplit: "0.4" } });
    expect(res.statusCode).toBe(201);
  });

  it("PATCH edita nome e percentual, respeitando o limite de 100% contra os demais destinatários", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    const d1 = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.5" } });
    const d2Res = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Imobiliária XYZ", percentualSplit: "0.3" } });
    const d2Id = d2Res.json().id as string;

    // d1=0.5, d2 tentando subir para 0.6 -> soma 1.1, deve rejeitar
    const rejeitado = await app.inject({ method: "PATCH", url: `/api/destinatarios-comissao/${d2Id}`, payload: { percentualSplit: "0.6" } });
    expect(rejeitado.statusCode).toBe(400);

    // d1=0.5, d2 subindo para 0.5 -> soma exatamente 1.0, deve aceitar
    const aceito = await app.inject({ method: "PATCH", url: `/api/destinatarios-comissao/${d2Id}`, payload: { percentualSplit: "0.5", nome: "Imobiliária XYZ Ltda" } });
    expect(aceito.statusCode).toBe(200);
    expect(aceito.json().nome).toBe("Imobiliária XYZ Ltda");
    expect(aceito.json().percentualSplit).toBe("0.5");
    void d1;
  });

  it("DELETE remove um destinatário", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoComissao();
    const criado = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.5" } });
    const id = criado.json().id as string;

    const del = await app.inject({ method: "DELETE", url: `/api/destinatarios-comissao/${id}` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const custo = detalhe.json().custos.find((c: any) => c.id === custoId);
    expect(custo.destinatariosComissao).toHaveLength(0);
  });

  it("usuário comum recebe 403 ao tentar excluir um destinatário", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Split Perm" } });
    const cenarioRes = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    const cat = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${emp.json().id}/categorias-custo`, payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" } });
    const custoRes = await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioRes.json().id}/custos`, payload: { categoriaId: cat.json().id, percentual: "0.05" } });
    const criado = await appAdmin.inject({ method: "POST", url: `/api/custos/${custoRes.json().id}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.5" } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/destinatarios-comissao/${criado.json().id}` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("excluir um custo com destinatários cadastrados não falha (cascade manual)", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.5" } });

    const del = await app.inject({ method: "DELETE", url: `/api/custos/${custoId}` });
    expect(del.statusCode).toBe(204);

    const restantes = await prisma.destinatarioComissao.findMany({ where: { custoId } });
    expect(restantes).toHaveLength(0);
  });

  it("duplicar um cenário preserva os destinatários de comissão do custo original", async () => {
    const { cenarioId, custoId } = await cadastrarCenarioComCustoComissao();
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Corretor João", percentualSplit: "0.6" } });
    await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "Imobiliária XYZ", percentualSplit: "0.4" } });

    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    const custoNovo = detalhe.json().custos[0];
    expect(custoNovo.destinatariosComissao).toHaveLength(2);
    expect(custoNovo.destinatariosComissao.map((d: any) => d.nome).sort()).toEqual(["Corretor João", "Imobiliária XYZ"]);
    // ids diferentes do original -- confirma que sao linhas novas, nao referencias
    const detalheOriginal = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    const idsOriginais = detalheOriginal.json().custos[0].destinatariosComissao.map((d: any) => d.id);
    const idsNovos = custoNovo.destinatariosComissao.map((d: any) => d.id);
    expect(idsNovos.some((id: string) => idsOriginais.includes(id))).toBe(false);
  });

  it("404 para custo inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/api/custos/id-inexistente/destinatarios-comissao", payload: { nome: "X", percentualSplit: "0.5" } });
    expect(res.statusCode).toBe(404);
  });

  it("rejeita nome ou percentual ausente", async () => {
    const { custoId } = await cadastrarCenarioComCustoComissao();
    const semNome = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { percentualSplit: "0.5" } });
    expect(semNome.statusCode).toBe(400);
    const semPercentual = await app.inject({ method: "POST", url: `/api/custos/${custoId}/destinatarios-comissao`, payload: { nome: "X" } });
    expect(semPercentual.statusCode).toBe(400);
  });
});
