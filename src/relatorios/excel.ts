import ExcelJS from "exceljs";
import type { DadosRelatorioComparativo, DadosRelatorioViabilidade } from "./dados.js";

const FMT_MOEDA = '"R$" #,##0.00';
const FMT_PERCENTUAL = "0.00%";
const COR_CABECALHO = "FF1F2937";

function estilizarCabecalho(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  });
}

function numero(valor: string): number {
  return Number(valor);
}

function adicionarTabela(sheet: ExcelJS.Worksheet, cabecalho: string[], linhas: (string | number | null)[][], larguras?: number[]) {
  const linhaCabecalho = sheet.addRow(cabecalho);
  estilizarCabecalho(linhaCabecalho);
  for (const linha of linhas) sheet.addRow(linha);
  if (larguras) sheet.columns.forEach((col, i) => (col.width = larguras[i] ?? 16));
}

/**
 * Fase 2.5 — Excel do relatório de viabilidade: uma aba por seção do
 * pedido, sem aba vazia (Cronograma só existe se houver cronograma
 * cadastrado). Toda célula vem direto de `DadosRelatorioViabilidade` --
 * nenhum cálculo acontece aqui, só formatação.
 */
export async function gerarExcelViabilidade(dados: DadosRelatorioViabilidade): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Firmus — ERP de Viabilidade";
  wb.created = new Date(dados.geradoEm);

  const resumo = wb.addWorksheet("Resumo");
  adicionarTabela(
    resumo,
    ["Indicador", "Valor"],
    [
      ["Empreendimento", dados.empreendimento.nome],
      ["Cenário", dados.cenario.nome],
      ["Tipo de cenário", dados.cenario.tipo],
      ["Gerado em", new Date(dados.geradoEm).toLocaleString("pt-BR")],
    ],
    [26, 22],
  );
  // linhas monetárias adicionadas separadamente para aplicar numFmt por célula
  const linhasResumo: [string, number][] = [
    ["VGV", numero(dados.resumoExecutivo.vgv)],
    ["Unidades", dados.resumoExecutivo.quantidadeUnidades],
    ["Unidades vendidas", dados.resumoExecutivo.unidadesVendidas],
    ["Recebimentos previstos", numero(dados.resumoExecutivo.totalRecebimentosPrevisto)],
    ["Custos previstos", numero(dados.resumoExecutivo.totalCustosPrevisto)],
    ["Fluxo líquido (saldo final)", numero(dados.resumoExecutivo.saldoFinal)],
    ["Necessidade máxima de capital", numero(dados.resumoExecutivo.necessidadeMaximaCapital)],
    ["VPL", numero(dados.resumoExecutivo.vpl)],
  ];
  for (const [rotulo, valor] of linhasResumo) {
    const row = resumo.addRow([rotulo, valor]);
    row.getCell(2).numFmt = FMT_MOEDA;
  }
  resumo.addRow(["Mês do pico", dados.resumoExecutivo.mesPico ?? "—"]);
  resumo.addRow(["Mês de recuperação", dados.resumoExecutivo.mesRecuperacao ?? "—"]);
  if (dados.alertas.length > 0) {
    resumo.addRow([]);
    const cab = resumo.addRow(["Alertas", "Severidade"]);
    estilizarCabecalho(cab);
    for (const a of dados.alertas) resumo.addRow([a.mensagem, a.severidade]);
  }

  const premissas = wb.addWorksheet("Premissas");
  adicionarTabela(premissas, ["Premissa", "Valor"], [
    ["Horizonte de projeção", `${dados.premissas.horizonteProjecaoMeses} meses`],
    ["Limite de necessidade de capital", dados.premissas.limiteNecessidadeMaximaCapital ? `${(Number(dados.premissas.limiteNecessidadeMaximaCapital) * 100).toFixed(1)}%` : "padrão (30%)"],
    ["Velocidade de vendas — total previsto", `${dados.premissas.velocidadeVendas.totalUnidadesPrevistas} unidade(s)`],
  ]);
  if (dados.premissas.velocidadeVendas.porTipologia.length > 0) {
    premissas.addRow([]);
    const cab = premissas.addRow(["Tipologia", "Unidades previstas"]);
    estilizarCabecalho(cab);
    for (const t of dados.premissas.velocidadeVendas.porTipologia) premissas.addRow([t.tipologiaNome, Number(t.totalUnidadesPrevistas)]);
  }
  if (dados.premissas.financiamento) {
    premissas.addRow([]);
    const cab = premissas.addRow(["Financiamento", "Valor"]);
    estilizarCabecalho(cab);
    premissas.addRow(["Valor contratado", numero(dados.premissas.financiamento.valorContratado)]).getCell(2).numFmt = FMT_MOEDA;
    premissas.addRow(["Taxa de juros mensal", `${(Number(dados.premissas.financiamento.taxaJurosMensal) * 100).toFixed(2)}%`]);
    premissas.addRow(["Tipo de amortização", dados.premissas.financiamento.tipoAmortizacao]);
    premissas.addRow(["Mês de amortização", dados.premissas.financiamento.mesAmortizacao]);
  }
  premissas.columns.forEach((c) => (c.width = 30));

  const unidadesSheet = wb.addWorksheet("Unidades");
  const cabU = unidadesSheet.addRow(["Tipologia", "Área privativa padrão", "Preço unitário padrão", "Quantidade de unidades"]);
  estilizarCabecalho(cabU);
  for (const t of dados.produto.tipologias) {
    const row = unidadesSheet.addRow([t.nome, t.areaPrivativaPadrao ? Number(t.areaPrivativaPadrao) : null, t.precoUnitarioPadrao ? numero(t.precoUnitarioPadrao) : null, t.quantidadeUnidades]);
    if (row.getCell(3).value !== null) row.getCell(3).numFmt = FMT_MOEDA;
  }
  unidadesSheet.addRow([]);
  const cabEstoque = unidadesSheet.addRow(["Status do estoque", "Quantidade"]);
  estilizarCabecalho(cabEstoque);
  for (const [status, qtd] of Object.entries(dados.produto.estoque.porStatus)) unidadesSheet.addRow([status, qtd]);
  unidadesSheet.addRow(["Total", dados.produto.estoque.total]);
  unidadesSheet.columns.forEach((c) => (c.width = 24));

  if (dados.vendas.length > 0) {
    const vendasSheet = wb.addWorksheet("Vendas");
    const cab = vendasSheet.addRow(["Unidade", "Tipologia", "Comprador", "Mês", "Valor", "Condição de pagamento", "Status"]);
    estilizarCabecalho(cab);
    for (const v of dados.vendas) {
      const row = vendasSheet.addRow([v.unidadeNumero, v.tipologiaNome, v.comprador ?? "", v.mesOrigem, numero(v.valorVenda), v.condicaoPagamentoNome, v.status]);
      row.getCell(5).numFmt = FMT_MOEDA;
    }
    vendasSheet.columns.forEach((c) => (c.width = 18));
  }

  if (dados.recebimentos.length > 0) {
    const recSheet = wb.addWorksheet("Recebimentos");
    const cab = recSheet.addRow(["Unidade", "Modalidade", "Mês", "Valor previsto", "Valor realizado", "Status"]);
    estilizarCabecalho(cab);
    for (const r of dados.recebimentos) {
      const row = recSheet.addRow([r.unidadeNumero, r.modalidadeNome, r.mesCompetencia, numero(r.valorPrevisto), r.valorRealizado ? numero(r.valorRealizado) : null, r.status]);
      row.getCell(4).numFmt = FMT_MOEDA;
      if (row.getCell(5).value !== null) row.getCell(5).numFmt = FMT_MOEDA;
    }
    recSheet.columns.forEach((c) => (c.width = 18));
  }

  if (dados.custos.length > 0) {
    const custosSheet = wb.addWorksheet("Custos");
    const cab = custosSheet.addRow(["Categoria", "Tipo de incidência", "Tipologia", "Recorrência", "Status", "Previsto", "Realizado", "Saldo a realizar", "Desvio", "Desvio %"]);
    estilizarCabecalho(cab);
    for (const c of dados.custos) {
      const row = custosSheet.addRow([
        c.categoriaNome,
        c.tipoIncidencia,
        c.tipologiaNome ?? "Todas",
        c.recorrencia,
        c.status,
        numero(c.totalPrevisto),
        numero(c.totalRealizado),
        numero(c.saldoARealizar),
        numero(c.desvio),
        c.desvioPercentual ? Number(c.desvioPercentual) / 100 : null,
      ]);
      [6, 7, 8, 9].forEach((i) => (row.getCell(i).numFmt = FMT_MOEDA));
      if (row.getCell(10).value !== null) row.getCell(10).numFmt = FMT_PERCENTUAL;
    }
    custosSheet.columns.forEach((c) => (c.width = 18));
  }

  if (dados.cronograma.length > 0) {
    const cronSheet = wb.addWorksheet("Cronograma");
    const cab = cronSheet.addRow(["Mês", "% físico", "% acumulado", "Desembolso", "Desembolso acumulado"]);
    estilizarCabecalho(cab);
    for (const p of dados.cronograma) {
      const row = cronSheet.addRow([p.mes, Number(p.percentualExecucaoMensal), Number(p.percentualAcumulado), Number(p.desembolsoMensal), Number(p.desembolsoAcumulado)]);
      row.getCell(2).numFmt = FMT_PERCENTUAL;
      row.getCell(3).numFmt = FMT_PERCENTUAL;
      row.getCell(4).numFmt = FMT_MOEDA;
      row.getCell(5).numFmt = FMT_MOEDA;
    }
    cronSheet.columns.forEach((c) => (c.width = 18));
  }

  const fluxoSheet = wb.addWorksheet("Fluxo de Caixa");
  const temFinanciamento = dados.financiamento.length > 0;
  const cabFluxo = ["Mês", "Entradas", "Saídas", "Fluxo mensal", "Saldo acumulado"];
  if (temFinanciamento) cabFluxo.push("Liberação financiamento", "Amortização financiamento", "Saldo devedor");
  const cabF = fluxoSheet.addRow(cabFluxo);
  estilizarCabecalho(cabF);
  const financiamentoPorMes = new Map(dados.financiamento.map((f) => [f.mes, f]));
  for (const f of dados.fluxoCaixa) {
    const linha: (string | number)[] = [f.mes, numero(f.entradas), numero(f.saidas), numero(f.fluxoMensal), numero(f.fluxoAcumulado)];
    if (temFinanciamento) {
      const fin = financiamentoPorMes.get(f.mes);
      linha.push(fin ? numero(fin.liberacao) : 0, fin ? numero(fin.amortizacao) : 0, fin ? numero(fin.saldoDevedor) : 0);
    }
    const row = fluxoSheet.addRow(linha);
    for (let i = 2; i <= linha.length; i++) row.getCell(i).numFmt = FMT_MOEDA;
  }
  fluxoSheet.columns.forEach((c) => (c.width = 18));

  const necessidadeSheet = wb.addWorksheet("Necessidade de Capital");
  adicionarTabela(necessidadeSheet, ["Indicador", "Valor"], []);
  const linhasNecessidade: [string, string | number][] = [
    ["Necessidade máxima de capital", numero(dados.resumoExecutivo.necessidadeMaximaCapital)],
    ["Mês do pico", dados.resumoExecutivo.mesPico ?? "—"],
    ["Mês de recuperação", dados.resumoExecutivo.mesRecuperacao ?? "—"],
    ["Saldo final", numero(dados.resumoExecutivo.saldoFinal)],
    ["VPL", numero(dados.resumoExecutivo.vpl)],
  ];
  for (const [rotulo, valor] of linhasNecessidade) {
    const row = necessidadeSheet.addRow([rotulo, valor]);
    if (typeof valor === "number") row.getCell(2).numFmt = FMT_MOEDA;
  }
  necessidadeSheet.columns.forEach((c) => (c.width = 30));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Fase 2.5 — Excel do relatório comparativo: visão enxuta de comparação
 * (não é N relatórios de viabilidade colados), batendo com o pedido —
 * indicadores, premissas, fluxo de caixa e necessidade de capital lado a
 * lado, sempre em formato longo (uma linha por cenário×mês/rubrica) para
 * ficar auditável em uma única aba por seção.
 */
