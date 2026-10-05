# ERP de Viabilidade e Gestão Financeira de Empreendimentos Imobiliários

Motor financeiro multiempreendimento, genérico por construção — o Splendido é o primeiro empreendimento de teste, não uma regra do sistema. Ver `docs/` para a documentação completa (arquitetura, modelo de dados, regras de negócio, decisões, divergências em relação à planilha original, evolução das fases).

## Como rodar

Crie o arquivo `.env` a partir do exemplo (`cp .env.example .env`; no Windows, `copy .env.example .env`). O `.env` não vai para o repositório. O web lê `VITE_API_URL` de `web/.env.development.local`, criado a partir de `web/.env.example`.

```bash
npm install
npx prisma generate
npx prisma db push      # cria/atualiza o banco SQLite local (prisma/dev.db)

npm test                # roda toda a suíte de backend (377 testes)
npm run typecheck

npm run import:splendido   # popula o banco com o empreendimento Splendido
npm run import:ficticio    # popula o banco com um empreendimento fictício de teste
npm run import:testeA      # popula com um segundo fictício — poucas unidades, preço alto, poucas parcelas
npm run import:testeB      # popula com um terceiro fictício — muitas unidades, prazo longo, financiamento SAC
npm run import:testeC      # popula com um quarto fictício — garagem como tipologia própria, financiamento Price
npm run seed:admin -- <email> <nome> <senha>   # cria o primeiro usuário administrador (obrigatório — a API exige login)
```

### Rodar a API e a tela (Fase 1)

Em dois terminais separados, a partir da raiz do projeto:

```bash
cd api && npm install && npm run dev     # http://127.0.0.1:3333
cd web && npm install && npm run dev     # http://localhost:5173
```

Abra `http://localhost:5173` e entre com o usuário criado por `seed:admin`. Fluxo de Caixa lê os dados reais do banco (rode os `import:*` acima antes, se o banco estiver vazio); Cadastro permite criar empreendimento/tipologia/unidade pela própria interface; Vendas (Fase 2.1) permite registrar/acompanhar vendas de um cenário; Custos (Fase 2.2) mostra a visão gerencial de previsto/realizado/saldo/desvio de um cenário; Usuários (visível só para administradores) permite criar outros usuários.

```bash
cd web && npm test         # suíte de testes do frontend (vitest + testing-library, jsdom)
```

## Estrutura

```
prisma/schema.prisma   25 tabelas — modelo de dados genérico
src/core/               motor financeiro puro — sem dependência de banco
src/db/                 camada de persistência (Prisma) + tradução para/do motor
src/import/             dados estruturados por empreendimento + scripts de carga
api/                     API (Fastify) — casca fina sobre src/db, sem regra de negócio própria
web/                     tela (Vite + React), consome design/tokens.css de verdade
design/tokens.css       tokens reutilizáveis do Design System (ver docs/DESIGN_SYSTEM.md)
tests/core/             testes unitários do motor (incluindo o teste obrigatório de genericidade)
tests/integration/      testes de ponta a ponta (golden numbers, isolamento, API, ausência de hardcode)
docs/                   documentação viva do projeto
```

## Seed do Residencial Águas Claras (banco de teste)

Recria o empreendimento Residencial Águas Claras (cenários Base, Otimista e Pessimista) pela API, no banco de teste `prisma/test.db`, e confere os indicadores contra os valores esperados. Fica fora da suíte principal.

```bash
npm run verificar:aguas-claras   # limpa o banco de teste, recria e verifica
npm run seed:aguas-claras        # cria só se faltar (idempotente) e verifica
```

- Nunca grava no `dev.db`: o script força `DATABASE_URL=file:./test.db` e recusa a opção `--banco`.
- `verificar:aguas-claras` apaga todos os dados do `test.db` (mesmo efeito de `resetDatabase` dos testes). Não use com dados que você queira manter nesse banco.
- Se o empreendimento já existe, o script avisa e não cria outro.
- Tolerâncias: VGV e VPL/necessidade ±R$ 50 mil; margem ±0,05 p.p.; TIR ±0,02 p.p.; mês de pico exato.
- Fonte: `src/import/seedAguasClaras.ts`. Reproduz o estado do Águas Claras do `dev.db` (verificado em conferência: os indicadores obtidos coincidem com os do `dev.db` ao arredondamento). Os scripts de scratch anteriores (`aguas-claras.mjs`, `ag-cond.mjs`, `ag-rebuild.mjs`) estão superados e não são mais a referência.

## Testes de navegador que gravam dados

Qualquer teste manual ou automatizado pelo navegador que grave dados no `dev.db` segue estas regras:

1. **Backup antes**: copiar `prisma/dev.db` para um lugar fora do projeto antes de começar.
2. **Empreendimento de teste criado pela API**, com nome que deixe claro que é de teste (ex.: `TESTE ... (apagar)`), e anotar o id devolvido.
3. **Confirmar a seleção antes de preencher**: na tela, verificar que o empreendimento de teste está selecionado (nome visível no cabeçalho) antes de qualquer formulário. Não usar seletor genérico como `.first()` em formulários ou botões de cartão, porque pega o primeiro item da tela, que pode ser de outro empreendimento.
4. **Registrar ids do que foi escrito** (empreendimento, cenário, premissas, custos) para poder desfazer sem tocar em dados de outros empreendimentos.
5. **Apagar o empreendimento de teste** ao final, pela API (`DELETE /api/empreendimentos/:id`), e conferir que os empreendimentos reais continuam com os mesmos números.

Limitação: mês e tipologia de uma premissa de velocidade não são editáveis; para corrigir, exclua a linha e crie outra. Ver `docs/INVENTARIO_SISTEMA.md`.

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — princípios, camadas, stack técnica
- [`docs/MODELO_DE_DADOS.md`](docs/MODELO_DE_DADOS.md) — as 25 tabelas e o que ficou de fora
- [`docs/REGRAS_DE_NEGOCIO.md`](docs/REGRAS_DE_NEGOCIO.md) — as 13 regras universais e as estratégias do motor
- [`docs/DECISOES.md`](docs/DECISOES.md) — decisões de modelagem tomadas durante a implementação
- [`docs/DIVERGENCIAS_PLANILHA.md`](docs/DIVERGENCIAS_PLANILHA.md) — toda diferença entre o motor e a planilha original, investigada e explicada
- [`docs/FASES.md`](docs/FASES.md) — histórico de todas as fases do projeto
