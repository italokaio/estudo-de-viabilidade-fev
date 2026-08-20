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

## Fase 1 (código) — terceira fatia: cenário, condição de pagamento e geração de vendas (este repositório, concluída)

Fecha o ciclo iniciado na segunda fatia: um empreendimento cadastrado do zero pela interface (sem nenhum script de importação) agora consegue gerar `Venda`s reais e aparecer no Fluxo de Caixa com números não triviais.

**Implementado:**
- API — seis rotas novas em `api/src/app.ts`, todas casca fina sobre `src/db/cadastro.ts` e `src/db/gerarVendas.ts`: `POST /api/empreendimentos/:id/cenarios`, `POST /api/tipologias/:id/condicoes-pagamento` (devolve 400 com a causa quando a soma das modalidades não fecha em 100% — regra R2, validada por `validarCondicaoPagamento`), `GET /api/cenarios/:id` (cenário + tipologias disponíveis + premissas de velocidade + total de vendas geradas), `POST /api/cenarios/:id/premissas-velocidade`, `POST /api/cenarios/:id/gerar-vendas` (chama `gerarVendasDePremissaVelocidade`, devolve 400 com a causa quando falta condição de pagamento ou estoque — regra R1). `GET /api/empreendimentos/:id` passou a incluir cenários e condições de pagamento por tipologia.
- Tela (`web/src/pages/CadastroPage.tsx`) — cada tipologia ganhou uma segunda ação expansível "Condição de pagamento": formulário com linhas dinâmicas de modalidade (nome, percentual, tipo de distribuição — única/nivelada/periódica/mês fixo — com campos condicionais), soma ao vivo com aviso visual até fechar em 100%. Novo painel "Cenários" no empreendimento: criar cenário (tipo/nome/horizonte) e, por cenário, uma seção "Velocidade de vendas" — lista e adiciona premissas (tipologia × mês × unidades) e um botão "Gerar vendas" que mostra o resultado (quantas vendas foram criadas) ou o erro (ex.: estoque insuficiente).
- 4 novos testes automatizados de API (`tests/integration/api.cenarioEVendas.test.ts`), incluindo o ciclo completo de ponta a ponta: cadastra empreendimento → tipologia → unidades → cenário → condição de pagamento → premissa de velocidade → gera vendas → confere que o valor exato (4 unidades × R$ 300.000 à vista = R$ 1.200.000,00) aparece no mês 1 do fluxo de caixa devolvido pela API. Suíte total: 10 arquivos, 40 testes.
- Verificado num navegador real (Playwright headless, temas claro e escuro): o mesmo ciclo de ponta a ponta pela interface (não só pela API), incluindo trocar para o cenário recém-criado no seletor da tela de Fluxo de Caixa e confirmar a entrada de R$ 1.200.000,00 na tabela mês a mês, sem erro de console. Como nenhum custo foi cadastrado (fora de escopo nesta fatia), a "necessidade máxima de capital" corretamente aparece como R$ 0,00 — comportamento honesto do motor, não uma falha.

**Não implementado nesta fatia:** cadastro de custos e cronograma físico-financeiro pela interface (continuam só via script de importação), edição/exclusão de qualquer entidade, terreno.

## Fase 1 (código) — quarta fatia: categorias de custo, custos e cronograma físico-financeiro (este repositório, concluída)

Última peça do ciclo cadastro → fluxo de caixa: um empreendimento novo, cadastrado inteiramente pela interface, agora pode ter uma "necessidade máxima de capital" diferente de R$ 0,00.

