# ERP de Viabilidade e Gestão Financeira de Empreendimentos Imobiliários

Motor financeiro multiempreendimento, genérico por construção — o Splendido é o primeiro empreendimento de teste, não uma regra do sistema. Ver `docs/` para a documentação completa (arquitetura, modelo de dados, regras de negócio, decisões, divergências em relação à planilha original, evolução das fases).

## Como rodar

```bash
npm install
npx prisma generate
npx prisma db push      # cria/atualiza o banco SQLite local (prisma/dev.db)

npm test                # roda toda a suíte (177 testes)
npm run typecheck

npm run import:splendido   # popula o banco com o empreendimento Splendido
npm run import:ficticio    # popula o banco com um empreendimento fictício de teste
npm run seed:admin -- <email> <nome> <senha>   # cria o primeiro usuário administrador (obrigatório — a API exige login)
```

### Rodar a API e a tela (Fase 1)

Em dois terminais separados, a partir da raiz do projeto:

```bash
cd api && npm install && npm run dev     # http://127.0.0.1:3333
cd web && npm install && npm run dev     # http://localhost:5173
```

Abra `http://localhost:5173` e entre com o usuário criado por `seed:admin`. Fluxo de Caixa lê os dados reais do banco (rode os `import:*` acima antes, se o banco estiver vazio); Cadastro permite criar empreendimento/tipologia/unidade pela própria interface; Usuários (visível só para administradores) permite criar outros usuários.

## Estrutura

```
prisma/schema.prisma   20 tabelas — modelo de dados genérico
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

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — princípios, camadas, stack técnica
- [`docs/MODELO_DE_DADOS.md`](docs/MODELO_DE_DADOS.md) — as 20 tabelas e o que ficou de fora
- [`docs/REGRAS_DE_NEGOCIO.md`](docs/REGRAS_DE_NEGOCIO.md) — as 13 regras universais e as estratégias do motor
- [`docs/DECISOES.md`](docs/DECISOES.md) — decisões de modelagem tomadas durante a implementação
- [`docs/DIVERGENCIAS_PLANILHA.md`](docs/DIVERGENCIAS_PLANILHA.md) — toda diferença entre o motor e a planilha original, investigada e explicada
- [`docs/FASES.md`](docs/FASES.md) — histórico de todas as fases do projeto
