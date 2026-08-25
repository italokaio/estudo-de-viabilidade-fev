import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.1 — tela de Vendas: registro individual de venda (achado F30,
 * docs/DECISOES.md), diferente da geração em lote a partir de premissa de
 * velocidade (Fase 1). Convergem no mesmo modelo (Venda) e no mesmo motor
 * — nenhuma regra financeira nova, só a rota de cadastro direto.
 */
describe("API — vendas (Fase 2.1)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComEstoque() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vendas Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "300000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 3, precoVenda: "300000", prefixoNumero: "ST" } });
    const cond = await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Entrada + parcelas", modalidades: [{ nome: "Entrada", percentual: "0.3", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.7", tipoDistribuicao: "nivelada" }] },
    });
    const condicaoPagamentoId = cond.json().id as string;
    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 24 },
    });
    const cenarioId = cenarioRes.json().id as string;
    const unidades = (await app.inject({ method: "GET", url: `/api/tipologias/${tipologiaId}/unidades` })).json();
    return { empreendimentoId, tipologiaId, cenarioId, condicaoPagamentoId, unidadeId: unidades[0].id as string, unidades };
  }

  it("registra uma venda individual com comprador, e o valor default vem do preço da unidade", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/vendas`,
      payload: { unidadeId, condicaoPagamentoId, mesOrigem: 3, comprador: "Maria Silva", documentoComprador: "123.456.789-00" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().valorVenda).toBe("300000");
    expect(res.json().comprador).toBe("Maria Silva");
    expect(res.json().status).toBe("ativa");

    const unidade = await prisma.unidade.findUnique({ where: { id: unidadeId } });
    expect(unidade?.status).toBe("vendida");
  });

  it("aceita um valor de venda diferente do preço padrão da unidade", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/vendas`,
      payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1, valorVenda: "285000" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().valorVenda).toBe("285000");
  });

  it("rejeita vender uma unidade que já não está em estoque", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1 } });

    const segunda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 2 } });
    expect(segunda.statusCode).toBe(400);
    expect(segunda.json().erro).toMatch(/estoque/);
  });

  it("rejeita mês da venda fora do horizonte do cenário", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 25 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/horizonte/);
  });

  it("rejeita condição de pagamento de outra tipologia", async () => {
    const { empreendimentoId, cenarioId, unidadeId } = await cadastrarEmpreendimentoComEstoque();
    const outraTip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Loja", precoUnitarioPadrao: "500000" } });
    const outraCond = await app.inject({
      method: "POST",
      url: `/api/tipologias/${outraTip.json().id}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId: outraCond.json().id, mesOrigem: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toMatch(/tipologia/);
  });

  it("depois de registrar a venda, o motor já gerou os recebimentos dela (rodarMotorParaCenario chamado pela rota)", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const venda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 3 } });
    const vendaId = venda.json().id as string;

    const recebimentos = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/recebimentos` })).json();
    const dessaVenda = recebimentos.filter((r: any) => r.vendaId === vendaId);
    expect(dessaVenda.length).toBeGreaterThan(0);
    const totalPrevisto = dessaVenda.reduce((acc: number, r: any) => acc + Number(r.valorPrevisto), 0);
    expect(totalPrevisto.toFixed(2)).toBe("300000.00");
  });

  it("lista as vendas do cenário com unidade, tipologia e condição de pagamento", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1, comprador: "João" } });

    const lista = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/vendas` })).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].comprador).toBe("João");
    expect(lista[0].tipologia.nome).toBe("Studio");
    expect(lista[0].condicaoPagamento.nome).toBe("Entrada + parcelas");
  });

  it("edita comprador e valor de uma venda ativa", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const venda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1, comprador: "Ana" } });

    const editada = await app.inject({ method: "PATCH", url: `/api/vendas/${venda.json().id}`, payload: { comprador: "Ana Paula", valorVenda: "310000" } });
    expect(editada.statusCode).toBe(200);
    expect(editada.json().comprador).toBe("Ana Paula");
    expect(editada.json().valorVenda).toBe("310000");
  });

  it("bloqueia edição de uma venda distratada", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const venda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1 } });
    await app.inject({ method: "POST", url: `/api/vendas/${venda.json().id}/distrato`, payload: {} });

    const editada = await app.inject({ method: "PATCH", url: `/api/vendas/${venda.json().id}`, payload: { comprador: "Novo Nome" } });
    expect(editada.statusCode).toBe(400);
  });

  it("uma venda registrada diretamente pode ser distratada normalmente (as duas vias de criação convergem)", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    const venda = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1 } });

    const distrato = await app.inject({ method: "POST", url: `/api/vendas/${venda.json().id}/distrato`, payload: {} });
    expect(distrato.statusCode).toBe(201);

    const unidade = await prisma.unidade.findUnique({ where: { id: unidadeId } });
    expect(unidade?.status).toBe("estoque");
  });

  it("resumo de estoque conta corretamente por status, usando só os status já existentes", async () => {
    const { empreendimentoId, cenarioId, unidades, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: unidades[0].id, condicaoPagamentoId, mesOrigem: 1 } });
    await app.inject({ method: "POST", url: `/api/unidades/${unidades[1].id}/permuta`, payload: { nomeContraparte: "Contraparte X" } });

    const estoque = (await app.inject({ method: "GET", url: `/api/empreendimentos/${empreendimentoId}/estoque` })).json();
    expect(estoque.total).toBe(3);
    expect(estoque.porStatus.vendida).toBe(1);
    expect(estoque.porStatus.permutada).toBe(1);
    expect(estoque.porStatus.estoque).toBe(1);
    expect(estoque.porStatus.reservada).toBe(0);
    expect(estoque.porStatus.distratada).toBe(0);
  });

  it("404 para cenário, unidade e condição de pagamento inexistentes", async () => {
    const { cenarioId, unidadeId, condicaoPagamentoId } = await cadastrarEmpreendimentoComEstoque();
    expect((await app.inject({ method: "POST", url: "/api/cenarios/inexistente/vendas", payload: { unidadeId, condicaoPagamentoId, mesOrigem: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId: "inexistente", condicaoPagamentoId, mesOrigem: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/vendas`, payload: { unidadeId, condicaoPagamentoId: "inexistente", mesOrigem: 1 } })).statusCode).toBe(404);
  });

  describe("permissões (achado F23, docs/DECISOES.md)", () => {
    it("vínculo 'leitura' permite listar vendas mas bloqueia registrar/editar com 403", async () => {
      const appAdmin = await buildApp();
      const { criarUsuario } = await import("../../src/db/auth.js");
      await criarUsuario({ email: "admin-vendas@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
      const loginAdmin = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin-vendas@local.test", senha: "senha123" } });
      const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

      const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vendas Permissao" } });
      const empreendimentoId = emp.json().id as string;
      const cenarioRes = await appAdmin.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, headers: { cookie: cookieAdmin }, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 } });
      const cenarioId = cenarioRes.json().id as string;

      const usuarioComum = await criarUsuario({ email: "leitura-vendas@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
      await appAdmin.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoId, papel: "leitura" },
      });
      const loginComum = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "leitura-vendas@local.test", senha: "senha123" } });
      const cookieComum = loginComum.headers["set-cookie"] as string;

      const listar = await appAdmin.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/vendas`, headers: { cookie: cookieComum } });
      expect(listar.statusCode).toBe(200);

      const registrar = await appAdmin.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/vendas`,
        headers: { cookie: cookieComum },
        payload: { unidadeId: "x", condicaoPagamentoId: "y", mesOrigem: 1 },
      });
      expect(registrar.statusCode).toBe(403);

      await appAdmin.close();
    });
  });
});
