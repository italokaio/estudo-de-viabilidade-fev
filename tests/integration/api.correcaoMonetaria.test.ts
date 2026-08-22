import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { criarUsuario } from "../../src/db/auth.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa o indice de correcao monetaria (achado F6, docs/DECISOES.md): uma
 * serie de variacao mensal cadastrada por cenario, aplicada por cima do
 * valor nominal ja calculado pelo motor de recebimentos -- sem indice
 * cadastrado, o comportamento e identico ao motor antes desta fatia.
 *
 * O bloco final testa a extensao a custos (achado F12): o mesmo indice
 * tambem corrige desembolsos de Custo, mas a partir de um mes-base fixo
 * (1), nao do mes de cada linha -- ver src/core/motorCorrecao.ts.
 */
describe("API — índice de correção monetária", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Empreendimento com 1 unidade vendida no mês 1, recebimento único ("chaves") no mês 3 — janela de 2 meses para correção. */
  async function cadastrarCenarioComRecebimentoNoMes3() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Teste" } });
    const empreendimentoId = emp.json().id as string;

    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "100000" },
    });
    const tipologiaId = tip.json().id as string;

    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "100000", prefixoNumero: "ST" } });

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Chaves", modalidades: [{ nome: "Chaves", percentual: "1", tipoDistribuicao: "mes_fixo", mesFixo: 3 }] },
    });

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    return { empreendimentoId, cenarioId };
  }

  it("sem índice cadastrado, entradasCorrigidas é idêntico a entradas", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    expect(mes3.entradas).toBe("100000.00");
    expect(mes3.entradasCorrigidas).toBe("100000.00");
  });

  it("POST /api/cenarios/:id/indices-correcao rejeita mês e percentual inválidos", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    const semMes = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { percentual: "0.01" } });
    expect(semMes.statusCode).toBe(400);
    const semPercentual = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2 } });
    expect(semPercentual.statusCode).toBe(400);
    const percentualInvalido = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "abc" } });
    expect(percentualInvalido.statusCode).toBe(400);
  });

  it("cadastra a série de índice e o fluxo de caixa aplica a correção composta corretamente", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();

    const p1 = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.10" } });
    expect(p1.statusCode).toBe(201);
    const p2 = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.10" } });
    expect(p2.statusCode).toBe(201);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([
      { grupo: "padrao", mes: 2, percentual: "0.10" },
      { grupo: "padrao", mes: 3, percentual: "0.10" },
    ]);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    // venda no mes 1, recebimento no mes 3: fator = 1.10 * 1.10 = 1.21
    expect(mes3.entradas).toBe("100000.00");
    expect(mes3.entradasCorrigidas).toBe("121000.00");
  });

  it("reenviar o mesmo mês faz upsert (substitui o percentual, não duplica)", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.10" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.05" } });

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([{ grupo: "padrao", mes: 2, percentual: "0.05" }]);
  });

  it("aceita percentual negativo (deflação)", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "-0.10" } });
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[2].entradasCorrigidas).toBe("90000.00");
  });

  it("DELETE remove o ponto e o mês volta a não corrigir", async () => {
    const { cenarioId } = await cadastrarCenarioComRecebimentoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.20" } });

    const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/3` });
    expect(del.statusCode).toBe(204);

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().indicesCorrecao).toEqual([]);

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[2].entradasCorrigidas).toBe("100000.00");
  });

  it("usuário comum recebe 403 ao tentar excluir um ponto de índice", async () => {
    const appAdmin = await buildAuthenticatedApp("admin");
    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Perm" } });
    const cenarioRes = await appAdmin.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;
    await appAdmin.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.05" } });

    const appUsuario = await buildAuthenticatedApp("usuario");
    const res = await appUsuario.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/2` });
    expect(res.statusCode).toBe(403);

    await appAdmin.close();
    await appUsuario.close();
  });

  it("usuário sem vínculo ao empreendimento recebe 404 ao tentar cadastrar índice", async () => {
    const rawApp = await buildApp();
    await criarUsuario({ email: "admin.correcao@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin.correcao@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await rawApp.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Correção Sem Vínculo" } });
    const cenarioRes = await rawApp.inject({
      method: "POST",
      url: `/api/empreendimentos/${emp.json().id}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await criarUsuario({ email: "usuario.correcao@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    const loginUsuario = await rawApp.inject({ method: "POST", url: "/api/auth/login", payload: { email: "usuario.correcao@local.test", senha: "senha123" } });
    const cookieUsuario = loginUsuario.headers["set-cookie"] as string;

    const res = await rawApp.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/indices-correcao`,
      headers: { cookie: cookieUsuario },
      payload: { mes: 2, percentual: "0.05" },
    });
    expect(res.statusCode).toBe(404);

    await rawApp.close();
  });

  /**
   * Correção monetária de custos (achado F12, docs/DECISOES.md): estende o
   * mesmo índice de correção — já usado para RecebimentoProjetado — a
   * Custo, com um mês-base fixo (1) em vez de um mês-base por linha (o
   * orçamento de obra é fixado uma única vez, no início do cronograma).
   */
  async function cadastrarCenarioComCustoFixoNoMes3() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Custo Teste" } });
    const empreendimentoId = emp.json().id as string;

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
    });
    const cenarioId = cenarioRes.json().id as string;

    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Legalização", tipoIncidencia: "fixo" } });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/custos`,
      payload: { categoriaId: cat.json().id, valorPrevisto: "100000", competenciaMes: 3 },
    });

    return { empreendimentoId, cenarioId };
  }

  it("sem índice cadastrado, saidasCorrigidas é idêntico a saidas", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoFixoNoMes3();
    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    expect(mes3.saidas).toBe("100000.00");
    expect(mes3.saidasCorrigidas).toBe("100000.00");
  });

  it("corrige um custo pelo índice, sempre a partir do mês-base 1 (não do mês do custo)", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoFixoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 2, percentual: "0.10" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.10" } });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    // custo lancado no mes 3, mas o mes-base e sempre 1: fator = 1.10 * 1.10 = 1.21
    expect(mes3.saidas).toBe("100000.00");
    expect(mes3.saidasCorrigidas).toBe("121000.00");
  });

  it("correção de entradas e de saídas são independentes uma da outra", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarCenarioComCustoFixoNoMes3();
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "50000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "50000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Chaves", modalidades: [{ nome: "Chaves", percentual: "1", tipoDistribuicao: "mes_fixo", mesFixo: 3 }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.20" } });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const mes3 = fluxo.json().fluxo[2];
    // entrada: venda no mes 1, recebimento no mes 3 -> fator 1.20 (so o mes 3 tem indice)
    expect(mes3.entradasCorrigidas).toBe("60000.00");
    // saida: custo com mes-base fixo 1 -> mesmo fator 1.20, mas sobre uma base diferente (100000)
    expect(mes3.saidasCorrigidas).toBe("120000.00");
  });

  it("DELETE de um ponto de índice também reverte a correção de custos", async () => {
    const { cenarioId } = await cadastrarCenarioComCustoFixoNoMes3();
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { mes: 3, percentual: "0.15" } });
    await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/3` });

    const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(fluxo.json().fluxo[2].saidasCorrigidas).toBe("100000.00");
  });

  /**
   * Correção monetária por índice diferenciado (achado F20, docs/DECISOES.md):
   * um cenário pode ter mais de uma série de índice ("grupo"), e cada Custo
   * escolhe qual série o corrige — "padrao" por omissão (comportamento
   * idêntico a antes desta fatia). Vendas sempre corrigem pela série
   * "padrao": o motor não tem como saber qual venda "é" obra.
   */
  describe("índice diferenciado por grupo (achado F20)", () => {
    async function cadastrarCenarioComCustoPadraoEObra() {
      const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Correção Grupo Teste" } });
      const empreendimentoId = emp.json().id as string;

      const cenarioRes = await app.inject({
        method: "POST",
        url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
        payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 3 },
      });
      const cenarioId = cenarioRes.json().id as string;

      const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Legalização", tipoIncidencia: "fixo" } });
      const catObra = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });

      const custoPadrao = await app.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/custos`,
        payload: { categoriaId: cat.json().id, valorPrevisto: "100000", competenciaMes: 3 },
      });
      const custoObra = await app.inject({
        method: "POST",
        url: `/api/cenarios/${cenarioId}/custos`,
        payload: { categoriaId: catObra.json().id, valorPrevisto: "100000", competenciaMes: 3, grupoIndiceCorrecao: "obra" },
      });

      return { empreendimentoId, cenarioId, custoPadraoId: custoPadrao.json().id as string, custoObraId: custoObra.json().id as string };
    }

    it("custo sem grupo informado assume 'padrao' explicitamente no GET", async () => {
      const { cenarioId, custoPadraoId, custoObraId } = await cadastrarCenarioComCustoPadraoEObra();
      const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
      const custos = detalhe.json().custos as { id: string; grupoIndiceCorrecao: string }[];
      expect(custos.find((c) => c.id === custoPadraoId)?.grupoIndiceCorrecao).toBe("padrao");
      expect(custos.find((c) => c.id === custoObraId)?.grupoIndiceCorrecao).toBe("obra");
    });

    it("cada custo corrige pela série do seu próprio grupo, não pela série padrão", async () => {
      const { cenarioId } = await cadastrarCenarioComCustoPadraoEObra();
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "padrao", mes: 2, percentual: "0.10" } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "padrao", mes: 3, percentual: "0.10" } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 2, percentual: "0.05" } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 3, percentual: "0.05" } });

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      const mes3 = fluxo.json().fluxo[2];
      // custo padrao: 100000 * 1.10 * 1.10 = 121000.00
      // custo obra:   100000 * 1.05 * 1.05 = 110250.00
      expect(mes3.saidas).toBe("200000.00");
      expect(mes3.saidasCorrigidas).toBe("231250.00");
    });

    it("um grupo sem nenhum ponto cadastrado tem fator 1, mesmo com a série padrão cadastrada", async () => {
      const { cenarioId } = await cadastrarCenarioComCustoPadraoEObra();
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "padrao", mes: 3, percentual: "0.20" } });

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      const mes3 = fluxo.json().fluxo[2];
      // custo padrao: 100000 * 1.20 = 120000.00; custo obra: sem serie "obra" cadastrada -> fator 1, 100000.00
      expect(mes3.saidasCorrigidas).toBe("220000.00");
    });

    it("vendas sempre corrigem pela série 'padrao', mesmo que só exista uma série com outro nome", async () => {
      const { empreendimentoId, cenarioId } = await cadastrarCenarioComCustoPadraoEObra();
      const tip = await app.inject({
        method: "POST",
        url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
        payload: { nome: "Studio", precoUnitarioPadrao: "50000" },
      });
      const tipologiaId = tip.json().id as string;
      await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "50000", prefixoNumero: "ST" } });
      await app.inject({
        method: "POST",
        url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
        payload: { nome: "Chaves", modalidades: [{ nome: "Chaves", percentual: "1", tipoDistribuicao: "mes_fixo", mesFixo: 3 }] },
      });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "1" }] } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

      // so a serie "obra" existe -- vendas nao seguem esse grupo, entao entradasCorrigidas fica identico a entradas.
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 3, percentual: "0.50" } });

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      const mes3 = fluxo.json().fluxo[2];
      expect(mes3.entradas).toBe("50000.00");
      expect(mes3.entradasCorrigidas).toBe("50000.00");
    });

    it("DELETE aceita grupo via querystring, removendo só daquele grupo", async () => {
      const { cenarioId } = await cadastrarCenarioComCustoPadraoEObra();
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "padrao", mes: 3, percentual: "0.10" } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 3, percentual: "0.10" } });

      const del = await app.inject({ method: "DELETE", url: `/api/cenarios/${cenarioId}/indices-correcao/3?grupo=obra` });
      expect(del.statusCode).toBe(204);

      const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
      expect(detalhe.json().indicesCorrecao).toEqual([{ grupo: "padrao", mes: 3, percentual: "0.10" }]);

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      const mes3 = fluxo.json().fluxo[2];
      // custo padrao ainda corrigido (110000), custo obra voltou ao nominal (100000)
      expect(mes3.saidasCorrigidas).toBe("210000.00");
    });

    it("PATCH /api/custos/:id troca o grupo de índice de um custo já cadastrado", async () => {
      const { cenarioId, custoPadraoId } = await cadastrarCenarioComCustoPadraoEObra();
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 3, percentual: "0.30" } });

      const patch = await app.inject({ method: "PATCH", url: `/api/custos/${custoPadraoId}`, payload: { grupoIndiceCorrecao: "obra" } });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().grupoIndiceCorrecao).toBe("obra");

      const fluxo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
      // ambos os custos agora seguem "obra": 100000*1.30 + 100000*1.30 = 260000.00
      expect(fluxo.json().fluxo[2].saidasCorrigidas).toBe("260000.00");
    });

    it("duplicar um cenário preserva o grupo de cada custo e cada série de índice", async () => {
      const { cenarioId } = await cadastrarCenarioComCustoPadraoEObra();
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "padrao", mes: 3, percentual: "0.10" } });
      await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/indices-correcao`, payload: { grupo: "obra", mes: 3, percentual: "0.05" } });

      const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Cópia" } });
      const novoId = dup.json().id as string;

      const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
      const body = detalhe.json();
      expect(body.indicesCorrecao).toHaveLength(2);
      const grupos = body.custos.map((c: { grupoIndiceCorrecao: string }) => c.grupoIndiceCorrecao).sort();
      expect(grupos).toEqual(["obra", "padrao"]);
    });
  });
});
