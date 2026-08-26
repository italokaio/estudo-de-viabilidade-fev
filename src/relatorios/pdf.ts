import PDFDocument from "pdfkit";
import type { DadosRelatorioComparativo, DadosRelatorioViabilidade } from "./dados.js";
import type { ComparacaoCenario } from "../db/servicoMotor.js";

/**
 * Fase 2.5 — PDF do relatório de viabilidade/comparativo. Desenho vetorial
 * puro (pdfkit), sem headless browser. Nenhuma conta acontece aqui — só
 * formata o que já vem pronto de `src/relatorios/dados.ts`. Ver
 * docs/DECISOES.md, achado F34.
 */

const COR_TEXTO = "#111827";
const COR_MUTED = "#6b7280";
const COR_ACCENT = "#b45309";
const COR_BORDA = "#d1d5db";
const COR_CABECALHO_TABELA = "#1f2937";
const COR_ZEBRA = "#f9fafb";
const PALETA = ["#2563eb", "#d97706", "#059669", "#dc2626", "#7c3aed", "#0891b2"];

const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const MARGEM_LATERAL = 50;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM_LATERAL * 2;
const TOPO_CONTEUDO = 78;
const LIMITE_INFERIOR = ALTURA_PAGINA - 70;

function formatarMoeda(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarPercentual01(valor: number): string {
  return `${(valor * 100).toFixed(1)}%`;
}
function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

interface Cursor {
  y: number;
}

/**
 * A capa (primeira página) não leva o cabeçalho corrente -- ela já tem seu
 * próprio título grande. `pageAdded` dispara para toda página, inclusive a
 * capa; por isso conta as páginas e pula a primeira.
 */
function registrarCabecalhoCorrente(doc: PDFKit.PDFDocument, empreendimento: string, subtitulo: string) {
  let contagem = 0;
  doc.on("pageAdded", () => {
    contagem++;
    if (contagem === 1) return;
    doc
      .fontSize(8.5)
      .fillColor(COR_MUTED)
      .text(empreendimento, MARGEM_LATERAL, 28, { continued: false })
      .text(subtitulo, MARGEM_LATERAL, 28, { align: "right", width: LARGURA_UTIL });
    doc
      .moveTo(MARGEM_LATERAL, 44)
      .lineTo(LARGURA_PAGINA - MARGEM_LATERAL, 44)
      .strokeColor(COR_BORDA)
      .lineWidth(0.75)
      .stroke();
    doc.fillColor(COR_TEXTO);
  });
}

/**
 * Escrito num y bem dentro da margem real do documento (ver criação do
 * PDFDocument abaixo, margins pequenas) -- escrever texto além da margem
 * inferior real faz o pdfkit entender que o conteúdo não coube e criar
 * páginas extras sozinho (acontecia aqui antes desta correção).
 */
function desenharRodapes(doc: PDFKit.PDFDocument, geradoEm: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue; // capa não leva rodapé de paginação
    doc
      .fontSize(8)
      .fillColor(COR_MUTED)
      .text(`Gerado em ${formatarDataHora(geradoEm)} - Firmus ERP de Viabilidade`, MARGEM_LATERAL, ALTURA_PAGINA - 40, { width: LARGURA_UTIL / 2, lineBreak: false })
      .text(`Página ${i - range.start} de ${range.count - 1}`, MARGEM_LATERAL + LARGURA_UTIL / 2, ALTURA_PAGINA - 40, {
        width: LARGURA_UTIL / 2,
        align: "right",
        lineBreak: false,
      });
  }
}

function garantirEspaco(doc: PDFKit.PDFDocument, cursor: Cursor, alturaNecessaria: number) {
  if (cursor.y + alturaNecessaria > LIMITE_INFERIOR) {
    doc.addPage();
    cursor.y = TOPO_CONTEUDO;
  }
}

function escreverTituloSecao(doc: PDFKit.PDFDocument, cursor: Cursor, texto: string) {
  garantirEspaco(doc, cursor, 30);
  doc.fontSize(13).fillColor(COR_ACCENT).font("Helvetica-Bold").text(texto, MARGEM_LATERAL, cursor.y, { width: LARGURA_UTIL });
  cursor.y = doc.y + 8;
  doc.font("Helvetica").fillColor(COR_TEXTO);
}

