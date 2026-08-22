import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { parseExtratoCSV, sugerirConciliacao, type CandidatoConciliacao } from "../../src/core/conciliacaoExtrato.js";

describe("motor de conciliação de extrato (achado F27 — importação em lote de extrato bancário)", () => {
  describe("parseExtratoCSV", () => {
    it("lê um CSV com cabeçalho Data,Descrição,Valor", () => {
      const csv = "Data,Descrição,Valor\n2026-03-15,PIX RECEBIDO ST-1,80000\n2026-03-20,PAGAMENTO FORNECEDOR,-15000";
      const linhas = parseExtratoCSV(csv);
      expect(linhas).toHaveLength(2);
      expect(linhas[0]).toEqual({ data: "2026-03-15", descricao: "PIX RECEBIDO ST-1", valor: new Decimal("80000") });
      expect(linhas[1]!.valor.toString()).toBe("-15000");
    });

    it("aceita o cabeçalho sem acento e em qualquer capitalização", () => {
      const csv = "DATA,descricao,VALOR\n2026-01-01,Teste,100";
      const linhas = parseExtratoCSV(csv);
      expect(linhas).toHaveLength(1);
    });

    it("rejeita um CSV sem as três colunas esperadas", () => {
      const csv = "Data,Valor\n2026-01-01,100";
      expect(() => parseExtratoCSV(csv)).toThrow(/Data, Descrição e Valor/);
    });

    it("descarta silenciosamente uma linha com valor não numérico, sem interromper as demais", () => {
      const csv = "Data,Descrição,Valor\n2026-01-01,Boa,100\n2026-01-02,Ruim,abc\n2026-01-03,Boa também,200";
      const linhas = parseExtratoCSV(csv);
      expect(linhas).toHaveLength(2);
      expect(linhas.map((l) => l.descricao)).toEqual(["Boa", "Boa também"]);
    });

    it("data em formato inválido vira null, mas a linha não é descartada", () => {
      const csv = "Data,Descrição,Valor\n15/03/2026,Teste,100";
      const linhas = parseExtratoCSV(csv);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.data).toBeNull();
    });

    it("CSV vazio devolve lista vazia", () => {
      expect(parseExtratoCSV("")).toEqual([]);
    });
  });

  describe("sugerirConciliacao", () => {
    const candidatos: CandidatoConciliacao[] = [
      { tipo: "recebimento", id: "r1", descricao: "ST-1 · Entrada", valorPrevisto: new Decimal("80000"), mes: 1 },
      { tipo: "recebimento", id: "r2", descricao: "ST-2 · Entrada", valorPrevisto: new Decimal("80000"), mes: 3 },
      { tipo: "custo_fixo", id: "c1", descricao: "Legalização", valorPrevisto: new Decimal("15000"), mes: 1 },
      { tipo: "desembolso_custo", id: "d1", descricao: "Comissão", valorPrevisto: new Decimal("4000"), mes: 1 },
    ];

    it("entrada (valor positivo) só sugere recebimentos, nunca custos", () => {
      const linhas = [{ data: null, descricao: "PIX", valor: new Decimal("80000") }];
      const [sugestao] = sugerirConciliacao(linhas, candidatos);
      expect(sugestao!.candidatos.every((c) => c.tipo === "recebimento")).toBe(true);
    });

    it("saída (valor negativo) só sugere custos, nunca recebimentos", () => {
      const linhas = [{ data: null, descricao: "Pagamento", valor: new Decimal("-15000") }];
      const [sugestao] = sugerirConciliacao(linhas, candidatos);
      expect(sugestao!.candidatos.every((c) => c.tipo !== "recebimento")).toBe(true);
      expect(sugestao!.candidatos[0]!.id).toBe("c1");
    });

    it("um candidato com valor muito diferente do da linha não entra na lista de sugestões", () => {
      const linhas = [{ data: null, descricao: "PIX pequeno", valor: new Decimal("500") }];
      const [sugestao] = sugerirConciliacao(linhas, candidatos);
      expect(sugestao!.candidatos).toHaveLength(0);
    });

    it("com data-âncora, desempata candidatos de mesmo valor pela proximidade do mês", () => {
      const dataMesUm = new Date(Date.UTC(2026, 0, 1)); // mes 1 = janeiro/2026
      const linhas = [{ data: "2026-01-10", descricao: "PIX", valor: new Decimal("80000") }]; // cai no mes 1
      const [sugestao] = sugerirConciliacao(linhas, candidatos, dataMesUm);
      // r1 (mes 1) deve vir antes de r2 (mes 3), mesmo os dois tendo o mesmo valorPrevisto
      expect(sugestao!.candidatos[0]!.id).toBe("r1");
    });

    it("sem data-âncora, ainda sugere pelo valor mesmo sem conseguir desempatar por mês", () => {
      const linhas = [{ data: "2026-01-10", descricao: "PIX", valor: new Decimal("80000") }];
      const [sugestao] = sugerirConciliacao(linhas, candidatos);
      expect(sugestao!.candidatos.map((c) => c.id).sort()).toEqual(["r1", "r2"]);
    });

    it("nunca sugere mais que 3 candidatos por linha", () => {
      const muitosCandidatos: CandidatoConciliacao[] = Array.from({ length: 5 }, (_, i) => ({
        tipo: "recebimento" as const,
        id: `r${i}`,
        descricao: `Unidade ${i}`,
        valorPrevisto: new Decimal("1000"),
        mes: 1,
      }));
      const linhas = [{ data: null, descricao: "PIX", valor: new Decimal("1000") }];
      const [sugestao] = sugerirConciliacao(linhas, muitosCandidatos);
      expect(sugestao!.candidatos.length).toBeLessThanOrEqual(3);
    });
  });
});
