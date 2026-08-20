# Evolução das fases

## Fase 1 — Engenharia reversa (concluída, fora deste repositório)
Análise completa da planilha `VIABILIDADE.xlsx`: 20 abas, motor de recebimentos por coorte identificado, 6 conflitos/lacunas documentados. → [Especificação Splendido](https://claude.ai/code/artifact/bb949561-5224-4633-b3c5-d9c31b39bbb1)

## Fase 2 — Generalização para ERP multiempreendimento (concluída, fora deste repositório)
Matriz de classificação Splendido×ERP, modelo de dados generalizado (31 entidades), motor financeiro genérico, tratamento explícito das 6 inconsistências, estratégia de validação, plano de implementação em fases. → [ERP Multiempreendimento](https://claude.ai/code/artifact/096b2f69-fac5-432b-8714-e1afafd0dd0a)

## Fundação arquitetural (concluída, fora deste repositório)
Confirmação dos 10 princípios arquiteturais, mapeamento dado/premissa/regra/metodologia/resultado, 3 achados de revisão (F1/F2/F3), revisão final das entidades, definição do MVP, escopo detalhado da Fase 0. → [Fundação do ERP](https://claude.ai/code/artifact/cf66a27e-85fc-4b7b-85da-6f57381901a8)

## Fase 0 — Fundação de código (este repositório, concluída)

**Implementado:**
- 13 tabelas (`prisma/schema.prisma`)
- Motor financeiro puro (`src/core/`): validação de condição de pagamento, motor de recebimentos (4 estratégias de distribuição), motor de custos (4 estratégias de incidência), motor de fluxo de caixa (sempre computado, nunca persistido), motor de indicadores
- Camada de banco (`src/db/`): cadastro, geração de vendas a partir de velocidade, orquestração do motor
- Importadores de dados (`src/import/`): Splendido (dados reais extraídos da Fase 1) e um empreendimento fictício (dados sintéticos, para o teste de genericidade)
- 28 testes automatizados, incluindo o teste obrigatório de genericidade com dados não-Splendido, teste de determinismo, teste de isolamento multiempreendimento, teste estático de ausência de hardcode, e validação contra os golden numbers da planilha (nos dois modos: replicação e completo)

**Resultado da validação golden numbers:** ver `docs/DIVERGENCIAS_PLANILHA.md`. Mês do pico e mês de recuperação batem exatamente; os demais indicadores monetários divergem ~1–9% porque o motor corrige uma perda de valor de ~0,94% presente na própria planilha original (achado D1) — uma correção documentada, não um erro do motor novo.

**Não implementado nesta fase (fora do escopo aprovado):** ver `docs/DECISOES.md` e a lista "fica para depois" da definição do MVP na "Fundação do ERP".

## Design System — Painel de Comando (este repositório, concluído)

Direção visual escolhida (claro + escuro) transformada em sistema reutilizável: tokens em `design/tokens.css` (consumidos por papel, nunca hex direto), componentes com todos os estados especificados, telas compostas nos dois temas. → [Diretrizes de Design](https://claude.ai/code/artifact/c79d06fa-45ec-4481-9bee-63b7b3d1b9c9) · `docs/DESIGN_SYSTEM.md`

## Fase 1 (código) — primeira fatia: tela de Fluxo de Caixa (este repositório, em andamento)

**Implementado:**
- API (`api/`, Fastify) — casca fina sobre `src/db/servicoMotor.ts`, duas rotas: listar empreendimentos/cenários e calcular o fluxo de caixa de um cenário. Nenhuma regra de negócio nova.
- Tela (`web/`, Vite + React) — Fluxo de Caixa real: KPIs, gráfico interativo (entradas/saídas/acumulado, com marcação do mês de pico e de recuperação), tabela mês a mês, seletor de empreendimento/cenário, alternância de tema claro/escuro. Consome `design/tokens.css` diretamente.
- Verificado num navegador real (Playwright headless): os dois temas renderizam corretamente, a troca de cenário recarrega os dados certos, sem erros de console.
- Teste automatizado da API via `app.inject()` (Fastify), conferindo que os números devolvidos batem com os golden numbers da Fase 0.

**Não implementado nesta fatia:** cadastro (as outras entradas de menu — Vendas, Custos, Cronograma, Cenários — existem visualmente mas não são funcionais ainda), permuta nominal, precificação por andar, fluxo de realizado × projetado, autenticação.

## Fase 1 (código) — segunda fatia: tela de Cadastro (este repositório, concluída)

**Implementado:**
- API — três rotas novas em `api/src/app.ts`, todas casca fina sobre `src/db/cadastro.ts` (nenhuma regra de negócio nova): `POST /api/empreendimentos`, `GET /api/empreendimentos/:id` (com tipologias e contagem de unidades), `POST /api/empreendimentos/:id/tipologias`, `POST /api/tipologias/:id/unidades` (geração em lote). Validação de entrada (nome obrigatório, quantidade inteira > 0) devolvendo 400/404 apropriados.
- Tela (`web/src/pages/CadastroPage.tsx`) — lista de empreendimentos com formulário de criação, painel de detalhe com tipologias (nome, área/preço padrão, contagem de unidades) e formulário para nova tipologia, geração de unidades em lote por tipologia (quantidade, preço, área, prefixo do número). Componentes de formulário reutilizáveis novos (`Button.tsx`, `TextField.tsx`), consumindo os mesmos tokens de `design/tokens.css`.
- Navegação: `Sidebar` e `App` passaram a ter roteamento de página em memória (sem biblioteca de rotas — só duas páginas por enquanto); "Cadastro" é o segundo item funcional do menu.
- Escopo desta fatia é deliberadamente só empreendimento/tipologia/unidade — nenhuma dessas três tabelas depende de `Cenario` no modelo de dados, então não foi necessário tocar em cenário/condição de pagamento/velocidade de vendas para provar o cadastro pela interface.
- 5 novos testes automatizados de API (`tests/integration/api.cadastro.test.ts`, via `app.inject()`): criação simples, rejeição de nome vazio, fluxo de ponta a ponta (empreendimento → tipologia → unidades → detalhe), rejeição de quantidade inválida, 404 para id inexistente. Suíte total: 9 arquivos, 36 testes.
- Verificado num navegador real (Playwright headless, temas claro e escuro): criar empreendimento, criar tipologia, gerar 5 unidades em lote, contagem atualiza na tela, navegar de volta para Fluxo de Caixa sem erro de console.

**Não implementado nesta fatia:** edição/exclusão de empreendimento/tipologia/unidade, cadastro de condição de pagamento, terreno, cenário, custos ou cronograma pela interface (essas entidades continuam só entrando via script de importação).

## Próxima fase (aguardando aprovação)

Com empreendimento/tipologia/unidade cadastráveis pela interface, a próxima fatia natural é fechar o ciclo de um empreendimento novo até aparecer no Fluxo de Caixa: cadastro de cenário + condição de pagamento + premissa de velocidade de vendas (o que falta para gerar `Venda`s) — ou, alternativamente, cadastro de custos/cronograma. Nenhuma das duas foi iniciada; aguardando direção do usuário.