**Implementado:**
- API — cinco rotas novas em `api/src/app.ts`, casca fina sobre `src/db/cadastro.ts`: `POST /api/empreendimentos/:id/categorias-custo`, `POST /api/cenarios/:id/custos` (valida, por tipo de incidência, se `valorPrevisto` ou `percentual` é obrigatório, e se `competenciaMes` é obrigatório para custo fixo), `POST /api/cenarios/:id/cronograma` (usa `criarCronograma`, que valida soma = 100% — regra R6; rejeita um segundo cronograma para o mesmo cenário, já que a tabela tem `@@unique([cenarioId, mes])` e a função não faz upsert). `GET /api/empreendimentos/:id` passou a incluir categorias de custo; `GET /api/cenarios/:id` passou a incluir custos, cronograma e as categorias disponíveis.
- Tela — cada tipologia de custo aparece num novo painel "Categorias de custo" no empreendimento (nome + tipo de incidência); dentro de "Detalhes do cenário" (renomeado de "Velocidade de vendas", que virou uma subseção), duas seções novas: "Cronograma físico-financeiro" (linhas dinâmicas de mês × percentual com soma ao vivo, igual ao padrão já usado em condição de pagamento — vira uma tabela somente-leitura assim que salvo, porque o cronograma não pode ser reenviado) e "Custos" (formulário cujos campos mudam conforme a incidência da categoria selecionada — valor fixo pede mês de competência e recorrência; percentual pede só o percentual).
- 5 novos testes automatizados de API (`tests/integration/api.custosECronograma.test.ts`), incluindo custo fixo, custo percentual sobre VGV vendido, cronograma válido/inválido/duplicado, e custo `pct_execucao` distribuído exatamente pela curva do cronograma. Suíte total: 11 arquivos, 45 testes.
- Verificado num navegador real (Playwright headless): ciclo completo pela interface — tipologia, unidades, condição de pagamento, duas categorias de custo (uma fixa, uma `pct_execucao`), cenário, velocidade de vendas, geração de vendas, cronograma (40%/60% em 2 meses) e dois custos (terreno fixo R$ 500.000 no mês 1, obra R$ 1.000.000 distribuída pelo cronograma) — resultando exatamente no fluxo de caixa esperado: saída de R$ 900.000 no mês 1, R$ 600.000 no mês 2, necessidade máxima de R$ 300.000 e recuperação "—" (o acumulado não volta a zero dentro do horizonte, corretamente).

**Não implementado nesta fatia:** edição/exclusão de qualquer entidade cadastrada, terreno, permuta, autenticação.

## Fase 1 (código) — quinta fatia: edição e exclusão de cadastros (este repositório, concluída)

Primeiro item da lista de "próxima fase" aprovada em bloco pelo usuário ("pode rodar todos os itens apresentados"). Fecha uma lacuna real: até aqui dava para criar empreendimento/tipologia/cenário pela interface, mas não corrigir um erro de digitação nem desfazer um cadastro de teste sem mexer direto no banco.

**Implementado:**
- `src/db/cadastro.ts` — `atualizarEmpreendimento`, `excluirEmpreendimento`, `atualizarTipologia`, `excluirTipologia`, `atualizarCenario`, `excluirCenario`. Exclusão nunca é um `DELETE FROM` ingênuo — cada uma resolve sua própria regra de integridade:
  - **Excluir tipologia é bloqueado** se houver alguma unidade dela com status diferente de `estoque` (vendida ou reservada) — devolve a razão em vez de um erro genérico, porque apagar a tipologia apagaria a origem de uma `Venda` existente.
  - **Excluir cenário devolve as unidades vendidas ao estoque** (`status = 'estoque'`) antes de apagar as `Venda`s — sem isso, as unidades ficariam marcadas como vendidas para sempre, sem nenhuma venda apontando para elas, corrompendo a contagem de estoque disponível para outros cenários do mesmo empreendimento.
  - **Excluir empreendimento** faz a cascata completa (recebimentos → vendas → premissas → modalidades/condições → unidades → cronograma → custos → categorias de custo → tipologias → terreno → cenários → empreendimento), na mesma ordem de chaves estrangeiras usada em `resetDatabase()`.
- API — `PATCH`/`DELETE` em `/api/empreendimentos/:id`, `/api/tipologias/:id`, `/api/cenarios/:id`. `DELETE` devolve 204 (sucesso) ou 400 com a causa (bloqueio de integridade).
- Tela — cada card (empreendimento, tipologia, cenário) ganhou "Editar" (formulário inline, sem modal) e "Excluir" (com `confirm()` do navegador, texto explicando o que será apagado). Excluir um empreendimento limpa a seleção e seleciona o próximo da lista.
- 7 novos testes automatizados de API (`tests/integration/api.edicaoEExclusao.test.ts`): edição parcial, rejeição de nome vazio, exclusão em cascata, bloqueio de exclusão de tipologia com unidade vendida (e liberação após excluir o cenário), devolução de unidades ao estoque ao excluir cenário. Suíte total: 12 arquivos, 52 testes.
- Verificado num navegador real (Playwright): editar nome de empreendimento, criar e excluir uma tipologia, excluir o empreendimento inteiro. Achado durante a verificação (documentado, não uma falha do produto): o primeiro script de teste usava um seletor `.first()` ambíguo, que acertava o botão "Excluir" do cabeçalho do empreendimento em vez do card da tipologia — confirmado por chamadas HTTP diretas que a rota de exclusão sempre restringe corretamente pelo id recebido; a interface real não corre esse risco porque cada ação tem um texto de confirmação específico ("Excluir a tipologia X?" vs. "Excluir X e tudo cadastrado nele?").