export async function gerarExcelComparativo(dados: DadosRelatorioComparativo): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Firmus — ERP de Viabilidade";
  wb.created = new Date(dados.geradoEm);

  const resumo = wb.addWorksheet("Resumo");
  const cabResumo = resumo.addRow(["Indicador", ...dados.cenarios.map((c) => c.nome)]);
  estilizarCabecalho(cabResumo);
  const linhasIndicadores: { rotulo: string; acessor: (c: (typeof dados.cenarios)[number]) => string; moeda: boolean }[] = [
    { rotulo: "VGV", acessor: (c) => c.indicadores.vgv, moeda: true },
    { rotulo: "Recebimentos previstos", acessor: (c) => c.indicadores.totalRecebimentosPrevisto, moeda: true },
    { rotulo: "Custos previstos", acessor: (c) => c.indicadores.totalCustosPrevisto, moeda: true },
    { rotulo: "Fluxo líquido (saldo final)", acessor: (c) => c.indicadores.saldoFinal, moeda: true },
    { rotulo: "Necessidade máxima de capital", acessor: (c) => c.indicadores.necessidadeMaximaCapital, moeda: true },
    { rotulo: "VPL", acessor: (c) => c.indicadores.vpl, moeda: true },
  ];
  for (const linha of linhasIndicadores) {
    const row = resumo.addRow([linha.rotulo, ...dados.cenarios.map((c) => numero(linha.acessor(c)))]);
    if (linha.moeda) for (let i = 2; i <= dados.cenarios.length + 1; i++) row.getCell(i).numFmt = FMT_MOEDA;
  }
  resumo.addRow(["Mês do pico", ...dados.cenarios.map((c) => c.indicadores.mesPico ?? "—")]);
  resumo.addRow(["Mês de recuperação", ...dados.cenarios.map((c) => c.indicadores.mesRecuperacao ?? "—")]);
  resumo.columns.forEach((c) => (c.width = 22));

  const premissas = wb.addWorksheet("Premissas");
  const cabPrem = premissas.addRow(["Cenário", "Horizonte (meses)", "Limite de risco", "Velocidade de vendas (total)", "Financiamento contratado"]);
  estilizarCabecalho(cabPrem);
  for (const c of dados.cenarios) {
    const row = premissas.addRow([
      c.nome,
      c.premissas.horizonteProjecaoMeses,
      c.premissas.limiteNecessidadeMaximaCapital ? `${(Number(c.premissas.limiteNecessidadeMaximaCapital) * 100).toFixed(1)}%` : "padrão (30%)",
      Number(c.premissas.velocidadeVendas.totalUnidadesPrevistas),
      c.premissas.financiamento ? numero(c.premissas.financiamento.valorContratado) : 0,
    ]);
    if (c.premissas.financiamento) row.getCell(5).numFmt = FMT_MOEDA;
  }
  premissas.addRow([]);
  const cabCustos = premissas.addRow(["Cenário", "Categoria de custo", "Tipo de incidência", "Tipologia", "Valor previsto", "Percentual"]);
  estilizarCabecalho(cabCustos);
  for (const c of dados.cenarios) {
    for (const custo of c.premissas.custos) {
      const row = premissas.addRow([
        c.nome,
        custo.categoriaNome,
        custo.tipoIncidencia,
        custo.tipologiaNome ?? "Todas",
        custo.valorPrevisto ? numero(custo.valorPrevisto) : null,
        custo.percentual ? Number(custo.percentual) : null,
      ]);
      if (row.getCell(5).value !== null) row.getCell(5).numFmt = FMT_MOEDA;
      if (row.getCell(6).value !== null) row.getCell(6).numFmt = FMT_PERCENTUAL;
    }
  }
  premissas.columns.forEach((c) => (c.width = 22));

  const fluxoSheet = wb.addWorksheet("Fluxo de Caixa");
  const cabFluxo = fluxoSheet.addRow(["Cenário", "Mês", "Entradas", "Saídas", "Fluxo mensal", "Saldo acumulado"]);
  estilizarCabecalho(cabFluxo);
  for (const c of dados.cenarios) {
    for (const f of c.fluxoMensal) {
      const row = fluxoSheet.addRow([c.nome, f.mes, numero(f.entradas), numero(f.saidas), numero(f.fluxoMensal), numero(f.fluxoAcumulado)]);
      [3, 4, 5, 6].forEach((i) => (row.getCell(i).numFmt = FMT_MOEDA));
    }
  }
  fluxoSheet.columns.forEach((c) => (c.width = 18));

  const necessidadeSheet = wb.addWorksheet("Necessidade de Capital");
  const cabNec = necessidadeSheet.addRow(["Cenário", "Necessidade máxima", "Mês do pico", "Mês de recuperação", "Saldo final", "VPL"]);
  estilizarCabecalho(cabNec);
  for (const c of dados.cenarios) {
    const row = necessidadeSheet.addRow([
      c.nome,
      numero(c.indicadores.necessidadeMaximaCapital),
      c.indicadores.mesPico ?? "—",
      c.indicadores.mesRecuperacao ?? "—",
      numero(c.indicadores.saldoFinal),
      numero(c.indicadores.vpl),
    ]);
    row.getCell(2).numFmt = FMT_MOEDA;
    row.getCell(5).numFmt = FMT_MOEDA;
    row.getCell(6).numFmt = FMT_MOEDA;
  }
  necessidadeSheet.columns.forEach((c) => (c.width = 20));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
