import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CenariosPage } from "./CenariosPage.js";
import * as client from "../api/client.js";

/**
 * Fase 2.4 — visão gerencial de Cenários. Mesma disciplina de teste das
 * telas anteriores (Vendas F30, Custos F31, Cronograma F32): comportamento
 * e fluxos críticos, não cobertura de linha -- em particular, que trocar de
 * empreendimento nunca deixa cenário do empreendimento anterior visível.
 *
 * Nomes de cenário usados aqui são deliberadamente diferentes de
 * "Base"/"Otimista"/"Pessimista"/"Personalizado" (os rótulos do <select>
 * "Tipo" do formulário de novo cenário, sempre presente na tela) -- usar
 * esses nomes tornaria `getByText` ambíguo entre o texto do cenário e a
 * opção estática do formulário.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
    fetchComparacaoCenariosMultiplos: vi.fn(),
    criarCenario: vi.fn(),
    atualizarCenario: vi.fn(),
    duplicarCenario: vi.fn(),
    excluirCenario: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Recanto das Aroeiras", nivelAcesso: "admin", cenarios: [{ id: "cen1", nome: "Cenário Principal", tipo: "base", horizonteProjecaoMeses: 12 }] },
  { id: "emp2", nome: "Torres Alto Padrão", nivelAcesso: "admin", cenarios: [{ id: "cen2", nome: "Cenário Torres", tipo: "base", horizonteProjecaoMeses: 10 }] },
];

function cenarioResumo(overrides: Partial<client.CenarioResumo> = {}): client.CenarioResumo {
  return { id: "cen1", nome: "Cenário Principal", tipo: "base", horizonteProjecaoMeses: 12, derivadoDeNome: null, ...overrides };
}

function detalheEmp1(cenarios: client.CenarioResumo[]): any {
  return {
    id: "emp1",
    nome: "Recanto das Aroeiras",
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios,
    tipologias: [],
    categoriasCusto: [],
  };
}

function detalheEmp2(cenarios: client.CenarioResumo[]): any {
  return { ...detalheEmp1(cenarios), id: "emp2", nome: "Torres Alto Padrão" };
}

function comparacaoCenario(overrides: Partial<client.ComparacaoCenario> = {}): client.ComparacaoCenario {
  return {
    id: "cen1",
    nome: "Cenário Principal",
    tipo: "base",
    derivadoDeNome: null,
    indicadores: {
      vgv: "1000000.00",
      vgvPermutado: "0.00",
      vgvLiquido: "1000000.00",
      totalRecebimentosPrevisto: "1000000.00",
      totalCustosPrevisto: "50000.00",
      saldoFinal: "950000.00",
      necessidadeMaximaCapital: "0.00",
      mesPico: null,
      mesRecuperacao: 1,
      mesRecuperacaoDescontado: 1,
      vpl: "940000.00",
      taxaDescontoMensal: "0.005",
      tir: null,
      margemLiquida: "0.95",
    },
    fluxoMensal: [{ mes: 1, entradas: "1000000.00", saidas: "50000.00", fluxoMensal: "950000.00", fluxoAcumulado: "950000.00" }],
    premissas: {
      horizonteProjecaoMeses: 12,
      limiteNecessidadeMaximaCapital: null,
      velocidadeVendas: { totalUnidadesPrevistas: "5.00", porTipologia: [{ tipologiaId: "t1", tipologiaNome: "Studio", totalUnidadesPrevistas: "5.00" }] },
      custos: [{ categoriaId: "cat1", categoriaNome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes", tipologiaNome: null, valorPrevisto: null, percentual: "0.05" }],
      cronograma: null,
      financiamento: null,
      vendas: { reais: 0, projetadas: 5 },
      avisos: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
});

describe("CenariosPage", () => {
  it("lista os cenários do empreendimento selecionado", async () => {
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(
      detalheEmp1([cenarioResumo(), cenarioResumo({ id: "cen1b", nome: "Cenário Turbo", tipo: "otimista" })]),
    );

    render(<CenariosPage />);

    expect(await screen.findAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("Cenário Principal")).toBeInTheDocument();
    expect(screen.getByText("Cenário Turbo")).toBeInTheDocument();
  });

  it("selecionar cenários e comparar chama a API e renderiza os indicadores", async () => {
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(
      detalheEmp1([cenarioResumo(), cenarioResumo({ id: "cen1b", nome: "Cenário Turbo", tipo: "otimista" })]),
    );
    vi.mocked(client.fetchComparacaoCenariosMultiplos).mockResolvedValue({
      cenarios: [
        comparacaoCenario(),
        comparacaoCenario({ id: "cen1b", nome: "Cenário Turbo", indicadores: { ...comparacaoCenario().indicadores, totalCustosPrevisto: "20000.00" } }),
      ],
    });

    render(<CenariosPage />);
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    const botaoComparar = screen.getByRole("button", { name: /Comparar selecionados \(2\)/ });
    fireEvent.click(botaoComparar);

    await waitFor(() => expect(client.fetchComparacaoCenariosMultiplos).toHaveBeenCalledWith("emp1", expect.arrayContaining(["cen1", "cen1b"])));
    expect(await screen.findByText("VGV (inclui permuta)")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 1.000.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 20.000,00")).toBeInTheDocument();
    expect(screen.getByText(/Resultado \(margem líquida\) = saldo final/)).toBeInTheDocument();
  });

  it("mostra o erro do backend quando a comparação falha", async () => {
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(detalheEmp1([cenarioResumo()]));
    vi.mocked(client.fetchComparacaoCenariosMultiplos).mockRejectedValue(new Error("Falha ao comparar cenários (500)"));

    render(<CenariosPage />);
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /Comparar selecionados/ }));

    expect(await screen.findByText(/Falha ao comparar cenários/)).toBeInTheDocument();
  });

  it("trocar de empreendimento não deixa cenário do empreendimento anterior visível", async () => {
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockImplementation(async (id: string) =>
      id === "emp1" ? detalheEmp1([cenarioResumo()]) : detalheEmp2([cenarioResumo({ id: "cen2", nome: "Cenário Torres", tipo: "otimista" })]),
    );

    render(<CenariosPage />);
    expect(await screen.findByText("Cenário Principal")).toBeInTheDocument();

    // o seletor de empreendimento e o primeiro <select> da pagina (cabecalho);
    // o segundo e o campo "Tipo" do formulario de novo cenario, mais abaixo.
    const seletorEmpreendimento = screen.getAllByRole("combobox")[0]!;
    fireEvent.change(seletorEmpreendimento, { target: { value: "emp2" } });

    await waitFor(() => expect(screen.queryByText("Cenário Principal")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Cenário Torres")).toBeInTheDocument());
  });

  it("mostra as diferenças de premissas por cenário comparado", async () => {
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(detalheEmp1([cenarioResumo()]));
    vi.mocked(client.fetchComparacaoCenariosMultiplos).mockResolvedValue({ cenarios: [comparacaoCenario()] });

    render(<CenariosPage />);
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /Comparar selecionados/ }));

    const titulo = await screen.findByText("Diferenças de premissas");
    expect(titulo).toBeInTheDocument();
    expect(screen.getByText(/Studio: 5\.00/)).toBeInTheDocument();
    const painel = titulo.closest("div")!.parentElement!;
    expect(within(painel).getByText(/Comissão/)).toBeInTheDocument();
  });
});
