import ExcelJS from "exceljs";
import type { DadosRelatorioComparativo, DadosRelatorioViabilidade } from "./dados.js";
import { formatarPercentualMensal, formatarPercentualUmaCasa, NOTA_PAYBACK_DESCONTADO_ANTES_DO_SIMPLES, precisaNotaPaybackDescontado, resumirRecebimentosPorMes, resumirVendasPorTipologia, ROTULO_PAPEL_CUSTO } from "./resumo.js";

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
export async function gerarExcelViabilidade(dados: DadosRelatorioViabilidade, opcoes: { resumido?: boolean } = {}): Promise<Buffer> {
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
  const linhasResumo: [string, number | string][] = [
    ["VGV (inclui permuta)", numero(dados.resumoExecutivo.vgv)],
    ["VGV permutado (incluído no VGV)", numero(dados.resumoExecutivo.vgvPermutado)],
    ["VGV líquido (bruto menos comissão e permuta)", numero(dados.resumoExecutivo.vgvLiquido)],
    ["Unidades", dados.resumoExecutivo.quantidadeUnidades],
    ...(dados.resumoExecutivo.unidadesProjetadas > 0
      ? ([
          ["Unidades vendidas (reais)", dados.resumoExecutivo.unidadesVendidas],
          ["Unidades projetadas (premissa de velocidade)", dados.resumoExecutivo.unidadesProjetadas],
          ["VGV real", numero(dados.resumoExecutivo.vgvReal)],
          ["VGV projetado", numero(dados.resumoExecutivo.vgvProjetado)],
        ] as [string, number | string][])
      : ([["Unidades vendidas", dados.resumoExecutivo.unidadesVendidas]] as [string, number | string][])),
    ["Recebimentos previstos", numero(dados.resumoExecutivo.totalRecebimentosPrevisto)],
    ["Custos previstos (inclui terreno por permuta)", numero(dados.resumoExecutivo.totalCustosPrevisto)],
    ["Fluxo líquido (saldo final)", numero(dados.resumoExecutivo.saldoFinal)],
    ["Necessidade máxima de capital", numero(dados.resumoExecutivo.necessidadeMaximaCapital)],
    ["Taxa de desconto (a.m.)", formatarPercentualMensal(dados.resumoExecutivo.taxaDescontoMensal)],
    [`VPL (${formatarPercentualMensal(dados.resumoExecutivo.taxaDescontoMensal)} a.m.)`, numero(dados.resumoExecutivo.vpl)],
    ["TIR (a.m.)", dados.resumoExecutivo.tir !== null ? formatarPercentualMensal(dados.resumoExecutivo.tir) : "não aplicável"],
    ["Resultado (margem líquida)", dados.resumoExecutivo.margemLiquida !== null ? formatarPercentualUmaCasa(dados.resumoExecutivo.margemLiquida) : "não aplicável"],
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
  for (const aviso of dados.premissas.avisos) premissas.addRow([`AVISO: ${aviso}`]);
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

  if (dados.premissas.vendas.projetadas > 0) {
    const projetadasSheet = wb.addWorksheet("Vendas projetadas");
    const cab = projetadasSheet.addRow(["Tipologia", "Unidades projetadas", "VGV projetado", "Ticket médio"]);
    estilizarCabecalho(cab);
    for (const l of dados.premissas.vendas.projetadasPorTipologia) {
      const row = projetadasSheet.addRow([l.tipologiaNome, l.unidades, numero(l.vgv), l.ticketMedio ? numero(l.ticketMedio) : null]);
      row.getCell(3).numFmt = FMT_MOEDA;
      row.getCell(4).numFmt = FMT_MOEDA;
    }
    const unidades = dados.resumoExecutivo.unidadesProjetadas;
    const total = projetadasSheet.addRow(["Total", unidades, numero(dados.resumoExecutivo.vgvProjetado), unidades > 0 ? numero((Number(dados.resumoExecutivo.vgvProjetado) / unidades).toFixed(2)) : null]);
    total.font = { bold: true };
    total.getCell(3).numFmt = FMT_MOEDA;
    total.getCell(4).numFmt = FMT_MOEDA;
    projetadasSheet.columns.forEach((c) => (c.width = 22));
  }

  if (opcoes.resumido) {
    const vendasResumo = resumirVendasPorTipologia(dados.vendas);
    if (vendasResumo.linhas.length > 0) {
      const vendasSheet = wb.addWorksheet("Vendas por tipologia");
      const cab = vendasSheet.addRow(["Tipologia", "Unidades vendidas", "VGV vendido", "Ticket médio"]);
      estilizarCabecalho(cab);
      for (const l of vendasResumo.linhas) {
        const row = vendasSheet.addRow([l.tipologiaNome, l.unidadesVendidas, numero(l.vgvVendido), l.ticketMedio ? numero(l.ticketMedio) : null]);
        row.getCell(3).numFmt = FMT_MOEDA;
        row.getCell(4).numFmt = FMT_MOEDA;
      }
      const total = vendasSheet.addRow(["Total", vendasResumo.total.unidadesVendidas, numero(vendasResumo.total.vgvVendido), vendasResumo.total.ticketMedio ? numero(vendasResumo.total.ticketMedio) : null]);
      total.font = { bold: true };
      total.getCell(3).numFmt = FMT_MOEDA;
      total.getCell(4).numFmt = FMT_MOEDA;
      vendasSheet.columns.forEach((c) => (c.width = 22));
    }
  } else if (dados.vendas.length > 0) {
    const vendasSheet = wb.addWorksheet("Vendas");
    const cab = vendasSheet.addRow(["Unidade", "Tipologia", "Comprador", "Mês", "Valor", "Condição de pagamento", "Status"]);
    estilizarCabecalho(cab);
    for (const v of dados.vendas) {
      const row = vendasSheet.addRow([v.unidadeNumero, v.tipologiaNome, v.comprador ?? "", v.mesOrigem, numero(v.valorVenda), v.condicaoPagamentoNome, v.status]);
      row.getCell(5).numFmt = FMT_MOEDA;
    }
    vendasSheet.columns.forEach((c) => (c.width = 18));
  }

  if (opcoes.resumido) {
    const recebimentosResumo = resumirRecebimentosPorMes(dados.recebimentos, dados.cenario.horizonteProjecaoMeses);
    const recSheet = wb.addWorksheet("Recebimentos por mês");
    const cab = recSheet.addRow(["Mês", "Total previsto", "Total realizado"]);
    estilizarCabecalho(cab);
    for (const l of recebimentosResumo.linhas) {
      const row = recSheet.addRow([l.mes, numero(l.totalPrevisto), numero(l.totalRealizado)]);
      row.getCell(2).numFmt = FMT_MOEDA;
      row.getCell(3).numFmt = FMT_MOEDA;
    }
    const total = recSheet.addRow(["Total", numero(recebimentosResumo.total.totalPrevisto), numero(recebimentosResumo.total.totalRealizado)]);
    total.font = { bold: true };
    total.getCell(2).numFmt = FMT_MOEDA;
    total.getCell(3).numFmt = FMT_MOEDA;
    recSheet.columns.forEach((c) => (c.width = 18));
  } else if (dados.recebimentos.length > 0) {
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
    const cab = custosSheet.addRow(["Categoria", "Tipo de incidência", "Tipologia", "Recorrência", "Status", "Previsto", "Realizado", "Saldo a realizar", "Desvio", "Desvio %", "Papel"]);
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
        ROTULO_PAPEL_CUSTO[c.papel] ?? c.papel,
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
  const cabFluxo = ["Mês", "Entradas (inclui liberação do financiamento)", "Saídas", "Fluxo mensal", "Saldo acumulado"];
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
  fluxoSheet.getColumn(2).width = 40;

  const necessidadeSheet = wb.addWorksheet("Necessidade de Capital");
  adicionarTabela(necessidadeSheet, ["Indicador", "Valor"], []);
  const linhasNecessidade: [string, string | number][] = [
    ["Necessidade máxima de capital", numero(dados.resumoExecutivo.necessidadeMaximaCapital)],
    ["Mês do pico", dados.resumoExecutivo.mesPico ?? "—"],
    ["Mês de recuperação", dados.resumoExecutivo.mesRecuperacao ?? "—"],
    ["Mês de recuperação (descontado)", dados.resumoExecutivo.mesRecuperacaoDescontado ?? "não recupera no horizonte"],
    ["Saldo final", numero(dados.resumoExecutivo.saldoFinal)],
    ["VPL", numero(dados.resumoExecutivo.vpl)],
  ];
  for (const [rotulo, valor] of linhasNecessidade) {
    const row = necessidadeSheet.addRow([rotulo, valor]);
    if (typeof valor === "number") row.getCell(2).numFmt = FMT_MOEDA;
  }
  if (precisaNotaPaybackDescontado(dados.resumoExecutivo.mesRecuperacao, dados.resumoExecutivo.mesRecuperacaoDescontado)) {
    necessidadeSheet.addRow([NOTA_PAYBACK_DESCONTADO_ANTES_DO_SIMPLES]);
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
    { rotulo: "VGV (inclui permuta)", acessor: (c) => c.indicadores.vgv, moeda: true },
    { rotulo: "Recebimentos previstos", acessor: (c) => c.indicadores.totalRecebimentosPrevisto, moeda: true },
    { rotulo: "Custos previstos (inclui terreno por permuta)", acessor: (c) => c.indicadores.totalCustosPrevisto, moeda: true },
    { rotulo: "Fluxo líquido (saldo final)", acessor: (c) => c.indicadores.saldoFinal, moeda: true },
    { rotulo: "Necessidade máxima de capital", acessor: (c) => c.indicadores.necessidadeMaximaCapital, moeda: true },
    { rotulo: "VPL", acessor: (c) => c.indicadores.vpl, moeda: true },
    { rotulo: "Taxa de desconto (a.m.)", acessor: (c) => formatarPercentualMensal(c.indicadores.taxaDescontoMensal), moeda: false },
    { rotulo: "TIR (a.m.)", acessor: (c) => (c.indicadores.tir !== null ? formatarPercentualMensal(c.indicadores.tir) : "não aplicável"), moeda: false },
    { rotulo: "Resultado (margem líquida)", acessor: (c) => (c.indicadores.margemLiquida !== null ? formatarPercentualUmaCasa(c.indicadores.margemLiquida) : "não aplicável"), moeda: false },
  ];
  for (const linha of linhasIndicadores) {
    const row = resumo.addRow([linha.rotulo, ...dados.cenarios.map((c) => numero(linha.acessor(c)))]);
    if (linha.moeda) for (let i = 2; i <= dados.cenarios.length + 1; i++) row.getCell(i).numFmt = FMT_MOEDA;
  }
  resumo.addRow(["Mês do pico", ...dados.cenarios.map((c) => c.indicadores.mesPico ?? "—")]);
  resumo.addRow(["Mês de recuperação", ...dados.cenarios.map((c) => c.indicadores.mesRecuperacao ?? "—")]);
  resumo.addRow(["Mês de recuperação (descontado)", ...dados.cenarios.map((c) => c.indicadores.mesRecuperacaoDescontado ?? "não recupera no horizonte")]);
  if (dados.cenarios.some((c) => precisaNotaPaybackDescontado(c.indicadores.mesRecuperacao, c.indicadores.mesRecuperacaoDescontado))) {
    resumo.addRow([NOTA_PAYBACK_DESCONTADO_ANTES_DO_SIMPLES]);
  }
  resumo.addRow(["VGV líquido", ...dados.cenarios.map((c) => numero(c.indicadores.vgvLiquido))]);
  resumo.columns.forEach((c) => (c.width = 22));

  const premissas = wb.addWorksheet("Premissas");
  const cabPrem = premissas.addRow(["Cenário", "Horizonte (meses)", "Limite de risco", "Vendas reais / projetadas", "Financiamento contratado"]);
  estilizarCabecalho(cabPrem);
  for (const c of dados.cenarios) {
    const row = premissas.addRow([
      c.nome,
      c.premissas.horizonteProjecaoMeses,
      c.premissas.limiteNecessidadeMaximaCapital ? `${(Number(c.premissas.limiteNecessidadeMaximaCapital) * 100).toFixed(1)}%` : "padrão (30%)",
      `${c.premissas.vendas.reais} / ${c.premissas.vendas.projetadas}`,
      c.premissas.financiamento ? numero(c.premissas.financiamento.valorContratado) : 0,
    ]);
    if (c.premissas.financiamento) row.getCell(5).numFmt = FMT_MOEDA;
  }
  for (const c of dados.cenarios) for (const aviso of c.premissas.avisos) premissas.addRow([`AVISO: ${c.nome}: ${aviso}`]);
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
  const cabFluxo = fluxoSheet.addRow(["Cenário", "Mês", "Entradas (inclui liberação do financiamento)", "Saídas", "Fluxo mensal", "Saldo acumulado"]);
  estilizarCabecalho(cabFluxo);
  for (const c of dados.cenarios) {
    for (const f of c.fluxoMensal) {
      const row = fluxoSheet.addRow([c.nome, f.mes, numero(f.entradas), numero(f.saidas), numero(f.fluxoMensal), numero(f.fluxoAcumulado)]);
      [3, 4, 5, 6].forEach((i) => (row.getCell(i).numFmt = FMT_MOEDA));
    }
  }
  fluxoSheet.columns.forEach((c) => (c.width = 18));
  fluxoSheet.getColumn(3).width = 40;

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
