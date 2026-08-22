import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa a importação em lote de extrato bancário (achado F27,
 * docs/DECISOES.md): "sugerir e confirmar" — as rotas de sugestão nunca
 * escrevem nada, e confirmar só aceita ids que realmente pertencem ao
 * cenário informado.
 */
describe("API — importação em lote de extrato bancário (achado F27)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com uma unidade de R$80.000 à vista no mês 1 e um custo fixo de R$15.000 no mês 1. */
  async function cadastrarCenarioComCandidatos() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Extrato Teste" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "80000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "80000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Legalização", tipoIncidencia: "fixo" },
    });
    const categoriaId = cat.json().id as string;

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, competenciaMes: 1, valorPrevisto: "15000" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });

    return { empreendimentoId, cenarioId };
  }

  describe("PATCH /api/cenarios/:id — dataMesUm", () => {
    it("salva e devolve a data-âncora do mês 1", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const patch = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { dataMesUm: "2026-01-01" } });
      expect(patch.statusCode).toBe(200);

      const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
      expect(detalhe.json().dataMesUm).toBe("2026-01-01");
    });

    it("aceita null explícito para remover a âncora", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { dataMesUm: "2026-01-01" } });
      const remover = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { dataMesUm: null } });
      expect(remover.statusCode).toBe(200);

      const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
      expect(detalhe.json().dataMesUm).toBeNull();
    });

    it("rejeita uma data inválida com 400", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const patch = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { dataMesUm: "não é data" } });
      expect(patch.statusCode).toBe(400);
    });
  });

  describe("POST /api/cenarios/:id/extrato/sugestoes", () => {
    it("sugere o recebimento e o custo fixo corretos a partir de um CSV", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const csv = "Data,Descrição,Valor\n2026-01-10,PIX RECEBIDO ST-1,80000\n2026-01-12,PAGAMENTO LEGALIZAÇÃO,-15000";
      const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/extrato/sugestoes`, payload: { csv } });
      expect(res.statusCode).toBe(200);

      const { sugestoes } = res.json();
      expect(sugestoes).toHaveLength(2);
      expect(sugestoes[0].candidatos[0].tipo).toBe("recebimento");
      expect(sugestoes[0].candidatos[0].valorPrevisto).toBe("80000.00");
      expect(sugestoes[1].candidatos[0].tipo).toBe("custo_fixo");
    });

    it("não escreve nada no banco — é só sugestão", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const csv = "Data,Descrição,Valor\n2026-01-10,PIX RECEBIDO ST-1,80000";
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/extrato/sugestoes`, payload: { csv } });

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      expect(fluxo.json().fluxo.find((f: any) => f.mes === 1).entradasRealizadas).toBeNull();
    });

    it("400 quando o CSV não é enviado", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/extrato/sugestoes`, payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it("400 quando o CSV não tem as colunas esperadas", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/extrato/sugestoes`, payload: { csv: "Coluna1,Coluna2\na,b" } });
      expect(res.statusCode).toBe(400);
    });

    it("404 para cenário inexistente", async () => {
      const res = await app.inject({ method: "POST", url: "/api/cenarios/inexistente/extrato/sugestoes", payload: { csv: "Data,Descrição,Valor\n2026-01-10,X,100" } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/cenarios/:id/extrato/confirmar", () => {
    it("confirma um recebimento e ele passa a aparecer como realizado", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const sugestoesRes = await app.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/extrato/sugestoes`,
        payload: { csv: "Data,Descrição,Valor\n2026-01-10,PIX RECEBIDO ST-1,80000" },
      });
      const candidato = sugestoesRes.json().sugestoes[0].candidatos[0];

      const confirmar = await app.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/extrato/confirmar`,
        payload: { confirmacoes: [{ tipo: candidato.tipo, id: candidato.id, valorRealizado: "80000" }] },
      });
      expect(confirmar.statusCode).toBe(200);
      expect(confirmar.json().confirmados).toBe(1);

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      expect(fluxo.json().fluxo.find((f: any) => f.mes === 1).entradasRealizadas).toBe("80000.00");
    });

    it("400 quando nenhuma confirmação é enviada", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/extrato/confirmar`, payload: { confirmacoes: [] } });
      expect(res.statusCode).toBe(400);
    });

    it("400 quando o id confirmado não pertence a este cenário — nunca confia em id vindo do corpo sem checar", async () => {
      const { cenarioId } = await cadastrarCenarioComCandidatos();
      const res = await app.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/extrato/confirmar`,
        payload: { confirmacoes: [{ tipo: "recebimento", id: "id-que-nao-existe", valorRealizado: "80000" }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("404 para cenário inexistente", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/cenarios/inexistente/extrato/confirmar",
        payload: { confirmacoes: [{ tipo: "recebimento", id: "x", valorRealizado: "1" }] },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("papel de acesso 'leitura' (achado F23) também bloqueia a confirmação de extrato", () => {
    it("vínculo 'leitura' permite pedir sugestões (GET-like, só leitura) mas bloqueia confirmar com 403", async () => {
      const appAdmin = await buildApp();
      await criarUsuario({ email: "admin-extrato@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
      const loginAdmin = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin-extrato@local.test", senha: "senha123" } });
      const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

      const criado = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Extrato Leitura" } });
      const empreendimentoId = criado.json().id as string;
      const cenarioRes = await appAdmin.inject({
        method: "POST",
        url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
        headers: { cookie: cookieAdmin },
        payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
      });
      const cenarioId = cenarioRes.json().id as string;

      const usuarioComum = await criarUsuario({ email: "leitura-extrato@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
      await appAdmin.inject({
        method: "POST",
        url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
        headers: { cookie: cookieAdmin },
        payload: { empreendimentoId, papel: "leitura" },
      });
      const loginComum = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "leitura-extrato@local.test", senha: "senha123" } });
      const cookieComum = loginComum.headers["set-cookie"] as string;

      const confirmar = await appAdmin.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/extrato/confirmar`,
        headers: { cookie: cookieComum },
        payload: { confirmacoes: [{ tipo: "recebimento", id: "x", valorRealizado: "1" }] },
      });
      expect(confirmar.statusCode).toBe(403);

      await appAdmin.close();
    });
  });
});
