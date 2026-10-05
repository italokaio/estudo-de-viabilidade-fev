/**
 * Recria o empreendimento Residencial Águas Claras (Base, Otimista e Pessimista) pela API,
 * no banco de teste (prisma/test.db). Idempotente: se o empreendimento já existe, avisa e
 * não cria outro. Depois de criar (ou se já existir) confere os indicadores esperados.
 *
 *   npm run seed:aguas-claras        cria se faltar e verifica
 *   npm run verificar:aguas-claras   limpa o banco de teste, recria e verifica (fonte única de conferência)
 *
 * O banco é sempre prisma/test.db; não há opção para o dev.db neste script.
 */
import { randomBytes } from "node:crypto";

process.env.DATABASE_URL = "file:./test.db";

const NOME = "Residencial Águas Claras";
const EMAIL_SEED = "seed-aguas-claras@local.test";
// Senha aleatória por execução: a conta temporária é removida ao final e a senha nunca é gravada.
const SENHA_SEED = randomBytes(18).toString("base64url");

type Esperado = { vgv?: number; margem?: number; tir?: number; necessidadeMaxima?: number; mesPico?: number; vpl?: number };
const ESPERADO: Record<"Base" | "Otimista" | "Pessimista", Esperado> = {
  Base: { vgv: 72_400_000, margem: 0.195, tir: 0.02, necessidadeMaxima: 14_800_000, mesPico: 3 },
  Otimista: { margem: 0.22, tir: 0.0243 },
  Pessimista: { vgv: 64_200_000, margem: 0.051, vpl: -1_400_000 },
};
const TOLERANCIA = { reais: 50_000, margem: 0.0005, tir: 0.0002 };

const MODALIDADES = [
  { nome: "Entrada", percentual: "0.10", tipoDistribuicao: "unica_na_venda" },
  { nome: "Parcelas mensais", percentual: "0.20", tipoDistribuicao: "nivelada", mesFinal: 38 },
  { nome: "Intermediárias", percentual: "0.10", tipoDistribuicao: "periodica", periodicidadeMeses: 6 },
  { nome: "Financiamento bancário (1/3)", percentual: "0.20", tipoDistribuicao: "mes_fixo", mesFixo: 43 },
  { nome: "Financiamento bancário (2/3)", percentual: "0.20", tipoDistribuicao: "mes_fixo", mesFixo: 44 },
  { nome: "Financiamento bancário (3/3)", percentual: "0.20", tipoDistribuicao: "mes_fixo", mesFixo: 45 },
];

const FASES = [
  { meses: [1, 2, 3, 4], total: 80000 },
  { meses: Array.from({ length: 20 }, (_, i) => 5 + i), total: 520000 },
  { meses: Array.from({ length: 10 }, (_, i) => 25 + i), total: 300000 },
  { meses: [35, 36, 37, 38], total: 100000 },
];

const CURVA_VENDAS = [13, 9, 8, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2];

const ZEROS = (n: number) => Array(n).fill(0);
const UM = (n: number) => Array(n).fill(1);