function escreverParagrafo(doc: PDFKit.PDFDocument, cursor: Cursor, texto: string) {
  garantirEspaco(doc, cursor, 16);
  doc.fontSize(9.5).fillColor(COR_TEXTO).text(texto, MARGEM_LATERAL, cursor.y, { width: LARGURA_UTIL });
  cursor.y = doc.y + 6;
}

interface ColunaTabela {
  titulo: string;
  largura: number;
  alinhar?: "left" | "right" | "center";
}

/** Tabela com quebra de página controlada: nunca deixa uma linha cortada entre páginas — se não cabe, a página inteira vira antes da linha, e o cabeçalho é redesenhado na nova página. */
function desenharTabela(doc: PDFKit.PDFDocument, cursor: Cursor, colunas: ColunaTabela[], linhas: string[][]) {
  const ALTURA_LINHA = 15;
  const ALTURA_CABECALHO = 18;

  function desenharCabecalhoTabela() {
    garantirEspaco(doc, cursor, ALTURA_CABECALHO + ALTURA_LINHA);
    let x = MARGEM_LATERAL;
    doc
      .rect(MARGEM_LATERAL, cursor.y, LARGURA_UTIL, ALTURA_CABECALHO)
      .fill(COR_CABECALHO_TABELA);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#ffffff");
    for (const col of colunas) {
      doc.text(truncar(doc, col.titulo, col.largura - 8), x + 4, cursor.y + 5, { width: col.largura - 8, align: col.alinhar ?? "left", lineBreak: false });
      x += col.largura;
    }
    cursor.y += ALTURA_CABECALHO;
    doc.font("Helvetica").fillColor(COR_TEXTO);
  }

  desenharCabecalhoTabela();
  linhas.forEach((linha, i) => {
    if (cursor.y + ALTURA_LINHA > LIMITE_INFERIOR) {
      doc.addPage();
      cursor.y = TOPO_CONTEUDO;
      desenharCabecalhoTabela();
    }
    if (i % 2 === 1) {
      doc.rect(MARGEM_LATERAL, cursor.y, LARGURA_UTIL, ALTURA_LINHA).fill(COR_ZEBRA);
      doc.fillColor(COR_TEXTO);
    }
    let x = MARGEM_LATERAL;
    doc.fontSize(8);
    linha.forEach((valor, ci) => {
      const col = colunas[ci]!;
      doc.text(truncar(doc, valor, col.largura - 8), x + 4, cursor.y + 4, { width: col.largura - 8, align: col.alinhar ?? "left", lineBreak: false });
      x += col.largura;
    });
    cursor.y += ALTURA_LINHA;
  });
  doc
    .moveTo(MARGEM_LATERAL, cursor.y)
    .lineTo(MARGEM_LATERAL + LARGURA_UTIL, cursor.y)
    .strokeColor(COR_BORDA)
    .lineWidth(0.5)
    .stroke();
  cursor.y += 12;
}

function escreverChaveValor(doc: PDFKit.PDFDocument, cursor: Cursor, pares: [string, string][]) {
  for (const [chave, valor] of pares) {
    garantirEspaco(doc, cursor, 15);
    doc.fontSize(9).fillColor(COR_MUTED).text(chave, MARGEM_LATERAL, cursor.y, { width: 220, continued: false });
    doc.fontSize(9).fillColor(COR_TEXTO).font("Helvetica-Bold").text(valor, MARGEM_LATERAL + 220, cursor.y, { width: LARGURA_UTIL - 220, align: "right" });
    doc.font("Helvetica");
    cursor.y += 15;
  }
  cursor.y += 6;
}

