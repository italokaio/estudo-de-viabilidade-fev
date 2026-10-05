// Snapshot dos empreendimentos existentes: fluxo de caixa (JSON) e texto do PDF de viabilidade.
// Serve para provar que um refactor não mudou nenhum número oficial. Ver README.md desta pasta.
//
//   node scripts/snapshot/snapshot.mjs --saida <pasta> [--referencia <pasta>]
//
// Login: variáveis SNAPSHOT_EMAIL e SNAPSHOT_SENHA (conta admin). API: SNAPSHOT_API (padrão http://localhost:3333).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";

const args = process.argv.slice(2);
const valorDe = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const saida = valorDe("--saida");
const referencia = valorDe("--referencia");
if (!saida) {
  console.error("uso: node scripts/snapshot/snapshot.mjs --saida <pasta> [--referencia <pasta>]");
  process.exit(2);
}
const email = process.env.SNAPSHOT_EMAIL;
const senha = process.env.SNAPSHOT_SENHA;
if (!email || !senha) {
  console.error("defina SNAPSHOT_EMAIL e SNAPSHOT_SENHA (conta admin)");
  process.exit(2);
}
const API = process.env.SNAPSHOT_API ?? "http://localhost:3333";

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, senha }),
});
const setCookie = login.headers.get("set-cookie");
if (login.status >= 400 || !setCookie) {
  console.error(`login falhou (${login.status})`);
  process.exit(1);
}
const cookie = setCookie.split(";")[0];

async function get(url) {
  const r = await fetch(API + url, { headers: { cookie } });
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
}

mkdirSync(saida, { recursive: true });
const empreendimentos = JSON.parse((await get("/api/empreendimentos")).bytes.toString());
const resumo = [];
for (const e of empreendimentos) {
  const det = JSON.parse((await get(`/api/empreendimentos/${e.id}`)).bytes.toString());
  for (const c of det.cenarios) {
    const fluxo = JSON.parse((await get(`/api/cenarios/${c.id}/fluxo-caixa`)).bytes.toString());
    const pdf = await get(`/api/cenarios/${c.id}/relatorios/viabilidade.pdf`);
    const texto = pdf.status === 200 ? (await new PDFParse({ data: pdf.bytes }).getText()).text : `status ${pdf.status}`;
    const nome = `${e.nome} · ${c.nome}`.replace(/[^\w· -]/g, "_");
    writeFileSync(join(saida, `${nome}.fluxo.json`), JSON.stringify(fluxo, null, 1));
    writeFileSync(join(saida, `${nome}.pdf.txt`), texto);
    resumo.push({ nome, indicadores: fluxo.indicadores });
  }
}
writeFileSync(join(saida, "resumo.json"), JSON.stringify(resumo, null, 1));
console.log(`cenários: ${resumo.length} · saída: ${saida}`);

if (referencia) {
  const CARIMBO = /\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}:\d{2}/g;
  const normalizar = (t) => t.replace(CARIMBO, "<carimbo>");
  const arquivosRef = readdirSync(referencia).sort();
  const arquivosNovos = readdirSync(saida).sort();
  const divergentes = [];
  if (arquivosRef.join("|") !== arquivosNovos.join("|")) divergentes.push("lista de arquivos diferente");
  for (const nome of arquivosRef) {
    const a = normalizar(readFileSync(join(referencia, nome), "utf8"));
    const b = normalizar(readFileSync(join(saida, nome), "utf8").toString());
    if (a !== b) divergentes.push(nome);
  }
  if (divergentes.length) {
    console.error(`DIVERGÊNCIA em ${divergentes.length} item(ns):`);
    for (const d of divergentes) console.error(" - " + d);
    process.exit(1);
  }
  console.log(`IDÊNTICO à referência (${arquivosRef.length} arquivos, carimbos de hora ignorados).`);
}