const VELOCIDADE_OTIMISTA: Record<"2Q" | "3Q" | "COB", number[]> = {
  "2Q": [8, 7, 6, 6, 4, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
  "3Q": [6, 6, 5, 5, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  COB: [2, 1, 1, 1, 0, 0, 1, 1, 1],
};
const VELOCIDADE_PESSIMISTA: Record<"2Q" | "3Q" | "COB", number[]> = {
  "2Q": [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, ...UM(19)],
  "3Q": [2, 2, ...UM(10), ...UM(22)],
  COB: [1, 1, 1, ...ZEROS(9), 1, ...ZEROS(4), 1, ...ZEROS(5), 1, ...ZEROS(5), 1],
};

type Resposta = any;

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => a.startsWith("--banco"))) {
    throw new Error("Este script só grava no banco de teste (prisma/test.db). Para o dev.db, é preciso aprovação explícita.");
  }
  const limpar = args.includes("--limpar");

  const { prisma } = await import("../db/client.js");
  if (limpar) {
    const { resetDatabase } = await import("../../tests/helpers/resetDatabase.js");
    await resetDatabase();
    console.log("banco de teste limpo");
  }

  const existente = await prisma.empreendimento.findFirst({ where: { nome: NOME } });
  if (existente) {
    console.log(`Empreendimento "${NOME}" já existe no banco de teste (id ${existente.id}). Nada foi criado.`);
  } else {
    await criarPelaApi(prisma);
  }

  const resultado = await verificar(prisma, (await prisma.empreendimento.findFirstOrThrow({ where: { nome: NOME } })).id);
  await prisma.$disconnect();
  if (!resultado.ok) {
    console.error("Verificação falhou:");
    for (const f of resultado.falhas) console.error(" - " + f);
    process.exit(1);
  }
  console.log("Verificação OK: indicadores dentro da tolerância.");
}