**Não implementado nesta fatia:** edição/exclusão de unidade individual, condição de pagamento, categoria de custo, custo ou ponto de cronograma (só as três entidades "de topo").

## Fase 1 (código) — sexta fatia: precificação por andar (este repositório, concluída)

Segundo item da lista aprovada. Implementa o achado F2 (`docs/DECISOES.md`): "cascata de preço por andar... como uma segunda estratégia de precificação plugável — sem exigir alteração de schema quando for implementada". O schema já tinha `Unidade.andar`; nada mudou nele.

**Implementado:**
- `src/core/precificacaoAndar.ts` — função pura `calcularPrecoPorAndar(andar, regra)`, com duas estratégias: `fixo` (preço cresce linearmente, soma um valor em R$ por andar acima de um andar de referência) e `percentual` (cresce geometricamente, multiplica por `(1 + incremento)` por andar). Não sabe nada sobre banco ou HTTP — só recebe uma regra e devolve um preço, no mesmo padrão das outras estratégias do motor (distribuição de recebimento, incidência de custo). 4 testes unitários (`tests/core/precificacaoAndar.test.ts`).
- `src/db/cadastro.ts` — nova função `criarUnidadesPorAndar`: recebe uma lista de `{andar, quantidade}` e a regra de precificação, e gera as unidades já com `andar` e `precoVenda` calculados — sem tocar em `criarUnidadesEmLote` (preço único), que continua existindo como está.
- API — `POST /api/tipologias/:id/unidades-por-andar`, casca fina sobre a função acima, com validação de entrada (andares/quantidades inteiras positivas, tipo de incremento válido).
- Tela — "Gerar unidades" ganhou duas abas: "Preço único" (comportamento existente) e "Cascata por andar" (preço base, andar de referência, incremento com escolha fixo/percentual, e linhas dinâmicas de andar × quantidade, com contador do total de unidades).
- 3 novos testes de API (`tests/integration/api.precificacaoAndar.test.ts`): incremento fixo, incremento percentual composto, validação de entrada. Suíte total: 14 arquivos, 59 testes.
- Verificado num navegador real: gerou 3 unidades (2 no andar 1, 1 no andar 5, incremento fixo de R$ 5.000/andar) e conferiu diretamente no banco que os preços batem exatamente com o cálculo esperado (R$ 300.000,00 no andar 1, R$ 320.000,00 no andar 5).

**Não implementado nesta fatia:** precificação por orientação/posição na planta (só andar), edição de preço em lote depois de gerado.

## Fase 1 (código) — sétima fatia: fluxo de realizado × projetado (este repositório, concluída)

Terceiro item da lista aprovada. O schema já tinha `RecebimentoProjetado.valorRealizado`/`.status` e `Custo.valorRealizado`/`.status` desde a Fase 0 (sem uso até agora) — esta fatia usa esses campos pela primeira vez.

**Achado arquitetural durante a implementação (não estava previsto, documentado em vez de escondido):** o motor sempre recalcula `RecebimentoProjetado` a cada `GET /fluxo-caixa` (achado F1) apagando e recriando as linhas — o que apagava qualquer `valorRealizado` já registrado, e pior, trocava o `id` da linha a cada recálculo, invalidando qualquer referência que a tela já tivesse guardada (uma ação "marcar como recebido" podia mirar um id que deixara de existir). Corrigido de duas formas complementares:
- **Schema**: `RecebimentoProjetado` ganhou `@@unique([vendaId, modalidadeId, mesCompetencia])` — chave que o motor já garantia única por construção (`src/core/motorRecebimentos.ts`: nenhuma estratégia de distribuição gera duas parcelas da mesma modalidade, da mesma venda, no mesmo mês).
- **`src/db/servicoMotor.ts`**: `persistirRecebimentos` deixou de ser delete-all-recreate-all. Agora calcula o diff entre o que existe e o que o motor recém-computou: cria em lote (`createMany`) as parcelas novas, apaga em lote as que deixaram de existir, e só faz `update` linha a linha nas que mudaram de valor previsto — preservando id, `valorRealizado` e `status` de tudo o mais. No caminho comum (nada mudou desde o último cálculo) isso é uma comparação em memória e nenhuma escrita.
- Um teste de regressão (`tests/integration/api.realizadoXProjetado.test.ts`) prova explicitamente que o id de um recebimento não muda entre dois recálculos consecutivos do fluxo de caixa.
- **Achado de performance:** a primeira tentativa de correção usava `upsert()` por linha — correto, mas ~1000 round-trips ao SQLite para o cenário do Splendido, estourando o timeout de 30s dos testes. Reescrito para operar em lote sempre que possível (só a comparação é linha-a-linha, não a escrita).