/** Gráfico de fluxo de caixa (barras entradas/saídas + linha de saldo acumulado) desenhado com primitivas do pdfkit — mesma leitura visual de FluxoChart.tsx (web), sem nenhuma lib de gráficos. */
function desenharGraficoFluxo(doc: PDFKit.PDFDocument, cursor: Cursor, pontos: { mes: number; entradas: string; saidas: string; fluxoAcumulado: string }[]) {
  if (pontos.length === 0) return;
  const ALTURA = 180;
  garantirEspaco(doc, cursor, ALTURA + 20);
  const x0 = MARGEM_LATERAL;
  const y0 = cursor.y;
  const largura = LARGURA_UTIL;
  const padEsq = 45;
  const padDir = 5;
  const plotW = largura - padEsq - padDir;
  const plotH = ALTURA - 20;

  const valores = pontos.flatMap((p) => [Number(p.entradas), -Number(p.saidas), Number(p.fluxoAcumulado)]);
  let vMax = Math.max(...valores, 0);
  let vMin = Math.min(...valores, 0);
  const pad = (vMax - vMin) * 0.08 || 1;
  vMax += pad;
  vMin -= pad;

  const escalaY = (v: number) => y0 + plotH * (1 - (v - vMin) / (vMax - vMin));
  const zeroY = escalaY(0);
  const n = pontos.length;
  const passoX = plotW / n;
  const centroX = (i: number) => x0 + padEsq + passoX * (i + 0.5);

  doc.fontSize(7).fillColor(COR_MUTED);
  for (let s = 0; s <= 4; s++) {
    const v = vMin + ((vMax - vMin) * s) / 4;
    const y = escalaY(v);
    doc
      .moveTo(x0 + padEsq, y)
      .lineTo(x0 + largura - padDir, y)
      .strokeColor(COR_BORDA)
      .lineWidth(0.4)
      .stroke();
    doc.text(formatarMoedaAbreviada(v), x0, y - 3, { width: padEsq - 4, align: "right" });
  }

  const larguraBarra = Math.max(0.6, passoX * 0.35);
  pontos.forEach((p, i) => {
    const cx = centroX(i);
    const yEnt = escalaY(Number(p.entradas));
    const ySai = escalaY(-Number(p.saidas));
    doc.rect(cx - larguraBarra - 0.5, Math.min(yEnt, zeroY), larguraBarra, Math.abs(zeroY - yEnt)).fill(PALETA[0]!);
    doc.rect(cx + 0.5, Math.min(ySai, zeroY), larguraBarra, Math.abs(ySai - zeroY)).fill(COR_MUTED);
  });

  doc
    .moveTo(x0 + padEsq, zeroY)
    .lineTo(x0 + largura - padDir, zeroY)
    .strokeColor(COR_BORDA)
    .lineWidth(0.6)
    .stroke();

  doc.strokeColor(PALETA[1]!).lineWidth(1.3);
  doc.moveTo(centroX(0), escalaY(Number(pontos[0]!.fluxoAcumulado)));
  for (let i = 1; i < n; i++) doc.lineTo(centroX(i), escalaY(Number(pontos[i]!.fluxoAcumulado)));
  doc.stroke();

  doc.fontSize(7).fillColor(COR_MUTED);
  const passoRotulo = n > 24 ? 4 : n > 12 ? 2 : 1;
  pontos.forEach((p, i) => {
    if (p.mes % passoRotulo !== 0 && i !== 0 && i !== n - 1) return;
    doc.text(String(p.mes), centroX(i) - 8, y0 + plotH + 3, { width: 16, align: "center" });
  });

  let xLegendaFluxo = x0 + padEsq;
  xLegendaFluxo = desenharItemLegenda(doc, xLegendaFluxo, y0 + ALTURA - 8, PALETA[0]!, "Entradas");
  xLegendaFluxo = desenharItemLegenda(doc, xLegendaFluxo, y0 + ALTURA - 8, COR_MUTED, "Saídas");
  desenharItemLegenda(doc, xLegendaFluxo, y0 + ALTURA - 8, PALETA[1]!, "Saldo acumulado");
  doc.fillColor(COR_TEXTO);

  cursor.y = y0 + ALTURA + 14;
}