async function criarPelaApi(prisma: any) {
  const { buildApp } = await import("../../api/src/app.js");
  const { criarUsuario } = await import("../db/auth.js");
  await criarUsuario({ email: EMAIL_SEED, nome: "Seed Águas Claras", senha: SENHA_SEED, papel: "admin" });
  const app = await buildApp();
  try {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: EMAIL_SEED, senha: SENHA_SEED } });
    const cookie = login.headers["set-cookie"] as string;
    if (!cookie) throw new Error("login do seed falhou");
    const api = async (method: string, url: string, payload?: unknown): Promise<Resposta> => {
      const res = await app.inject({ method: method as any, url, payload: payload as any, headers: { cookie } });
      if (res.statusCode >= 400) throw new Error(`${method} ${url} -> ${res.statusCode}: ${res.body.slice(0, 300)}`);
      return res.body ? JSON.parse(res.body) : null;
    };

    const emp = await api("POST", "/api/empreendimentos", {
      nome: NOME,
      incorporador: "Horizonte Incorporadora Ltda",
      endereco: "Avenida Araucárias, Águas Claras, Brasília — DF",
    });
    await api("POST", `/api/empreendimentos/${emp.id}/terrenos`, {
      numeroMatricula: "45.789",
      areaValor: "4200",
      areaUnidade: "m2",
      areaStatusValidacao: "validado",
      formaAquisicao: "compra",
    });

    const t2q = await api("POST", `/api/empreendimentos/${emp.id}/tipologias`, { nome: "2 Quartos", areaPrivativaPadrao: "58", precoUnitarioPadrao: "510000" });
    const t3q = await api("POST", `/api/empreendimentos/${emp.id}/tipologias`, { nome: "3 Quartos", areaPrivativaPadrao: "85", precoUnitarioPadrao: "830000" });
    const tcob = await api("POST", `/api/empreendimentos/${emp.id}/tipologias`, { nome: "Cobertura (4 quartos, duplex)", areaPrivativaPadrao: "145", precoUnitarioPadrao: "1680000" });

    const andares = (n: number) => Array.from({ length: n }, (_, i) => ({ andar: i + 1, quantidade: 4 }));
    await api("POST", `/api/tipologias/${t2q.id}/unidades-por-andar`, {
      prefixoNumero: "2Q",
      areaPrivativa: "58",
      andares: andares(12),
      precificacao: { precoBase: "510000", andarBase: 1, incremento: "0.004", tipoIncremento: "percentual" },
    });
    await api("POST", `/api/tipologias/${t3q.id}/unidades-por-andar`, {
      prefixoNumero: "3Q",
      areaPrivativa: "85",
      andares: andares(10),
      precificacao: { precoBase: "830000", andarBase: 1, incremento: "0.005", tipoIncremento: "percentual" },
    });
    await api("POST", `/api/tipologias/${tcob.id}/unidades`, { quantidade: 8, precoVenda: "1680000", areaPrivativa: "145", prefixoNumero: "COB" });

    const condicoes: Record<string, string> = {};
    for (const t of [t2q, t3q, tcob]) {
      condicoes[t.id] = (await api("POST", `/api/tipologias/${t.id}/condicoes-pagamento`, { nome: "Padrão Águas Claras", modalidades: MODALIDADES })).id;
    }

    const cenBase = await api("POST", `/api/empreendimentos/${emp.id}/cenarios`, { tipo: "base", nome: "Base", horizonteProjecaoMeses: 56 });
    await api("PATCH", `/api/cenarios/${cenBase.id}`, { taxaDescontoMensal: "0.007" });

    const pontos: { mes: number; percentualExecucaoMensal: string }[] = [];
    for (const f of FASES) {
      const base = Math.floor(f.total / f.meses.length);
      const resto = f.total - base * f.meses.length;
      f.meses.forEach((mes, i) => pontos.push({ mes, percentualExecucaoMensal: ((base + (i < resto ? 1 : 0)) / 1_000_000).toFixed(6) }));
    }
    await api("POST", `/api/cenarios/${cenBase.id}/cronograma`, { pontos });
    for (let m = 1; m <= 56; m++) await api("POST", `/api/cenarios/${cenBase.id}/indices-correcao`, { grupo: "obra", mes: m, percentual: "0.004" });
    await api("POST", `/api/cenarios/${cenBase.id}/financiamento`, {
      valorContratado: "18000000",
      taxaJurosMensal: "0.011",
      mesAmortizacao: 40,
      tipoAmortizacao: "sac",
      numeroParcelas: 15,
    });

    const categorias: Record<string, string> = {};
    const criarCategoria = async (nome: string, tipoIncidencia: string, papel = "custo") => {
      categorias[nome] = (await api("POST", `/api/empreendimentos/${emp.id}/categorias-custo`, { nome, tipoIncidencia, papel })).id;
    };
    await criarCategoria("Terreno", "fixo");
    await criarCategoria("Projeto e Aprovações", "fixo");
    await criarCategoria("Outorga Onerosa", "fixo");
    await criarCategoria("Obra", "pct_execucao");
    await criarCategoria("Comissão de Corretagem", "pct_vgv_vendido_no_mes", "comissao_corretagem");
    await criarCategoria("Taxa de Adm. de Recebíveis", "pct_recebido_mes_anterior");
    await criarCategoria("Publicidade e Marketing", "fixo");
    await criarCategoria("RET — Regime Especial de Tributação", "pct_recebido_no_mes", "tributo");

    const custo = (corpo: unknown) => api("POST", `/api/cenarios/${cenBase.id}/custos`, corpo);
    await custo({ categoriaId: categorias["Terreno"]!, valorPrevisto: "13000000", competenciaMes: 1, recorrencia: "unico" });
    await custo({ categoriaId: categorias["Projeto e Aprovações"]!, valorPrevisto: "1300000", competenciaMes: 2, recorrencia: "unico" });
    await custo({ categoriaId: categorias["Outorga Onerosa"]!, valorPrevisto: "900000", competenciaMes: 3, recorrencia: "unico" });
    await custo({ categoriaId: categorias["Obra"]!, valorPrevisto: "29000000", grupoIndiceCorrecao: "obra" });
    await custo({ categoriaId: categorias["Comissão de Corretagem"]!, percentual: "0.05" });
    await custo({ categoriaId: categorias["Taxa de Adm. de Recebíveis"]!, percentual: "0.01" });
    for (let m = 1; m <= 18; m++) await custo({ categoriaId: categorias["Publicidade e Marketing"]!, valorPrevisto: "35000", competenciaMes: m, recorrencia: "unico" });
    await custo({ categoriaId: categorias["RET — Regime Especial de Tributação"]!, percentual: "0.04" });

    await venderCurva(api, cenBase.id, [t2q.id, t3q.id, tcob.id], condicoes);

    await criarDerivado(api, cenBase.id, "Otimista", VELOCIDADE_OTIMISTA, { fatorObra: 0.95, percentualComissao: "0.045" }, [t2q.id, t3q.id, tcob.id]);
    await criarDerivado(api, cenBase.id, "Pessimista", VELOCIDADE_PESSIMISTA, { fatorObra: 1.12 }, [t2q.id, t3q.id, tcob.id]);

    console.log(`Empreendimento "${NOME}" criado pela API (id ${emp.id}).`);
  } finally {
    await app.close();
    await removerUsuario(EMAIL_SEED);
  }
}

