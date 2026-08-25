import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CronogramaPage } from "./CronogramaPage.js";
import * as client from "../api/client.js";

/**
 * Fase 2.3 — visão gerencial de Cronograma. Mesma disciplina de teste das
 * telas de Vendas (achado F30) e Custos (achado F31): comportamento e
 * fluxos críticos, não cobertura de linha -- em particular, que trocar de
 * cenário nunca deixa a curva do cenário anterior visível.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchCronogramaCurva: vi.fn(),
    fetchCenarioDetalhe: vi.fn(),
    criarCronograma: vi.fn(),
    excluirCronograma: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Recanto das Aroeiras", cenarios: [{ id: "cen1", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12 }] },
  { id: "emp2", nome: "Torres Alto Padrão", cenarios: [{ id: "cen2", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12 }] },
];

function pontoCurva(overrides: Partial<client.PontoCurvaCronograma> = {}): client.PontoCurvaCronograma {
  return {
    mes: 1,
    percentualExecucaoMensal: "0.5",
    percentualAcumulado: "0.5",
    desembolsoMensal: "500000.00",
    desembolsoAcumulado: "500000.00",
    ...overrides,
  };
}

function detalhe(cronograma: { mes: number; percentualExecucaoMensal: string }[]): any {
  return {
    id: "emp1",
    nome: "Recanto das Aroeiras",
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios: [],
    tipologias: [],
    categoriasCustoDisponiveis: [],
    tipologiasDisponiveis: [],
    custos: [],
    cronograma,
    indicesCorrecao: [],
    financiamento: null,
  };
}

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
});

describe("CronogramaPage", () => {
  it("renderiza a curva do cenário selecionado com percentual físico, acumulado e desembolso", async () => {
    vi.mocked(client.fetchCronogramaCurva).mockResolvedValue({
      pontos: [
        pontoCurva({ mes: 1, percentualExecucaoMensal: "0.5", percentualAcumulado: "0.5", desembolsoMensal: "500000.00", desembolsoAcumulado: "500000.00" }),
        pontoCurva({ mes: 2, percentualExecucaoMensal: "0.5", percentualAcumulado: "1", desembolsoMensal: "500000.00", desembolsoAcumulado: "1000000.00" }),
      ],
    });
    vi.mocked(client.fetchCenarioDetalhe).mockResolvedValue(
      detalhe([
        { mes: 1, percentualExecucaoMensal: "0.5" },
        { mes: 2, percentualExecucaoMensal: "0.5" },
      ]),
    );

    render(<CronogramaPage />);

    expect((await screen.findAllByText("50.0%")).length).toBeGreaterThan(0);
    expect(screen.getByText("100.0%")).toBeInTheDocument(); // acumulado do mes 2
    expect(screen.getAllByText("R$ 500.000,00").length).toBeGreaterThan(0);

    const kpiMeses = screen.getByText("Meses cadastrados").parentElement!;
    expect(within(kpiMeses).getByText("2")).toBeInTheDocument();
  });

  it("trocar de cenário não deixa a curva do cenário anterior visível", async () => {
    vi.mocked(client.fetchCronogramaCurva).mockImplementation(async (cenarioId: string) =>
      cenarioId === "cen1"
        ? { pontos: [pontoCurva({ mes: 1 })] }
        : { pontos: [pontoCurva({ mes: 7, percentualExecucaoMensal: "1", percentualAcumulado: "1", desembolsoMensal: "900000.00", desembolsoAcumulado: "900000.00" })] },
    );
    vi.mocked(client.fetchCenarioDetalhe).mockImplementation(async (id: string) =>
      id === "cen1" ? detalhe([{ mes: 1, percentualExecucaoMensal: "1" }]) : detalhe([{ mes: 7, percentualExecucaoMensal: "1" }]),
    );

    render(<CronogramaPage />);
    await waitFor(() => expect(screen.getAllByText("1").some((el) => el.tagName === "TD")).toBe(true));

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "cen2" } });

    // a linha do mes 1 (cenario anterior) nao pode sobreviver a troca.
    await waitFor(() => expect(screen.queryAllByText("R$ 900.000,00").length).toBeGreaterThan(0));
    const linhasMes1 = screen.queryAllByText("1").filter((el) => el.tagName === "TD");
    expect(linhasMes1).toHaveLength(0);
  });

  it("mostra o erro do backend quando cadastrar o cronograma falha", async () => {
    vi.mocked(client.fetchCronogramaCurva).mockResolvedValue({ pontos: [] });
    vi.mocked(client.fetchCenarioDetalhe).mockResolvedValue(detalhe([]));
    vi.mocked(client.criarCronograma).mockRejectedValue(new Error("Cronograma invalido: soma dos percentuais = 0.5, esperado 1"));

    render(<CronogramaPage />);
    const botao = await screen.findByRole("button", { name: "Salvar cronograma" });
    const formulario = botao.closest("form")!;
    const campoMes = within(formulario).getByLabelText("Mês");
    const campoPercentual = within(formulario).getByLabelText("% (0–1)");
    fireEvent.change(campoMes, { target: { value: "1" } });
    fireEvent.change(campoPercentual, { target: { value: "1" } });
    fireEvent.click(botao);

    expect(await screen.findByText(/Cronograma invalido/i)).toBeInTheDocument();
  });
});
