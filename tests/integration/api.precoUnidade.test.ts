import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — editar preço de venda de unidade", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appPlain: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaId: string;
  let condicaoId: string;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    appPlain = await buildApp();
    empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Preço de unidade" } })).json().id as string;
    tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000", areaPrivativaPadrao: "60" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", areaPrivativa: "60", prefixoNumero: "AP" } });
    condicaoId = (await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    })).json().id as string;
    cenarioId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } })).json().id as string;
  });

  afterAll(async () => {
    await appPlain.close();
    await app.close();
    await prisma.$disconnect();
  });

  async function unidadeComStatus(status: string) {
    return prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } }).then(async (u) => {
      if (status !== "estoque") await prisma.unidade.update({ where: { id: u.id }, data: { status } });
      return prisma.unidade.findUniqueOrThrow({ where: { id: u.id } });
    });
  }

  it("permite editar o preço de unidade em estoque, sem mudar área nem número", async () => {
    const unidade = await unidadeComStatus("estoque");
    const res = await app.inject({ method: "PATCH", url: `/api/unidades/${unidade.id}`, payload: { precoVenda: "320000.50", areaPrivativa: "999", numero: "XX" } });
    expect(res.statusCode).toBe(200);
    const depois = await prisma.unidade.findUniqueOrThrow({ where: { id: unidade.id } });
    expect(depois.precoVenda).toBe("320000.50");
    expect(depois.areaPrivativa).toBe("60");
    expect(depois.numero).toBe(unidade.numero);
  });

  it("bloqueia a edição de unidade reservada, vendida, permutada e indisponível, com mensagem", async () => {
    for (const status of ["reservada", "vendida", "permutada", "indisponivel"]) {
      await resetDatabase();
      app = await buildAuthenticatedApp();
      empreendimentoId = (await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: `Bloqueio ${status}` } })).json().id as string;
      tipologiaId = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto", precoUnitarioPadrao: "300000" } })).json().id as string;
      await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "300000", prefixoNumero: "AP" } });
      const unidade = await unidadeComStatus(status);
      const res = await app.inject({ method: "PATCH", url: `/api/unidades/${unidade.id}`, payload: { precoVenda: "350000" } });
      expect(res.statusCode, status).toBe(400);
      expect(res.json().erro).toMatch(new RegExp(`status "${status}"`));
      expect((await prisma.unidade.findUniqueOrThrow({ where: { id: unidade.id } })).precoVenda).toBe("300000");
    }
  });

  it("valida o preço: ausente, texto, vírgula, zero e negativo são recusados", async () => {
    const unidade = await unidadeComStatus("estoque");
    for (const ruim of ["", "abc", "300000,00", "0", "-10"]) {
      const res = await app.inject({ method: "PATCH", url: `/api/unidades/${unidade.id}`, payload: { precoVenda: ruim } });
      expect(res.statusCode, `valor "${ruim}"`).toBe(400);
    }
    const semCampo = await app.inject({ method: "PATCH", url: `/api/unidades/${unidade.id}`, payload: {} });
    expect(semCampo.statusCode).toBe(400);
    expect((await prisma.unidade.findUniqueOrThrow({ where: { id: unidade.id } })).precoVenda).toBe("300000");
  });

  it("usuário com vínculo de leitura recebe 403; com vínculo de edição pode editar", async () => {
    const unidade = await unidadeComStatus("estoque");
    for (const [vinculo, esperado] of [["leitura", 403], ["edicao", 200]] as const) {
      const email = `preco-${vinculo}@teste.local`;
      const criado = await app.inject({ method: "POST", url: "/api/usuarios", payload: { email, nome: "Preço", senha: "senha-preco-123", papel: "usuario" } });
      await app.inject({ method: "POST", url: `/api/usuarios/${criado.json().id}/empreendimentos`, payload: { empreendimentoIds: [empreendimentoId], papel: vinculo } });
      const login = await appPlain.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha: "senha-preco-123" } });
      const cookie = String(login.headers["set-cookie"]).split(";")[0];
      const res = await appPlain.inject({ method: "PATCH", url: `/api/unidades/${unidade.id}`, headers: { cookie }, payload: { precoVenda: "310000" } });
      expect(res.statusCode, vinculo).toBe(esperado);
    }
  });

  it("não altera vendas existentes, projeções nem resultados do cenário; afeta só vendas futuras", async () => {
    const vendida = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" }, orderBy: { numero: "asc" } });
    const venda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: vendida.id, condicaoPagamentoId: condicaoId, mesOrigem: 1, comprador: "Real" } });
    expect(venda.statusCode).toBe(201);
    const vendaId = venda.json().id as string;
    const valorVendaAntes = (await prisma.venda.findUniqueOrThrow({ where: { id: vendaId } })).valorVenda;
    const fluxoAntes = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();

    const estoque = await unidadeComStatus("estoque");
    const editada = await app.inject({ method: "PATCH", url: `/api/unidades/${estoque.id}`, payload: { precoVenda: "999999.00" } });
    expect(editada.statusCode).toBe(200);

    expect((await prisma.venda.findUniqueOrThrow({ where: { id: vendaId } })).valorVenda).toBe(valorVendaAntes);
    const fluxoDepois = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    expect(fluxoDepois.fluxo).toEqual(fluxoAntes.fluxo);
    expect(fluxoDepois.indicadores).toEqual(fluxoAntes.indicadores);

    const futura = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: estoque.id, condicaoPagamentoId: condicaoId, mesOrigem: 2, comprador: "Futura" } });
    expect(futura.statusCode).toBe(201);
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: futura.json().id as string } })).valorVenda).toBe("999999.00");
  });
});