async function removerUsuario(email: string) {
  const { prisma } = await import("../db/client.js");
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) return;
  await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.empreendimentoUsuario.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.usuario.delete({ where: { id: usuario.id } });
}

async function venderCurva(api: (m: string, u: string, p?: unknown) => Promise<Resposta>, cenarioId: string, tipologias: string[], condicoes: Record<string, string>) {
  const estoque: Record<string, string[]> = {};
  for (const t of tipologias) {
    estoque[t] = (await api("GET", `/api/tipologias/${t}/unidades`)).filter((u: any) => u.status === "estoque").map((u: any) => u.id);
  }
  const totalPorTipo: Record<string, number> = Object.fromEntries(tipologias.map((t) => [t, estoque[t]!.length]));
  const total = Object.values(totalPorTipo).reduce((a, b) => a + b, 0);
  if (total !== 96) throw new Error(`estoque esperado 96, obtido ${total}`);

  const feitas: Record<string, number> = Object.fromEntries(tipologias.map((t) => [t, 0]));
  let sequencia = 0;
  let n = 0;
  for (let idx = 0; idx < CURVA_VENDAS.length; idx++) {
    for (let k = 0; k < CURVA_VENDAS[idx]!; k++) {
      sequencia++;
      let escolhida = tipologias[0]!;
      let maiorDeficit = -Infinity;
      for (const t of tipologias) {
        if (feitas[t]! >= totalPorTipo[t]!) continue;
        const deficit = (totalPorTipo[t]! / 96) * sequencia - feitas[t]!;
        if (deficit > maiorDeficit) {
          maiorDeficit = deficit;
          escolhida = t;
        }
      }
      const unidadeId = estoque[escolhida]!.shift()!;
      feitas[escolhida]! += 1;
      n++;
      await api("POST", `/api/cenarios/${cenarioId}/vendas`, {
        unidadeId,
        condicaoPagamentoId: condicoes[escolhida]!,
        mesOrigem: idx + 1,
        comprador: `Comprador Teste ${String(n).padStart(2, "0")}`,
      });
    }
  }
}

async function criarDerivado(
  api: (m: string, u: string, p?: unknown) => Promise<Resposta>,
  cenarioBaseId: string,
  nome: string,
  velocidade: Record<"2Q" | "3Q" | "COB", number[]>,
  ajustes: { fatorObra: number; percentualComissao?: string },
  tipologias: string[],
) {
  const copia = await api("POST", `/api/cenarios/${cenarioBaseId}/duplicar`, { nome });
  const [t2q, t3q, tcob] = tipologias as [string, string, string];
  const porNome: Record<"2Q" | "3Q" | "COB", string> = { "2Q": t2q, "3Q": t3q, COB: tcob };
  const itens: { tipologiaId: string; mes: number; unidadesPrevistas: string }[] = [];
  for (const sigla of ["2Q", "3Q", "COB"] as const) {
    velocidade[sigla].forEach((u, i) => {
      if (u > 0) itens.push({ tipologiaId: porNome[sigla], mes: i + 1, unidadesPrevistas: String(u) });
    });
  }
  await api("POST", `/api/cenarios/${copia.id}/premissas-velocidade`, { itens });
  const custos = await api("GET", `/api/cenarios/${copia.id}/custos-resumo`);
  for (const c of custos) {
    if (c.categoriaNome === "Obra") await api("PATCH", `/api/custos/${c.id}`, { valorPrevisto: (29_000_000 * ajustes.fatorObra).toFixed(2) });
    if (c.categoriaNome === "Comissão de Corretagem" && ajustes.percentualComissao) {
      await api("PATCH", `/api/custos/${c.id}`, { percentual: ajustes.percentualComissao });
    }
  }
}

