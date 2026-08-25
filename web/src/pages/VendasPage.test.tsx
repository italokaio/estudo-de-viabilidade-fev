import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendasPage } from "./VendasPage.js";
import * as client from "../api/client.js";

/**
 * Fase 2.1 — primeira infraestrutura de teste do frontend (achado F30,
 * docs/DECISOES.md). Prioriza comportamento e fluxos críticos (não
 * cobertura de linha): listar, respeitar o cenário selecionado (o mesmo
 * padrão de bug já corrigido no ImportarExtratoPanel — troca de cenário
 * não pode deixar dado do anterior visível), o formulário de registrar
 * venda resincronizar ao trocar de cenário (bug real encontrado na
 * verificação visual desta fatia — ver achado F30) e reportar erro do
 * backend.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchVendasDoCenario: vi.fn(),
    fetchRecebimentos: vi.fn(),
    fetchEstoque: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
    fetchUnidades: vi.fn(),
    criarVenda: vi.fn(),
    atualizarVenda: vi.fn(),
    registrarDistrato: vi.fn(),
    desfazerDistrato: vi.fn(),
    registrarRenegociacao: vi.fn(),
  };
});

// Dois empreendimentos distintos, cada um com uma única tipologia diferente
// -- reproduz exatamente o cenário do bug real: nenhuma segunda opção de
// tipologia para o usuário clicar e "destravar" o formulário manualmente.
const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Recanto das Aroeiras", cenarios: [{ id: "cen1", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12 }] },
  { id: "emp2", nome: "Torres Alto Padrão", cenarios: [{ id: "cen2", nome: "Base", tipo: "base", horizonteProjecaoMeses: 10 }] },
];

function vendaMock(overrides: Partial<client.VendaCenarioResumo> = {}): client.VendaCenarioResumo {
  return {
    id: "v1",
    status: "ativa",
    mesOrigem: 2,
    valorVenda: "300000",
    comprador: "Maria Silva",
    documentoComprador: null,
    unidade: { id: "u1", numero: "ST-1", andar: null },
    tipologia: { id: "t1", nome: "Studio" },
    condicaoPagamento: { id: "c1", nome: "Entrada + Parcelas" },
    distrato: null,
    renegociacoes: [],
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
    categoriasCusto: [],
    tipologias: [
      {
        id: "t1",
        nome: "Studio",
        areaPrivativaPadrao: null,
        precoUnitarioPadrao: "300000",
        quantidadeUnidades: 3,
        condicoesPagamento: [{ id: "c1", nome: "Entrada + Parcelas", modalidades: [] }],
      },
    ],
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
    categoriasCusto: [],
    tipologias: [
      {
        id: "t2",
        nome: "Cobertura Duplex",
        areaPrivativaPadrao: null,
        precoUnitarioPadrao: "3200000",
        quantidadeUnidades: 6,
        condicoesPagamento: [{ id: "c2", nome: "Entrada + reforço semestral", modalidades: [] }],
      },
    ],
  };
}

const estoqueMock: client.EstoqueResumo = { total: 3, porStatus: { estoque: 2, vendida: 1, permutada: 0, reservada: 0, distratada: 0, indisponivel: 0 } };

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
  vi.mocked(client.fetchRecebimentos).mockResolvedValue([]);
  vi.mocked(client.fetchEstoque).mockResolvedValue(estoqueMock);
  vi.mocked(client.fetchEmpreendimentoDetalhe).mockImplementation(async (id: string) => (id === "emp1" ? detalheEmp1() : detalheEmp2()));
  vi.mocked(client.fetchUnidades).mockImplementation(async (tipologiaId: string) =>
    tipologiaId === "t1"
      ? [{ id: "u2", numero: "ST-2", andar: null, areaPrivativa: null, precoVenda: "300000", status: "estoque", permuta: null, venda: null }]
      : [{ id: "u3", numero: "CB-3", andar: null, areaPrivativa: null, precoVenda: "3200000", status: "estoque", permuta: null, venda: null }],
  );
});

describe("VendasPage", () => {
  it("lista as vendas do cenário selecionado", async () => {
    vi.mocked(client.fetchVendasDoCenario).mockResolvedValue([vendaMock()]);

    render(<VendasPage />);

    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("ST-1")).toBeInTheDocument();
    // "Studio" tambem aparece na <option> do formulario de registrar venda -- basta confirmar que a linha da tabela existe.
    expect(screen.getAllByText("Studio").length).toBeGreaterThan(0);
  });

  it("trocar de cenário não deixa a venda do cenário anterior visível", async () => {
    vi.mocked(client.fetchVendasDoCenario).mockImplementation(async (cenarioId: string) =>
      cenarioId === "cen1" ? [vendaMock({ comprador: "Maria Silva" })] : [vendaMock({ id: "v2", comprador: "João Souza" })],
    );

    render(<VendasPage />);
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();

    // CenarioSwitcher e um <select> sem rotulo proprio, e o primeiro combobox da pagina.
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "cen2" } });

    // a venda do cenario anterior nao pode continuar na tela em nenhum momento da troca.
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("João Souza")).toBeInTheDocument());
  });

  /**
   * Bug real encontrado na verificação visual desta fatia (achado F30):
   * trocar para um cenário de OUTRO empreendimento, com uma única
   * tipologia diferente, deixava o formulário de registrar venda preso na
   * tipologia/condição de pagamento do cenário anterior — sem nenhuma
   * segunda opção de tipologia para o usuário clicar e resincronizar
   * manualmente, o botão "Registrar venda" ficava desabilitado para
   * sempre. Corrigido com `key={cenarioId}` no FormularioRegistrarVenda.
   */
  it("trocar de cenário resincroniza o formulário de registrar venda, mesmo com uma única tipologia nova", async () => {
    vi.mocked(client.fetchVendasDoCenario).mockResolvedValue([]);

    render(<VendasPage />);
    await screen.findByRole("button", { name: "Registrar venda" });
    // cenario inicial (emp1): tipologia "Studio" carregada.
    expect(await screen.findByText("Studio")).toBeInTheDocument();

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "cen2" } });

    // apos a troca, a tipologia do NOVO empreendimento precisa aparecer --
    // nao pode continuar mostrando "Studio" nem travar sem nenhuma condicao.
    await waitFor(() => expect(screen.getByText("Cobertura Duplex")).toBeInTheDocument());
    expect(screen.queryByText("Studio")).not.toBeInTheDocument();

    const botao = screen.getByRole("button", { name: "Registrar venda" });
    const formulario = botao.closest("form")!;
    const selectUnidade = within(formulario).getByRole("combobox", { name: /unidade/i });
    await waitFor(() => expect(within(selectUnidade).getByText("CB-3")).toBeInTheDocument());
    fireEvent.change(selectUnidade, { target: { value: "u3" } });

    const selectCondicao = within(formulario).getByRole("combobox", { name: /condição de pagamento/i });
    await waitFor(() => expect(within(selectCondicao).getByText("Entrada + reforço semestral")).toBeInTheDocument());

    // com unidade e condicao validas, o botao precisa estar habilitado.
    expect(botao).not.toBeDisabled();
  });

  it("mostra o erro do backend quando registrar uma venda falha", async () => {
    vi.mocked(client.fetchVendasDoCenario).mockResolvedValue([]);
    vi.mocked(client.criarVenda).mockRejectedValue(new Error("Esta unidade está com status \"vendida\" — só é possível vender uma unidade em estoque"));

    render(<VendasPage />);
    const botao = await screen.findByRole("button", { name: "Registrar venda" });
    const formulario = botao.closest("form")!;

    const selectUnidade = within(formulario).getByRole("combobox", { name: /unidade/i });
    await waitFor(() => expect(within(selectUnidade).getByText("ST-2")).toBeInTheDocument());
    fireEvent.change(selectUnidade, { target: { value: "u2" } });

    fireEvent.click(botao);

    expect(await screen.findByText(/só é possível vender uma unidade em estoque/i)).toBeInTheDocument();
  });
});