**Implementado:**
- API — `GET /api/cenarios/:id/recebimentos` (lista as parcelas projetadas com unidade/modalidade/mês/valores), `PATCH /api/recebimentos/:id` (registra valor realizado, status padrão "recebido"), `PATCH /api/custos/:id` (registra valor realizado — só para custos de incidência `fixo`, que têm um mês de competência único; custos percentuais são recalculados pelo motor a cada mês, sem uma linha por mês para marcar). `GET /api/cenarios/:id/fluxo-caixa` passou a devolver `entradasRealizadas`/`saidasRealizadas` por mês (`null` quando nada foi registrado naquele mês, nunca `0` — a ausência de dado é diferente de dado zero).
- Tela — tabela "Detalhe mês a mês" ganhou colunas "Recebido" e "Pago"; novo painel "Realizado × Projetado" na tela de Fluxo de Caixa, com duas listas (recebimentos e custos fixos) e ação inline "Marcar recebido"/"Marcar pago" por linha, com contador de progresso ("N de M recebidos").
- 6 novos testes de API, incluindo o teste de estabilidade de id acima, custo percentual rejeitado corretamente, e mês sem realizado devolvendo `null`. Suíte total: 15 arquivos, 65 testes.
- Verificado num navegador real (claro e escuro): marcou um recebimento e um custo como realizados, conferiu que as colunas da tabela atualizaram com os valores corretos, e — o ponto central da correção — recarregou a página (forçando um recálculo do motor) e confirmou que o dado realizado sobreviveu.

**Não implementado nesta fatia:** registrar realizado para custos percentuais (limitação documentada acima), edição/estorno de um valor já registrado como realizado, importação em lote de extrato bancário.

## Fase 1 (código) — oitava fatia: permuta nominal completa (este repositório, concluída)

Quarto item da lista aprovada. Implementa o achado F3 (`docs/DECISOES.md`): `Unidade.status='permutada'` já bastava para o motor financeiro (exclui a unidade do estoque disponível e do VGV de venda) — esta fatia acrescenta o cadastro nominal (quem recebeu o quê) que ficara pendente.

**Implementado:**
- Schema — tabela nova `Permuta` (`nomeContraparte`, `documento?`, `valorAtribuido?`, `dataAcordo?`, `observacao?`), `unidadeId` único (uma unidade só pode ter uma permuta ativa por vez), nunca lida pelo motor. `docs/DECISOES.md` ganhou o achado F4 documentando por que essa tabela é só um registro histórico, não uma entrada do motor.
- `src/db/cadastro.ts` — `registrarPermuta` (bloqueia se a unidade não estiver em `estoque` — mesma regra que já valia para venda: uma unidade só tem um destino) e `desfazerPermuta` (apaga o registro e devolve a unidade a `estoque`).
- API — `GET /api/tipologias/:id/unidades` (nova: lista unidades individuais de uma tipologia, algo que a interface só tinha em contagem agregada até aqui — necessário para escolher qual unidade permutar), `POST /api/unidades/:id/permuta`, `DELETE /api/unidades/:id/permuta`.
- Tela — cada tipologia ganhou uma terceira ação expansível "Permuta": tabela de unidades individuais (número, status, contraparte) com "Registrar permuta" (unidades em estoque) ou "Desfazer" (unidades permutadas) por linha.
- 6 novos testes de API, incluindo a prova de que uma unidade permutada não entra na geração de vendas (mesmo caminho de "estoque insuficiente" que já existia para vendas normais — nenhuma regra nova no motor). Suíte total: 16 arquivos, 71 testes.
- Verificado num navegador real: registrou permuta de uma unidade (nome, documento, valor atribuído), conferiu que ela sai do estoque disponível e a outra unidade da mesma tipologia permanece disponível, desfez a permuta e confirmou o retorno ao estoque — com o estado final também conferido direto no banco.

**Não implementado nesta fatia:** editar uma permuta já registrada (só registrar/desfazer), permuta parcial (uma unidade dividida entre múltiplas contrapartes), anexos/documentos digitalizados.

## Próxima fase

Quinto e último item da lista aprovada: autenticação, usuários e permissões.