async function verificar(prisma: any, empreendimentoId: string) {
  const { buildApp } = await import("../../api/src/app.js");
  const { criarUsuario } = await import("../db/auth.js");
  const emailVerif = "verificar-aguas-claras@local.test";
  await removerUsuario(emailVerif);
  await criarUsuario({ email: emailVerif, nome: "Verificação Águas Claras", senha: SENHA_SEED, papel: "admin" });
  const app = await buildApp();
  const falhas: string[] = [];
  try {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: emailVerif, senha: SENHA_SEED } });
    const cookie = login.headers["set-cookie"] as string;
    const get = async (url: string) => JSON.parse((await app.inject({ method: "GET", url, headers: { cookie } })).body);

    const detalhe = await get(`/api/empreendimentos/${empreendimentoId}`);
    const cenarios: Record<string, string> = Object.fromEntries(detalhe.cenarios.map((c: any) => [c.nome, c.id]));
    const comparacao = await get(`/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${Object.values(cenarios).join(",")}`);
    const porNome: Record<string, any> = Object.fromEntries(comparacao.cenarios.map((c: any) => [c.nome, c]));

    for (const nome of ["Base", "Otimista", "Pessimista"] as const) {
      const cenarioId = cenarios[nome];
      if (!cenarioId) {
        falhas.push(`cenário ${nome} não existe`);
        continue;
      }
      const fluxo = await get(`/api/cenarios/${cenarioId}/fluxo-caixa`);
      const ind = porNome[nome]?.indicadores ?? {};
      const esp = ESPERADO[nome];
      console.log(`${nome}: VGV ${Number(ind.vgv).toFixed(0)} | margem ${Number(ind.margemLiquida).toFixed(4)} | TIR ${Number(fluxo.indicadores.tir).toFixed(5)} | necessidade ${Number(fluxo.indicadores.necessidadeMaximaCapital).toFixed(0)} | pico ${fluxo.indicadores.mesPico} | VPL ${Number(fluxo.indicadores.vpl).toFixed(0)}`);
      const confere = (rotulo: string, obtido: number | null | undefined, esperado: number | undefined, tol: number) => {
        if (esperado === undefined) return;
        if (obtido === null || obtido === undefined || !Number.isFinite(obtido)) return falhas.push(`${nome} ${rotulo}: sem valor`);
        if (Math.abs(obtido - esperado) > tol) falhas.push(`${nome} ${rotulo}: obtido ${obtido}, esperado ${esperado} (tolerância ${tol})`);
      };
      confere("VGV", Number(ind.vgv), esp.vgv, TOLERANCIA.reais);
      confere("margem líquida", Number(ind.margemLiquida), esp.margem, TOLERANCIA.margem);
      confere("TIR a.m.", Number(fluxo.indicadores.tir), esp.tir, TOLERANCIA.tir);
      confere("necessidade máxima", Number(fluxo.indicadores.necessidadeMaximaCapital), esp.necessidadeMaxima, TOLERANCIA.reais);
      confere("VPL", Number(fluxo.indicadores.vpl), esp.vpl, TOLERANCIA.reais);
      if (esp.mesPico !== undefined && fluxo.indicadores.mesPico !== esp.mesPico) {
        falhas.push(`${nome} mês de pico: obtido ${fluxo.indicadores.mesPico}, esperado ${(esp as any).mesPico}`);
      }
    }
    return { ok: falhas.length === 0, falhas };
  } finally {
    await app.close();
    await removerUsuario(emailVerif);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
