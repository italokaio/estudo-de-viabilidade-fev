# Resumo de retomada — cole isto no início de uma nova sessão

Estou dando continuidade a um projeto já em andamento. Antes de qualquer coisa, leia:
`README.md`, `docs/FASES.md`, `docs/DECISOES.md`, `docs/DIVERGENCIAS_PLANILHA.md` e rode `git log --oneline` nesta pasta para confirmar o estado.

## O que é

ERP de viabilidade, planejamento e gestão financeira de empreendimentos imobiliários — multiempreendimento por construção. O empreendimento **Splendido** (de uma planilha real, `VIABILIDADE.xlsx`) foi usado só como caso de teste/validação, nunca como regra hardcoded do sistema — isso é verificado por um teste automatizado (`tests/integration/semSplendidoHardcoded.test.ts`).

## Onde está

`C:\Users\italo\dev\erp-imobiliario` (fora do OneDrive, de propósito). Git inicializado, 2 commits, working tree limpo.

## Histórico das fases (documentos completos, publicados como artifacts)

1. [Especificação Splendido](https://claude.ai/code/artifact/bb949561-5224-4633-b3c5-d9c31b39bbb1) — engenharia reversa da planilha (20 abas), 6 conflitos documentados.
2. [ERP Multiempreendimento](https://claude.ai/code/artifact/096b2f69-fac5-432b-8714-e1afafd0dd0a) — generalização do modelo, matriz Splendido×regra do ERP.
3. [Fundação do ERP](https://claude.ai/code/artifact/cf66a27e-85fc-4b7b-85da-6f57381901a8) — validação arquitetural, definição do MVP e da Fase 0.
4. **Fase 0 (código, neste repositório) — concluída.**

## Estado da Fase 0

- 13 tabelas (`prisma/schema.prisma`), motor financeiro puro em `src/core/` (zero dependência de banco), camada Prisma/SQLite em `src/db/`, importadores de dados em `src/import/`.
- 28 testes passando (`npm test`): unitários do motor, genericidade obrigatória com empreendimento fictício não-Splendido, determinismo, isolamento multiempreendimento, ausência estática de hardcode, golden numbers contra a planilha original.
- Validação contra a planilha: mês do pico (30) e mês de recuperação (38) batem exatamente; demais indicadores monetários divergem ~1–9% porque o motor corrige uma perda de valor de ~0,94% presente na própria planilha original (achado D1, investigado e documentado em `docs/DIVERGENCIAS_PLANILHA.md` — não escondido).
- Decisão arquitetural mais importante: `MovimentoCaixa` não é tabela, é sempre computado (achado F1) — evita reproduzir o bug de dessincronia PERMUTA×SÍNTESE da planilha original.

## Como rodar

```bash
cd C:\Users\italo\dev\erp-imobiliario
npm install
npx prisma generate
npx prisma db push
npm test
npm run import:splendido    # popula o banco com o Splendido
npm run import:ficticio     # popula com um empreendimento fictício de teste
```

## O que NÃO foi feito ainda (fora de escopo aprovado até aqui)

Permuta nominal completa, precificação por andar/orientação, telas/API, fluxo de lançamento de realizado×projetado, autenticação, INCC/IGPM, distrato. Lista completa e justificada em `docs/DECISOES.md` e na seção "fica para depois" da Fundação do ERP.

## Próximo passo

**Aguardando aprovação do usuário para definir o escopo da próxima fase** (provável: parte do MVP que ainda falta — cadastro de permutas, telas de cadastro, ou o fluxo projetado×realizado). Não iniciar nada sem essa aprovação — é o padrão de trabalho que vem sendo seguido desde a Fase 0 (parar ao fim de cada fase e apresentar antes de avançar).