function formatarMoedaAbreviada(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}${(abs / 1_000_000).toFixed(1)}mi`;
  if (abs >= 1_000) return `${sinal}${(abs / 1_000).toFixed(0)}mil`;
  return `${sinal}${abs.toFixed(0)}`;
}

/**
 * Item de legenda com um quadrado desenhado (rect), nunca o caractere "■"
 * -- as fontes padrão do pdfkit (WinAnsi) não têm esse glifo e ele saía
 * como "%" no PDF renderizado. Devolve o x logo depois do texto, para
 * encadear vários itens na mesma linha.
 */
function desenharItemLegenda(doc: PDFKit.PDFDocument, x: number, y: number, cor: string, texto: string): number {
  doc.rect(x, y + 2, 7, 7).fill(cor);
  doc.fillColor(COR_TEXTO).fontSize(7.5).text(texto, x + 11, y, { lineBreak: false });
  return x + 11 + doc.widthOfString(texto) + 14;
}

/** Trunca com reticências para caber em `largura` pt -- garante uma linha só, sem depender do `ellipsis` nativo do pdfkit (não se comportou de forma confiável em colunas estreitas). */
function truncar(doc: PDFKit.PDFDocument, texto: string, largura: number): string {
  if (doc.widthOfString(texto) <= largura) return texto;
  let resultado = texto;
  while (resultado.length > 1 && doc.widthOfString(`${resultado}…`) > largura) {
    resultado = resultado.slice(0, -1);
  }
  return `${resultado}…`;
}

function desenharCapa(doc: PDFKit.PDFDocument, opts: { tituloRelatorio: string; empreendimento: string; identificacao?: string; cenario?: string; geradoEm: string }) {
  doc.fontSize(11).fillColor(COR_MUTED).text("FIRMUS — ERP DE VIABILIDADE", MARGEM_LATERAL, 120);
  doc.fontSize(26).fillColor(COR_TEXTO).font("Helvetica-Bold").text(opts.tituloRelatorio, MARGEM_LATERAL, 160, { width: LARGURA_UTIL });
  doc.font("Helvetica");
  doc.fontSize(18).fillColor(COR_ACCENT).text(opts.empreendimento, MARGEM_LATERAL, 230, { width: LARGURA_UTIL });
  if (opts.identificacao) doc.fontSize(10).fillColor(COR_MUTED).text(opts.identificacao, MARGEM_LATERAL, 260, { width: LARGURA_UTIL });

  let y = 330;
  doc.fontSize(9.5).fillColor(COR_MUTED);
  if (opts.cenario) {
    doc.text("Cenário analisado", MARGEM_LATERAL, y);
    doc.fontSize(12).fillColor(COR_TEXTO).text(opts.cenario, MARGEM_LATERAL, y + 14);
    y += 45;
    doc.fontSize(9.5).fillColor(COR_MUTED);
  }
  doc.text("Gerado em", MARGEM_LATERAL, y);
  doc.fontSize(12).fillColor(COR_TEXTO).text(formatarDataHora(opts.geradoEm), MARGEM_LATERAL, y + 14);

  doc
    .fontSize(7.5)
    .fillColor(COR_MUTED)
    .text(
      "Documento gerado automaticamente a partir dos dados e resultados oficiais do sistema — nenhum valor apresentado é recalculado ou estimado fora do motor financeiro do ERP.",
      MARGEM_LATERAL,
      ALTURA_PAGINA - 90,
      { width: LARGURA_UTIL },
    );
}

function finalizarDocumento(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function gerarPdfViabilidade(dados: DadosRelatorioViabilidade): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 20, bottom: 20, left: MARGEM_LATERAL, right: MARGEM_LATERAL }, bufferPages: true, autoFirstPage: false });
  registrarCabecalhoCorrente(doc, dados.empreendimento.nome, `Cenário: ${dados.cenario.nome}`);

  doc.addPage();
  desenharCapa(doc, {
    tituloRelatorio: "Relatório de Viabilidade",
    empreendimento: dados.empreendimento.nome,
    identificacao: dados.empreendimento.incorporador ?? undefined,
    cenario: `${dados.cenario.nome} (${dados.cenario.tipo})${dados.cenario.derivadoDeNome ? ` — derivado de ${dados.cenario.derivadoDeNome}` : ""}`,
    geradoEm: dados.geradoEm,
  });

  doc.addPage();
  const cursor: Cursor = { y: TOPO_CONTEUDO };

  escreverTituloSecao(doc, cursor, "Resumo Executivo");
  escreverChaveValor(doc, cursor, [
    ["VGV", formatarMoeda(dados.resumoExecutivo.vgv)],
    ["Unidades", String(dados.resumoExecutivo.quantidadeUnidades)],
    ["Unidades vendidas", String(dados.resumoExecutivo.unidadesVendidas)],
    ["Recebimentos previstos", formatarMoeda(dados.resumoExecutivo.totalRecebimentosPrevisto)],
    ["Custos previstos", formatarMoeda(dados.resumoExecutivo.totalCustosPrevisto)],
    ["Fluxo líquido (saldo final)", formatarMoeda(dados.resumoExecutivo.saldoFinal)],
    ["Necessidade máxima de capital", formatarMoeda(dados.resumoExecutivo.necessidadeMaximaCapital)],
    ["Mês do pico", dados.resumoExecutivo.mesPico !== null ? `Mês ${dados.resumoExecutivo.mesPico}` : "—"],
    ["Mês de recuperação", dados.resumoExecutivo.mesRecuperacao !== null ? `Mês ${dados.resumoExecutivo.mesRecuperacao}` : "—"],
    ["VPL", formatarMoeda(dados.resumoExecutivo.vpl)],
  ]);
  if (dados.alertas.length > 0) {
    for (const a of dados.alertas) escreverParagrafo(doc, cursor, `${a.severidade === "critico" ? "[ALERTA] " : "- "}${a.mensagem}`);
  }

  escreverTituloSecao(doc, cursor, "Premissas");
  escreverChaveValor(doc, cursor, [
    ["Horizonte de projeção", `${dados.premissas.horizonteProjecaoMeses} meses`],
    [
      "Limite de necessidade de capital",
      dados.premissas.limiteNecessidadeMaximaCapital ? formatarPercentual01(Number(dados.premissas.limiteNecessidadeMaximaCapital)) : "padrão (30%)",
    ],
    ["Velocidade de vendas — total previsto", `${dados.premissas.velocidadeVendas.totalUnidadesPrevistas} unidade(s)`],
  ]);
  if (dados.premissas.velocidadeVendas.porTipologia.length > 0) {
    desenharTabela(
      doc,
      cursor,
      [
        { titulo: "Tipologia", largura: LARGURA_UTIL * 0.7 },
        { titulo: "Unidades previstas", largura: LARGURA_UTIL * 0.3, alinhar: "right" },
      ],
      dados.premissas.velocidadeVendas.porTipologia.map((t) => [t.tipologiaNome, t.totalUnidadesPrevistas]),
    );
  }
  if (dados.premissas.financiamento) {
    escreverChaveValor(doc, cursor, [
      ["Financiamento — valor contratado", formatarMoeda(dados.premissas.financiamento.valorContratado)],
      ["Financiamento — taxa de juros mensal", formatarPercentual01(Number(dados.premissas.financiamento.taxaJurosMensal))],
      ["Financiamento — tipo de amortização", dados.premissas.financiamento.tipoAmortizacao],
    ]);
  }

  escreverTituloSecao(doc, cursor, "Produto e Unidades");
  desenharTabela(
    doc,
    cursor,
    [
      { titulo: "Tipologia", largura: LARGURA_UTIL * 0.4 },
      { titulo: "Área privativa", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
      { titulo: "Preço unitário", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
      { titulo: "Unidades", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
    ],
    dados.produto.tipologias.map((t) => [t.nome, t.areaPrivativaPadrao ? `${t.areaPrivativaPadrao} m²` : "—", t.precoUnitarioPadrao ? formatarMoeda(t.precoUnitarioPadrao) : "—", String(t.quantidadeUnidades)]),
  );
  escreverParagrafo(doc, cursor, `Estoque: ${Object.entries(dados.produto.estoque.porStatus).map(([s, q]) => `${s} ${q}`).join("  -  ")}  -  total ${dados.produto.estoque.total}`);

  if (dados.vendas.length > 0) {
    escreverTituloSecao(doc, cursor, "Vendas");
    desenharTabela(
      doc,
      cursor,
      [
        { titulo: "Unidade", largura: LARGURA_UTIL * 0.15 },
        { titulo: "Tipologia", largura: LARGURA_UTIL * 0.2 },
        { titulo: "Comprador", largura: LARGURA_UTIL * 0.25 },
        { titulo: "Mês", largura: LARGURA_UTIL * 0.1, alinhar: "right" },
        { titulo: "Valor", largura: LARGURA_UTIL * 0.15, alinhar: "right" },
        { titulo: "Status", largura: LARGURA_UTIL * 0.15 },
      ],
      dados.vendas.map((v) => [v.unidadeNumero, v.tipologiaNome, v.comprador ?? "—", String(v.mesOrigem), formatarMoeda(v.valorVenda), v.status]),
    );
  }

  if (dados.recebimentos.length > 0) {
    escreverTituloSecao(doc, cursor, "Recebimentos Projetados");
    desenharTabela(
      doc,
      cursor,
      [
        { titulo: "Unidade", largura: LARGURA_UTIL * 0.15 },
        { titulo: "Modalidade", largura: LARGURA_UTIL * 0.25 },
        { titulo: "Mês", largura: LARGURA_UTIL * 0.1, alinhar: "right" },
        { titulo: "Previsto", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
        { titulo: "Realizado", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
        { titulo: "Status", largura: LARGURA_UTIL * 0.1 },
      ],
      dados.recebimentos.map((r) => [r.unidadeNumero, r.modalidadeNome, String(r.mesCompetencia), formatarMoeda(r.valorPrevisto), r.valorRealizado ? formatarMoeda(r.valorRealizado) : "—", r.status]),
    );
  }

  if (dados.custos.length > 0) {
    escreverTituloSecao(doc, cursor, "Custos");
    desenharTabela(
      doc,
      cursor,
      [
        { titulo: "Categoria", largura: LARGURA_UTIL * 0.25 },
        { titulo: "Incidência", largura: LARGURA_UTIL * 0.2 },
        { titulo: "Previsto", largura: LARGURA_UTIL * 0.18, alinhar: "right" },
        { titulo: "Realizado", largura: LARGURA_UTIL * 0.18, alinhar: "right" },
        { titulo: "Saldo", largura: LARGURA_UTIL * 0.19, alinhar: "right" },
      ],
      dados.custos.map((c) => [c.categoriaNome, c.tipoIncidencia, formatarMoeda(c.totalPrevisto), formatarMoeda(c.totalRealizado), formatarMoeda(c.saldoARealizar)]),
    );
  }

  if (dados.cronograma.length > 0) {
    escreverTituloSecao(doc, cursor, "Cronograma Físico-Financeiro");
    const mesesComExecucao = dados.cronograma.filter((p) => Number(p.percentualExecucaoMensal) > 0);
    const mesInicio = mesesComExecucao.length > 0 ? Math.min(...mesesComExecucao.map((p) => p.mes)) : null;
    const mesFim = mesesComExecucao.length > 0 ? Math.max(...mesesComExecucao.map((p) => p.mes)) : null;
    escreverParagrafo(doc, cursor, mesInicio !== null ? `Obra do mês ${mesInicio} ao mês ${mesFim}, ${dados.cronograma.length} mês(es) cadastrado(s).` : `${dados.cronograma.length} mês(es) cadastrado(s).`);
    desenharTabela(
      doc,
      cursor,
      [
        { titulo: "Mês", largura: LARGURA_UTIL * 0.15, alinhar: "right" },
        { titulo: "% físico", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
        { titulo: "% acumulado", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
        { titulo: "Desembolso", largura: LARGURA_UTIL * 0.225, alinhar: "right" },
        { titulo: "Desembolso acumulado", largura: LARGURA_UTIL * 0.225, alinhar: "right" },
      ],
      dados.cronograma.map((p) => [
        String(p.mes),
        formatarPercentual01(Number(p.percentualExecucaoMensal)),
        formatarPercentual01(Number(p.percentualAcumulado)),
        formatarMoeda(p.desembolsoMensal),
        formatarMoeda(p.desembolsoAcumulado),
      ]),
    );
  }

  escreverTituloSecao(doc, cursor, "Fluxo de Caixa");
  desenharGraficoFluxo(doc, cursor, dados.fluxoCaixa);
  desenharTabela(
    doc,
    cursor,
    [
      { titulo: "Mês", largura: LARGURA_UTIL * 0.15, alinhar: "right" },
      { titulo: "Entradas", largura: LARGURA_UTIL * 0.21, alinhar: "right" },
      { titulo: "Saídas", largura: LARGURA_UTIL * 0.21, alinhar: "right" },
      { titulo: "Fluxo mensal", largura: LARGURA_UTIL * 0.21, alinhar: "right" },
      { titulo: "Saldo acumulado", largura: LARGURA_UTIL * 0.22, alinhar: "right" },
    ],
    dados.fluxoCaixa.map((f) => [String(f.mes), formatarMoeda(f.entradas), formatarMoeda(f.saidas), formatarMoeda(f.fluxoMensal), formatarMoeda(f.fluxoAcumulado)]),
  );

  escreverTituloSecao(doc, cursor, "Necessidade de Capital");
  escreverParagrafo(
    doc,
    cursor,
    `A necessidade máxima de capital deste cenário é ${formatarMoeda(dados.resumoExecutivo.necessidadeMaximaCapital)}${
      dados.resumoExecutivo.mesPico !== null ? `, ocorrendo no mês ${dados.resumoExecutivo.mesPico}` : ""
    }.${dados.resumoExecutivo.mesRecuperacao !== null ? ` O saldo acumulado se recupera (permanece maior ou igual a zero até o fim do horizonte) a partir do mês ${dados.resumoExecutivo.mesRecuperacao}.` : " Não há recuperação do saldo acumulado dentro do horizonte projetado."}`,
  );

  desenharRodapes(doc, dados.geradoEm);
  return finalizarDocumento(doc);
}

function desenharGraficoComparativo(doc: PDFKit.PDFDocument, cursor: Cursor, cenarios: ComparacaoCenario[]) {
  const ALTURA = 180;
  garantirEspaco(doc, cursor, ALTURA + 20);
  const x0 = MARGEM_LATERAL;
  const y0 = cursor.y;
  const padEsq = 45;
  const padDir = 5;
  const plotW = LARGURA_UTIL - padEsq - padDir;
  const plotH = ALTURA - 30;

  const meses = [...new Set(cenarios.flatMap((c) => c.fluxoMensal.map((f) => f.mes)))].sort((a, b) => a - b);
  const valores = cenarios.flatMap((c) => c.fluxoMensal.map((f) => Number(f.fluxoAcumulado)));
  let vMax = Math.max(...valores, 0);
  let vMin = Math.min(...valores, 0);
  const pad = (vMax - vMin) * 0.08 || 1;
  vMax += pad;
  vMin -= pad;
  const escalaY = (v: number) => y0 + plotH * (1 - (v - vMin) / (vMax - vMin));
  const zeroY = escalaY(0);
  const n = meses.length;
  const passoX = n > 1 ? plotW / (n - 1) : plotW;
  const escalaX = (mes: number) => x0 + padEsq + passoX * meses.indexOf(mes);

  doc.fontSize(7).fillColor(COR_MUTED);
  for (let s = 0; s <= 4; s++) {
    const v = vMin + ((vMax - vMin) * s) / 4;
    const y = escalaY(v);
    doc.moveTo(x0 + padEsq, y).lineTo(x0 + LARGURA_UTIL - padDir, y).strokeColor(COR_BORDA).lineWidth(0.4).stroke();
    doc.text(formatarMoedaAbreviada(v), x0, y - 3, { width: padEsq - 4, align: "right" });
  }
  doc.moveTo(x0 + padEsq, zeroY).lineTo(x0 + LARGURA_UTIL - padDir, zeroY).strokeColor(COR_BORDA).lineWidth(0.6).stroke();

  cenarios.forEach((c, ci) => {
    const pontos = [...c.fluxoMensal].sort((a, b) => a.mes - b.mes);
    if (pontos.length === 0) return;
    doc.strokeColor(PALETA[ci % PALETA.length]!).lineWidth(1.3);
    doc.moveTo(escalaX(pontos[0]!.mes), escalaY(Number(pontos[0]!.fluxoAcumulado)));
    for (let i = 1; i < pontos.length; i++) doc.lineTo(escalaX(pontos[i]!.mes), escalaY(Number(pontos[i]!.fluxoAcumulado)));
    doc.stroke();
  });

  let xLegenda = x0 + padEsq;
  doc.fontSize(7.5);
  cenarios.forEach((c, ci) => {
    xLegenda = desenharItemLegenda(doc, xLegenda, y0 + ALTURA - 10, PALETA[ci % PALETA.length]!, c.nome);
  });
  doc.fillColor(COR_TEXTO);
  cursor.y = y0 + ALTURA + 14;
}

export async function gerarPdfComparativo(dados: DadosRelatorioComparativo): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 20, bottom: 20, left: MARGEM_LATERAL, right: MARGEM_LATERAL }, bufferPages: true, autoFirstPage: false });
  registrarCabecalhoCorrente(doc, dados.empreendimento.nome, "Relatório comparativo de cenários");

  doc.addPage();
  desenharCapa(doc, {
    tituloRelatorio: "Relatório Comparativo de Cenários",
    empreendimento: dados.empreendimento.nome,
    cenario: dados.cenarios.map((c) => c.nome).join("  -  "),
    geradoEm: dados.geradoEm,
  });

  doc.addPage();
  const cursor: Cursor = { y: TOPO_CONTEUDO };

  escreverTituloSecao(doc, cursor, "Indicadores");
  const linhasIndicadores: { rotulo: string; acessor: (c: ComparacaoCenario) => string; moeda: boolean }[] = [
    { rotulo: "VGV", acessor: (c) => c.indicadores.vgv, moeda: true },
    { rotulo: "Recebimentos previstos", acessor: (c) => c.indicadores.totalRecebimentosPrevisto, moeda: true },
    { rotulo: "Custos previstos", acessor: (c) => c.indicadores.totalCustosPrevisto, moeda: true },
    { rotulo: "Fluxo líquido (saldo final)", acessor: (c) => c.indicadores.saldoFinal, moeda: true },
    { rotulo: "Necessidade máxima de capital", acessor: (c) => c.indicadores.necessidadeMaximaCapital, moeda: true },
    { rotulo: "Mês do pico", acessor: (c) => (c.indicadores.mesPico !== null ? `Mês ${c.indicadores.mesPico}` : "—"), moeda: false },
    { rotulo: "VPL", acessor: (c) => c.indicadores.vpl, moeda: true },
  ];
  desenharTabela(
    doc,
    cursor,
    [{ titulo: "Indicador", largura: LARGURA_UTIL * 0.3 }, ...dados.cenarios.map((c) => ({ titulo: c.nome, largura: (LARGURA_UTIL * 0.7) / dados.cenarios.length, alinhar: "right" as const }))],
    linhasIndicadores.map((l) => [l.rotulo, ...dados.cenarios.map((c) => (l.moeda ? formatarMoeda(l.acessor(c)) : l.acessor(c)))]),
  );
  escreverParagrafo(doc, cursor, 'TIR e "Resultado" não aparecem porque o motor financeiro deste sistema não os calcula hoje.');

  escreverTituloSecao(doc, cursor, "Premissas");
  desenharTabela(
    doc,
    cursor,
    [
      { titulo: "Cenário", largura: LARGURA_UTIL * 0.3 },
      { titulo: "Horizonte", largura: LARGURA_UTIL * 0.2, alinhar: "right" },
      { titulo: "Velocidade de vendas", largura: LARGURA_UTIL * 0.25, alinhar: "right" },
      { titulo: "Financiamento", largura: LARGURA_UTIL * 0.25, alinhar: "right" },
    ],
    dados.cenarios.map((c) => [
      c.nome,
      `${c.premissas.horizonteProjecaoMeses} meses`,
      `${c.premissas.velocidadeVendas.totalUnidadesPrevistas} un.`,
      c.premissas.financiamento ? formatarMoeda(c.premissas.financiamento.valorContratado) : "sem financiamento",
    ]),
  );

  escreverTituloSecao(doc, cursor, "Fluxo de Caixa — Saldo Acumulado Comparado");
  desenharGraficoComparativo(doc, cursor, dados.cenarios);

  escreverTituloSecao(doc, cursor, "Necessidade de Capital");
  desenharTabela(
    doc,
    cursor,
    [
      { titulo: "Cenário", largura: LARGURA_UTIL * 0.35 },
      { titulo: "Necessidade máxima", largura: LARGURA_UTIL * 0.3, alinhar: "right" },
      { titulo: "Mês do pico", largura: LARGURA_UTIL * 0.175, alinhar: "right" },
      { titulo: "Recuperação", largura: LARGURA_UTIL * 0.175, alinhar: "right" },
    ],
    dados.cenarios.map((c) => [
      c.nome,
      formatarMoeda(c.indicadores.necessidadeMaximaCapital),
      c.indicadores.mesPico !== null ? `Mês ${c.indicadores.mesPico}` : "—",
      c.indicadores.mesRecuperacao !== null ? `Mês ${c.indicadores.mesRecuperacao}` : "—",
    ]),
  );

  desenharRodapes(doc, dados.geradoEm);
  return finalizarDocumento(doc);
}
