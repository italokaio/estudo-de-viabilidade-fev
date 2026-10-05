import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustosPage } from "./CustosPage.js";
import * as client from "../api/client.js";

/**
 * Fase 2.2 — visão gerencial de Custos (achado F31, docs/DECISOES.md).
 * Mesma disciplina de teste da tela de Vendas (Fase 2.1, achado F30):
 * comportamento e fluxos críticos, não cobertura de linha. O cenário de
 * troca com uma única categoria por empreendimento reproduz deliberadamente
 * a forma do bug real encontrado em Vendas -- aqui o formulário já nasce
 * com `key={cenarioId}` e o reset de categoriasDisponiveis/tipologiasDisponiveis,
 * então este teste é uma prova de não-regressão, não a descoberta de um bug novo.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchCustosResumo: vi.fn(),
    fetchCenarioDetalhe: vi.fn(),
    fetchDistribuicaoMensalCusto: vi.fn(),
    criarCusto: vi.fn(),
    atualizarCusto: vi.fn(),
    excluirCusto: vi.fn(),
    registrarCustoRealizado: vi.fn(),
    estornarCustoRealizado: vi.fn(),
    registrarDesembolsoCustoRealizado: vi.fn(),
    estornarDesembolsoCustoRealizado: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Recanto das Aroeiras", nivelAcesso: "admin", cenarios: [{ id: "cen1", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12 }] },
  { id: "emp2", nome: "Torres Alto Padrão", nivelAcesso: "admin", cenarios: [{ id: "cen2", nome: "Base", tipo: "base", horizonteProjecaoMeses: 10 }] },
];

function custoMock(overrides: Partial<client.CustoResumoGerencial> = {}): client.CustoResumoGerencial {
  return {
    id: "c1",
    categoriaId: "cat1",
    categoriaNome: "Terreno",
    tipoIncidencia: "fixo",
    tipologiaId: null,
    tipologiaNome: null,
    recorrencia: "unico",
    competenciaMes: 1,
    status: "previsto",
    totalPrevisto: "500000.00",
    totalRealizado: "0.00",
    saldoARealizar: "500000.00",
    desvio: "-500000.00",
    desvioPercentual: "-100.00",
    ...overrides,
  };
}

function detalheEmp1(): any {
  return {
    id: "emp1",
    nome: "Recanto das Aroeiras",
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios: [],
    tipologias: [],
    categoriasCustoDisponiveis: [{ id: "cat1", nome: "Terreno", tipoIncidencia: "fixo" }],
    tipologiasDisponiveis: [],
    custos: [],
    cronograma: [],
    indicesCorrecao: [],
    financiamento: null,
  };
}

function detalheEmp2(): any {
  return {
    id: "emp2",
    nome: "Torres Alto Padrão",
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios: [],
    tipologias: [],
    categoriasCustoDisponiveis: [{ id: "cat2", nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" }],
    tipologiasDisponiveis: [],
    custos: [],
    cronograma: [],
    indicesCorrecao: [],
    financiamento: null,
  };
}

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
  vi.mocked(client.fetchCenarioDetalhe).mockImplementation(async (id: string) => (id === "cen1" ? detalheEmp1() : detalheEmp2()));
});

describe("CustosPage", () => {
  it("lista os custos do cenário selecionado com previsto/realizado/saldo", async () => {
    vi.mocked(client.fetchCustosResumo).mockResolvedValue([custoMock()]);

    render(<CustosPage />);

    expect(await screen.findAllByText("Terreno")).not.toHaveLength(0);
    expect(screen.getAllByText("R$ 500.000,00").length).toBeGreaterThan(0);
  });

  it("trocar de cenário não deixa custo do cenário anterior visível, e resincroniza o formulário de lançar custo", async () => {
    vi.mocked(client.fetchCustosResumo).mockImplementation(async (cenarioId: string) =>
      cenarioId === "cen1"
        ? [custoMock({ categoriaNome: "Terreno" })]
        : [custoMock({ id: "c2", categoriaId: "cat2", categoriaNome: "Comissão", totalPrevisto: "60000.00", tipoIncidencia: "pct_vgv_vendido_no_mes" })],
    );

    render(<CustosPage />);
    expect(await screen.findAllByText("Terreno")).not.toHaveLength(0);

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "cen2" } });

    // o custo do cenario anterior nao pode continuar visivel em nenhum momento da troca.
    await waitFor(() => expect(screen.queryAllByText("Terreno")).toHaveLength(0));
    await waitFor(() => expect(screen.getAllByText("Comissão").length).toBeGreaterThan(0));

    // o formulario "Lançar custo" precisa oferecer a categoria do NOVO
    // empreendimento (Comissão), nao mais a do anterior (Terreno). A
    // categoria "Comissão" suporta escopo por tipologia, entao um SEGUNDO
    // <select> (Tipologia) aparece no mesmo form -- por isso o primeiro
    // combobox do form especificamente.
    const botao = await screen.findByRole("button", { name: "Lançar custo" });
    const formulario = botao.closest("form")!;
    const selectCategoria = within(formulario).getAllByRole("combobox")[0];
    await waitFor(() => expect(within(selectCategoria).getByText(/Comissão/)).toBeInTheDocument());
    expect(within(selectCategoria).queryByText(/Terreno/)).not.toBeInTheDocument();
  });

  it("mostra o erro do backend quando lançar um custo falha", async () => {
    vi.mocked(client.fetchCustosResumo).mockResolvedValue([]);
    vi.mocked(client.criarCusto).mockRejectedValue(new Error("Valor previsto é obrigatório para esta categoria de custo"));

    render(<CustosPage />);
    const botao = await screen.findByRole("button", { name: "Lançar custo" });
    const formulario = botao.closest("form")!;
    const campoValor = within(formulario).getByPlaceholderText("500000");
    const campoMes = within(formulario).getByLabelText("Mês");
    fireEvent.change(campoValor, { target: { value: "500000" } });
    fireEvent.change(campoMes, { target: { value: "1" } });
    fireEvent.click(botao);

    expect(await screen.findByText(/Valor previsto é obrigatório/i)).toBeInTheDocument();
  });

  it("marcar um custo fixo como realizado chama a API e recarrega a lista", async () => {
    vi.mocked(client.fetchCustosResumo).mockResolvedValueOnce([custoMock()]).mockResolvedValue([custoMock({ status: "realizado", totalRealizado: "500000.00", saldoARealizar: "0.00", desvio: "0.00", desvioPercentual: "0.00" })]);
    vi.mocked(client.registrarCustoRealizado).mockResolvedValue(custoMock({ status: "realizado" }) as any);

    render(<CustosPage />);
    await screen.findAllByText("Terreno");

    fireEvent.click(screen.getByRole("button", { name: "Marcar realizado" }));
    const botaoConfirmar = await screen.findByRole("button", { name: "Confirmar" });
    const formularioRealizado = botaoConfirmar.closest("form")!;
    const campoValor = within(formularioRealizado).getByRole("textbox");
    fireEvent.change(campoValor, { target: { value: "500000" } });
    fireEvent.click(botaoConfirmar);

    await waitFor(() => expect(client.registrarCustoRealizado).toHaveBeenCalledWith("c1", { valorRealizado: "500000" }));
    expect(await screen.findByText("Realizado ✓")).toBeInTheDocument();
  });
});
