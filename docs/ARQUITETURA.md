# Arquitetura

> Este documento descreve o estado real do código após a Fase 0. Para o raciocínio de negócio completo que levou a estas decisões, ver os três documentos publicados nas fases anteriores:
> 1. [Especificação Splendido](https://claude.ai/code/artifact/bb949561-5224-4633-b3c5-d9c31b39bbb1) — engenharia reversa da planilha original.
> 2. [ERP Multiempreendimento](https://claude.ai/code/artifact/096b2f69-fac5-432b-8714-e1afafd0dd0a) — generalização do modelo para multiempreendimento.
> 3. [Fundação do ERP](https://claude.ai/code/artifact/cf66a27e-85fc-4b7b-85da-6f57381901a8) — validação arquitetural e definição da Fase 0.

## Princípio central

**O sistema não foi construído para o Splendido. Foi construído para analisar o Splendido.** Splendido é o primeiro registro nas tabelas genéricas do ERP — não um caso especial em nenhuma camada. Isso é verificado automaticamente: `tests/integration/semSplendidoHardcoded.test.ts` varre `src/core` e `src/db` e falha se a palavra "splendido" aparecer em qualquer lugar fora de `src/import` (onde os dados do Splendido, e só eles, têm permissão de existir).

## As três camadas

```
src/core/   motor financeiro puro — zero dependência de banco, zero I/O, 100% testável isoladamente
src/db/     ponte entre Prisma e o motor — traduz linhas de tabela (string) <-> tipos do motor (Decimal)
src/import/ dados estruturados (não lógica) de cada empreendimento + scripts de carga inicial
```

`src/core` nunca importa `@prisma/client`. `src/db` nunca decide um valor de negócio — só traduz. `src/import` é o único lugar onde um nome de empreendimento aparece em código.

## Confirmação dos 10 princípios (da validação arquitetural, Fase "Fundação")

| # | Princípio | Como é garantido no código |
|---|---|---|
| A | Motor independente da interface | `src/core` não depende de nenhum framework web; `executarMotorFinanceiro()` é uma função pura chamável de um teste, de uma API ou de um script em lote |
| B | Motor determinístico | Toda aritmética monetária usa `decimal.js` (nunca `number`/float); nenhuma função em `src/core` lê relógio ou usa aleatoriedade; testado explicitamente em `tests/core/determinismo.test.ts` |
| C | Separação dado/premissa/regra/metodologia/resultado | Ver tabela na seção 2 do documento "Fundação do ERP"; regras nunca são uma linha de tabela, só código |
| D | Viabilidade × Gestão (projetado × realizado) | `Custo.valorRealizado`, `RecebimentoProjetado.valorRealizado` existem desde a Fase 0, mesmo sem fluxo de trabalho de lançamento ainda |
| E | Excel não é o banco do sistema | `src/import/splendido.data.ts` é lido do XLSX uma única vez, manualmente, durante a Fase 1 — o runtime nunca abre `VIABILIDADE.xlsx` |
| F | Motor de coortes genérico | `horizonteMeses` é sempre um parâmetro (`Cenario.horizonteProjecaoMeses`), nunca uma constante; provado com um empreendimento fictício de horizonte=12 e periodicidade=4 (`tests/core/motorRecebimentos.generico.test.ts`) |
| G | Custos genéricos | `CategoriaCusto`/`Custo` suportam qualquer categoria com 4 tipos de incidência; nenhuma lista fixa de rubricas |
| H | Portfólio com isolamento | Todo dado transacional tem `empreendimentoId`; testado explicitamente em `tests/integration/isolamento.test.ts` com dois empreendimentos simultâneos |
| I | Cenários independentes | `Cenario` "base" não tem tratamento especial em código; criar um cenário derivado copia dados para novas linhas, nunca edita o de origem |
| J | Auditoria futura não bloqueada | Toda tabela de premissa tem `createdAt`/`updatedAt` desde a Fase 0 |

## Stack técnica e por que

| Escolha | Motivo |
|---|---|
| TypeScript + Node.js | Tipagem estática no motor financeiro (evita a classe inteira de erro "referência de célula errada" encontrada na planilha original) |
| Prisma + SQLite (Fase 0) | Zero servidor para rodar localmente; schema portável para PostgreSQL quando o projeto crescer (troca de `provider` no datasource) |
| Valores monetários como `String` no banco, `Decimal` no motor | SQLite não tem tipo Decimal nativo no Prisma; ponto flutuante binário quebraria o princípio B (determinismo) |
| Vitest | Testes rápidos, nativos em TS, sem configuração extra |
| `decimal.js` | Aritmética decimal de precisão arbitrária, sem deriva de arredondamento entre execuções |

## Decisão arquitetural mais importante desta fase (achado F1)

`MovimentoCaixa` **não é uma tabela**. O fluxo de caixa é sempre computado por `consolidarFluxoCaixa()` (`src/core/motorFluxoCaixa.ts`) a partir de `RecebimentoProjetado` e `Custo` — nunca persistido, nunca editável diretamente. Isso elimina estruturalmente a classe de bug que causou a divergência entre as abas `PERMUTA` e `SÍNTESE` na planilha original (dois lugares guardando o mesmo fato, sem garantia de sincronia).

Ver `docs/DECISOES.md` para o raciocínio completo desta e de outras decisões da Fase 0.
