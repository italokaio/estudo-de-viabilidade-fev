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
- Schema — tabela nova `Permuta` (`nomeContraparte`, `documento?`, `valorAtribuido?`, `dataAcordo?`, `observacao?`), `unidadeId` único (uma unidade só pode ter uma permuta ativa por vez), nunca lida pelo motor — exatamente como previsto na decisão F3 original (`docs/DECISOES.md`).
- `src/db/cadastro.ts` — `registrarPermuta` (bloqueia se a unidade não estiver em `estoque` — mesma regra que já valia para venda: uma unidade só tem um destino) e `desfazerPermuta` (apaga o registro e devolve a unidade a `estoque`).
- API — `GET /api/tipologias/:id/unidades` (nova: lista unidades individuais de uma tipologia, algo que a interface só tinha em contagem agregada até aqui — necessário para escolher qual unidade permutar), `POST /api/unidades/:id/permuta`, `DELETE /api/unidades/:id/permuta`.
- Tela — cada tipologia ganhou uma terceira ação expansível "Permuta": tabela de unidades individuais (número, status, contraparte) com "Registrar permuta" (unidades em estoque) ou "Desfazer" (unidades permutadas) por linha.
- 6 novos testes de API, incluindo a prova de que uma unidade permutada não entra na geração de vendas (mesmo caminho de "estoque insuficiente" que já existia para vendas normais — nenhuma regra nova no motor). Suíte total: 16 arquivos, 71 testes.
- Verificado num navegador real: registrou permuta de uma unidade (nome, documento, valor atribuído), conferiu que ela sai do estoque disponível e a outra unidade da mesma tipologia permanece disponível, desfez a permuta e confirmou o retorno ao estoque — com o estado final também conferido direto no banco.

**Não implementado nesta fatia:** editar uma permuta já registrada (só registrar/desfazer), permuta parcial (uma unidade dividida entre múltiplas contrapartes), anexos/documentos digitalizados.

## Fase 1 (código) — nona fatia: autenticação, usuários e permissões (este repositório, concluída)

Quinto e último item da lista de "próxima fase" aprovada em bloco. Até aqui a API não exigia login nenhum — qualquer um com acesso à rede local podia ler ou apagar qualquer cadastro. Fecha essa lacuna.

**Decisões de escopo (permissão deliberadamente grossa, não uma matriz RBAC):**
- Dois papéis: `admin` (acesso completo, incluindo excluir) e `usuario` (visualiza e cadastra, não exclui). Sem controle por empreendimento nesta fase — todo usuário autenticado vê todos os empreendimentos.
- Sessão por token opaco (não JWT) guardado num cookie `httpOnly`, verificado contra a tabela `Sessao` a cada request — mesmo padrão de "estado explícito no banco em vez de esperteza" já usado no resto do sistema (nunca decodificado no cliente, revogável apagando a linha).
- Senha com `bcryptjs` (custo 12), sem dependência nativa — evita problemas de compilação no Windows que motivaram trocas de biblioteca em outras partes do projeto.

**Implementado:**
- Schema — tabelas `Usuario` (`email` único, `senhaHash`, `papel`) e `Sessao` (`token` único, `expiraEm`).
- `src/db/auth.ts` — `criarUsuario`, `autenticar` (confere senha, cria sessão de 7 dias), `validarSessao`, `encerrarSessao`, `listarUsuarios`, `excluirUsuario`.
- `src/import/seedAdmin.ts` — cria o primeiro administrador (`npm run seed:admin -- <email> <nome> <senha>`); existe porque `POST /api/usuarios` exige um admin autenticado — sem este script, ninguém consegue criar o primeiro usuário.
- API — `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST`/`GET /api/usuarios` (admin), `DELETE /api/usuarios/:id` (admin, bloqueado para o próprio usuário). Um hook `onRequest` passou a exigir sessão válida em toda rota `/api/*` (exceto login/logout); as cinco rotas de exclusão (`empreendimentos`, `tipologias`, `cenarios`, `unidades/:id/permuta`, `usuarios`) checam `papel === "admin"` e devolvem 403 caso contrário.
- Web — `LoginPage` (gate de toda a aplicação: `App.tsx` verifica `GET /api/auth/me` no carregamento), rodapé da `Sidebar` com nome/email do usuário logado e "Sair", item de menu "Usuários" (só visível para admin) com `UsuariosPage` (listar, criar, excluir).
- **Achado durante a implementação, não estava previsto:** proteger toda a API quebrava as ~140 chamadas `app.inject()` espalhadas pelos 8 arquivos de teste de integração existentes (todas passavam a receber 401). Em vez de anexar um cookie de sessão em cada uma individualmente, criou-se `tests/helpers/buildAuthenticatedApp.ts` — cria um usuário de teste, loga uma vez, e substitui `app.inject` por uma versão que sempre carrega o cookie. Cada arquivo de teste precisou de uma única linha trocada (`buildApp()` → `buildAuthenticatedApp()`), preservando os ~140 casos de teste já escritos sem tocar em nenhum deles individualmente.
- 9 novos testes de API dedicados a autenticação/permissão (`tests/integration/api.auth.test.ts`), incluindo: rota protegida sem sessão devolve 401, login errado não gera cookie, logout invalida o cookie, usuário comum recebe 403 ao excluir (e o dado permanece intacto), admin não consegue excluir a si mesmo, email duplicado é rejeitado. Suíte total: 17 arquivos, 80 testes.
- Verificado num navegador real (claro e escuro): tela de login rejeita senha errada com mensagem clara, login correto libera o app e mostra "Usuários" só para o admin, criou um usuário comum pela tela, logout volta para o login, login como o usuário comum confirma que o item "Usuários" desaparece e que uma tentativa de excluir um empreendimento mostra "Apenas administradores podem excluir" — com o empreendimento permanecendo intacto na lista.

**Não implementado nesta fatia:** recuperação de senha, expiração/renovação automática de sessão na interface (uma sessão expirada só é percebida no próximo request, mostrado como erro genérico na tela em vez de redirecionar para o login), permissão por empreendimento, edição de usuário (só criar/excluir), 2FA.

## Fase 1 (código) — décima fatia: edição/exclusão completa (este repositório, concluída)

Fecha a lacuna deixada na quinta fatia: agora condição de pagamento, categoria de custo, custo e cronograma também podem ser editados/excluídos pela interface — as quatro entidades que faltavam depois de empreendimento/tipologia/cenário.

**Regras de bloqueio, por entidade (nunca apagar/alterar dado que outra tabela referencia):**
- **Condição de pagamento** — editar as modalidades ou excluir é bloqueado se alguma `Venda` já usa a condição (trocaria o `id` de uma `ModalidadePagamento` que `RecebimentoProjetado` já referencia). O nome pode ser editado mesmo em uso.
- **Categoria de custo** — trocar o tipo de incidência é bloqueado se algum `Custo` já usa a categoria (os campos que um `Custo` preenche dependem do tipo). O nome pode ser editado mesmo em uso.
- **Custo** — não tem nada que dependa dele; editar e excluir são diretos.
- **Cronograma** — sem edição ponto a ponto (quebraria a soma=100%, regra R6, sem uma tela de diffing completa); a forma de "editar" é excluir o cronograma inteiro e recriar — o formulário de criação já reaparece assim que a tabela fica vazia. Sem bloqueio: nenhuma linha depende de `CronogramaFisicoFinanceiro` por FK.

**Achado durante a verificação em navegador — um bug real, não um problema do script de teste desta vez:** a tela sempre envia `tipoIncidencia` junto com `nome` ao salvar a edição de uma categoria de custo (mesmo quando só o nome mudou), e a rota `PATCH /api/categorias-custo/:id` bloqueava qualquer requisição que carregasse `tipoIncidencia` assim que a categoria tivesse um custo — mesmo quando o valor enviado era **idêntico** ao já salvo. Na prática, renomear uma categoria já em uso ficava impossível pela tela. Corrigido em `atualizarCategoriaCusto` (`src/db/cadastro.ts`): o bloqueio agora só dispara quando o valor de `tipoIncidencia` realmente muda em relação ao que está salvo. Adicionado um teste de regressão específico para este caso (renomear com o mesmo `tipoIncidencia` reenviado).

**Implementado:**
- `src/db/cadastro.ts` — `atualizarCondicaoPagamento`/`excluirCondicaoPagamento`, `atualizarCategoriaCusto`/`excluirCategoriaCusto`, `atualizarCusto`/`excluirCusto`, `excluirCronograma`.
- API — `PATCH`/`DELETE /api/condicoes-pagamento/:id`, `PATCH`/`DELETE /api/categorias-custo/:id`, `DELETE /api/custos/:id`, `DELETE /api/cenarios/:id/cronograma`. A rota `PATCH /api/custos/:id` já existia (para registrar valor realizado, sétima fatia) e passou a despachar duas ações pela presença de `valorRealizado` no corpo — sem quebrar o comportamento anterior.
- Web — condição de pagamento, categoria de custo e cada linha de custo ganharam "Editar"/"Excluir" inline; cronograma já criado ganhou um botão "Excluir cronograma".
- 9 novos testes de API (`tests/integration/api.edicaoEExclusao2.test.ts`), incluindo o caso de regressão acima, os bloqueios de cada entidade, e a prova de que usuário comum recebe 403 ao tentar excluir qualquer uma delas. Suíte total: 18 arquivos, 89 testes.
- Verificado num navegador real: editou nome de condição de pagamento e de categoria de custo (esta última já em uso, o caso que expôs o bug acima), editou valor e mês de um custo, excluiu o custo, excluiu o cronograma inteiro e confirmou que o formulário de criação reaparece.

**Não implementado nesta fatia:** edição de modalidades de uma condição de pagamento pela tela (só o nome — editar modalidades continua possível via API, mas a tela não expõe periodicidade/mês fixo no formato que a API de leitura devolve), edição ponto a ponto de cronograma.

## Fase 1 (código) — décima primeira fatia: permissão por empreendimento (este repositório, concluída)

Implementa o achado F5 (`docs/DECISOES.md`): a nona fatia deixou explicitamente pendente o controle de acesso por empreendimento ("todo usuário autenticado vê todos os empreendimentos"). Esta fatia fecha essa lacuna sem alterar o modelo de papéis já existente.

**Decisão de escopo:** continua sendo permissão grossa, não uma matriz RBAC — só um segundo eixo (além de `admin`/`usuario`) que restringe **quais** empreendimentos um `usuario` enxerga, nunca **o que** ele pode fazer dentro de um empreendimento que já enxerga (isso continua sendo `admin` vs. `usuario`). `admin` sempre vê tudo, incondicionalmente — o vínculo nunca é consultado para ele.

**Implementado:**
- Schema — tabela nova `EmpreendimentoUsuario` (join simples `usuarioId` × `empreendimentoId`, `@@unique` no par), sem nenhum campo além do vínculo em si.
- `src/db/auth.ts` — `temAcessoEmpreendimento` (admin sempre `true`; usuário comum consulta o vínculo), `empreendimentosPermitidos` (devolve `"todos"` para admin ou a lista de ids para usuário comum — o chamador decide se filtra), `vincularUsuarioEmpreendimento`/`desvincularUsuarioEmpreendimento`, `listarEmpreendimentosDoUsuario`.
- API — helper `garantirAcesso(req, reply, empreendimentoId)` em `api/src/app.ts`, chamado logo após o check de existência (404) em toda rota que lê ou escreve um recurso preso a um empreendimento (~20 rotas: empreendimento, tipologia, unidade, permuta, categoria de custo, cenário, condição de pagamento, custo, cronograma, recebimento) — sem acesso, devolve 404 (não 403), para não revelar a um usuário sem vínculo que aquele empreendimento existe. Rotas de exclusão não precisaram do helper: já são bloqueadas por `papel !== "admin" → 403`, e admin nunca é restringido por vínculo. `GET /api/empreendimentos` passou a filtrar pela lista permitida; `POST /api/empreendimentos` vincula automaticamente o criador quando ele não é admin (senão o próprio criador ficaria sem acesso ao que acabou de criar). Três rotas novas — `GET`/`POST /api/usuarios/:id/empreendimentos`, `DELETE /api/usuarios/:id/empreendimentos/:empreendimentoId` — todas exigindo `admin`, para o admin gerenciar vínculos.
- Web (`UsuariosPage.tsx`) — cada usuário com papel "usuario" ganhou um botão "Acesso" que expande um painel: chips dos empreendimentos vinculados (com "×" para remover) e um seletor para adicionar mais um.
- 8 novos testes de API (`tests/integration/api.permissaoPorEmpreendimento.test.ts`): lista vazia sem vínculo, 404 ao acessar diretamente, acesso liberado após vínculo, admin sempre acessa independente de vínculo, vínculo automático ao criar, usuário comum recebe 403 ao tentar gerenciar vínculo de terceiros, remoção de vínculo revoga o acesso, recurso aninhado (tipologia) bloqueado sem vínculo com o empreendimento pai. Suíte total: 19 arquivos, 97 testes.
- Verificado num navegador real (claro e escuro): criou um usuário comum sem nenhum vínculo (painel "Acesso" mostra "Nenhum empreendimento vinculado"), concedeu acesso a um empreendimento, logou como esse usuário e confirmou que o seletor de empreendimento mostra só o vinculado, voltou como admin e removeu o vínculo pela mesma tela (chip "×"), confirmando a reversão ao estado vazio.

**Não implementado nesta fatia:** vínculo em lote (só um empreendimento por vez no seletor), nível de acesso por empreendimento diferente do papel global (ex.: admin só dentro de um empreendimento específico), notificar o usuário quando um vínculo é concedido/removido.

## Fase 1 (código) — décima segunda fatia: correção monetária (este repositório, concluída)

Primeiro item de uma nova lista de candidatos apresentada ao usuário (correção monetária, distrato, terreno pela interface, polimento de lacunas menores) — o usuário escolheu correção monetária. Implementa o achado F6 (`docs/DECISOES.md`): o motor financeiro não tinha, até aqui, nenhum tratamento de inflação — uma lacuna real de viabilidade imobiliária (a planilha original já lida com IGP-M/INCC/CUB).

**Decisão de escopo:** correção monetária aplicada sobre `RecebimentoProjetado` (o saldo a receber), não sobre `Custo`. Nunca persistida como uma linha "valor corrigido" — sempre recomputada on the fly a cada `GET /fluxo-caixa`, no mesmo espírito do achado F1 (fluxo de caixa nunca é uma tabela). Sem índice cadastrado, o comportamento é idêntico ao motor antes desta fatia (fator sempre 1) — mudança 100% aditiva, testada explicitamente pela suíte inteira continuando a passar sem nenhuma alteração.

**Implementado:**
- Schema — tabela nova `IndiceCorrecao` (`empreendimentoId`, `cenarioId`, `mes`, `percentual`), `@@unique([cenarioId, mes])`. Ao contrário do cronograma (regra R6, soma=100%), cada mês é independente — upsert por mês em vez de "criar tudo de uma vez", para o usuário completar a série aos poucos conforme novos índices são divulgados.
- `src/core/motorCorrecao.ts` (novo) — `calcularFatorCorrecao(mesInicio, mesFim, indices)`: produto de `(1 + percentual)` de cada mês-índice no intervalo `(mesInicio, mesFim]`; o mês-base (normalmente o mês da venda) nunca corrige a si mesmo, e um mês sem índice cadastrado entra com variação zero. `corrigirRecebimentos()` aplica esse fator sobre o `valorPrevisto` de cada recebimento, usando o mês da venda que o originou como base — o motor de recebimentos (`motorRecebimentos.ts`) continua sem saber nada sobre índice, mesmo padrão de `motorCustos.ts` não saber o nome "comissão".
- `src/core/motorFinanceiro.ts` — `SaidaMotorFinanceiro` ganhou `entradasCorrigidas: {mes, valor}[]`, computado por cima do `recebimentos` já calculado, sem alterar `fluxo`/`indicadores` (que continuam nominais, exatamente como antes — nenhum golden number mudou).
- API — `POST`/`DELETE /api/cenarios/:id/indices-correcao(/:mes)`; `GET /api/cenarios/:id` passou a incluir `indicesCorrecao`; `GET /api/cenarios/:cenarioId/fluxo-caixa` passou a incluir `entradasCorrigidas` por mês.
- Web — nova seção "Índice de correção monetária" no detalhe do cenário (`CadastroPage.tsx`): lista de pontos cadastrados com remoção inline (chip-like, um mês por vez, sem o padrão "recriar tudo" do cronograma) e formulário para definir/atualizar um mês. Tabela "Detalhe mês a mês" do Fluxo de Caixa ganhou a coluna "Corrigido", em cor de destaque quando difere do valor nominal e neutra quando é idêntica (nenhum índice afetando aquele mês).
- 15 novos testes: 7 unitários (`tests/core/motorCorrecao.test.ts` — fator sem índice, mês-base não corrige a si mesmo, composição de múltiplos meses, mês sem índice no meio do intervalo, percentual negativo/deflação) e 8 de API (`tests/integration/api.correcaoMonetaria.test.ts` — validação de entrada, correção composta aplicada corretamente ao fluxo, upsert por mês, deflação, exclusão reverte ao nominal, 403 para usuário comum excluir, 404 para usuário sem vínculo ao empreendimento). Suíte total: 21 arquivos, 112 testes.
- Verificado num navegador real (claro e escuro): cadastrou dois pontos de índice no cenário Splendido (mês 2 a 5%), gerou vendas reais a partir das premissas de velocidade já importadas, e confirmou no Fluxo de Caixa que a coluna "Corrigido" bate com "Entradas" no mês 1 (antes de qualquer índice aplicável, cor neutra) e diverge a partir do mês 2 (cor de destaque) — o valor exato reflete a mistura de recebimentos de vendas com origens diferentes dentro do mesmo mês de competência (parcelas de vendas mais antigas corrigidas por mais meses, entradas/sinais de vendas do próprio mês sem correção), confirmando que a agregação por recebimento individual (não por mês agregado) está correta.

**Não implementado nesta fatia:** correção monetária sobre custos (ex.: obra corrigida pelo INCC/CUB — mesmo padrão poderia ser aplicado a `Custo`, mas fora do escopo desta fatia), um índice "padrão de mercado" pré-cadastrado (IGP-M/INCC reais) — o usuário digita os valores manualmente, cadastro em lote de uma série completa de uma vez (só um mês por vez no formulário, deliberado — ver decisão de upsert acima).

## Fase 1 (código) — décima terceira fatia: distrato (este repositório, concluída)

Segundo item da lista de candidatos (correção monetária, distrato, terreno pela interface, polimento de lacunas menores) — pedido pelo usuário em sequência, sem pausa entre as três. Implementa o achado F7 (`docs/DECISOES.md`): o schema já previa `Venda.status: "ativa" | "distratada"` desde a Fase 0, e `rodarMotorParaCenario()` já filtrava vendas por `status: "ativa"` — o motor estava pronto para distrato desde sempre, só faltava a ação de cadastro que efetivamente cancela uma venda.

**Achado confirmado ao implementar:** como o motor só lê vendas `status="ativa"`, marcar uma venda como `"distratada"` já é suficiente — no próximo recálculo do fluxo de caixa, `persistirRecebimentos()` (achado F4) automaticamente identifica os `RecebimentoProjetado` daquela venda como obsoletos (não aparecem mais no resultado do motor) e os apaga, sem nenhuma mudança em `src/core/`.

**Implementado:**
- Schema — tabela nova `Distrato` (`empreendimentoId`, `vendaId` único, `dataDistrato`, `valorRecebidoAteDistrato`, `percentualRetencao`, `valorRetido`, `valorReembolsar`, `motivo?`) — registro nominal histórico, nunca lido pelo motor, mesmo padrão do achado F3 (`Permuta`). O valor retido/a reembolsar é calculado sobre o que **já foi efetivamente recebido** (`RecebimentoProjetado.valorRealizado` com `status="recebido"`), nunca sobre o previsto — um distrato antes de qualquer recebimento tem retenção e reembolso zero, corretamente.
- `src/db/cadastro.ts` — `registrarDistrato` (marca a venda como distratada, devolve a unidade ao estoque, grava o registro nominal) e `desfazerDistrato` (bloqueado se a unidade já teve outro destino desde então — vendida de novo ou permutada — mesma regra de "um destino por vez" já usada em permuta).
- API — `POST`/`DELETE /api/vendas/:id/distrato`. `GET /api/tipologias/:id/unidades` passou a incluir a venda mais recente de cada unidade (e o distrato dela, se houver) — necessário para a tela decidir se mostra "Distratar" (venda ativa) ou "Desfazer distrato" (venda distratada, unidade ainda em estoque).
- Web — na seção "Permuta" de cada tipologia (que passou a cobrir permuta e distrato, já que ambas agem sobre o destino de uma unidade), unidades vendidas ganharam "Distratar" (com campo de retenção e motivo opcional) e, após o distrato, "Desfazer distrato" com o valor a reembolsar/retido exibido inline.
- 9 novos testes de API (`tests/integration/api.distrato.test.ts`): cálculo de retenção sobre o valor realizado (não o previsto), venda some do fluxo de caixa no próximo recálculo, bloqueio de desfazer quando a unidade já foi revendida, 403 para usuário comum, 404 para usuário sem vínculo. Suíte total: 22 arquivos, 121 testes.
- **Achado de UX na verificação em navegador (corrigido ainda nesta fatia, não uma fatia separada):** a primeira versão só mostrava "Registrar permuta" quando a unidade não tinha nenhum distrato pendurado, escondendo a opção justamente na unidade que acabou de voltar ao estoque por um distrato — o caso mais comum de "preciso fazer algo novo com essa unidade". Corrigido: "Registrar permuta" aparece sempre que a unidade está em estoque, independente de haver um distrato para desfazer — as duas ações já eram seguras de coexistir, porque `desfazerDistrato` bloqueia no servidor se a unidade não estiver mais em estoque.
- Verificado num navegador real (claro e escuro): marcou um recebimento como recebido (R$100.000), distratou a venda com 20% de retenção, conferiu "Reembolsar R$80.000,00 · retido R$20.000,00" exibido na tela, registrou uma permuta na unidade liberada, editou a permuta, desfez a permuta — voltando a mostrar "Registrar permuta" e "Desfazer distrato" lado a lado, exatamente o achado de UX corrigido acima.

**Não implementado nesta fatia:** distrato parcial (só cancelamento total da venda), reembolso automatizado (o valor a reembolsar é só um cálculo exibido, não dispara nenhuma ação financeira real).

## Fase 1 (código) — décima quarta fatia: terreno pela interface (este repositório, concluída)

Terceiro item da lista de candidatos. `src/db/cadastro.ts` já tinha `criarTerreno` desde a Fase 0, usado pelos dois scripts de importação — mas nunca existiu rota de API nem tela para isso, então cadastrar ou corrigir os dados de terreno de um empreendimento cadastrado do zero pela interface era impossível.

**Decisão de escopo:** como `Terreno` é 1:1 com `Empreendimento` (`Terreno.empreendimentoId @unique`), a rota de escrita é um upsert — cria na primeira chamada, atualiza nas seguintes — em vez de rotas separadas de criar/editar. Simplifica a tela: o mesmo botão "Salvar" funciona tanto para cadastrar quanto para corrigir depois.

**Implementado:**
- `src/db/cadastro.ts` — `definirTerreno(empreendimentoId, input)`, upsert por `empreendimentoId`. `criarTerreno` (usado pelos importadores) ficou intocado.
- API — `POST /api/empreendimentos/:id/terreno`. `GET /api/empreendimentos/:id` passou a incluir `terreno` (`null` quando nada foi cadastrado ainda).
- Web — novo painel "Terreno" no detalhe do empreendimento (`CadastroPage.tsx`), entre o cabeçalho e as Tipologias: área/unidade, status de validação (pendente/validado/conflitante — os mesmos três valores herdados do achado da Fase 0 sobre `Terreno.areaStatusValidacao`), forma de aquisição, observação livre.
- 5 novos testes de API (`tests/integration/api.terreno.test.ts`): `terreno: null` antes de cadastrar, upsert cria na primeira chamada e atualiza (sem duplicar) na segunda, 404 para empreendimento inexistente, 404 para usuário sem vínculo. Suíte total: 23 arquivos, 126 testes.
- Verificado num navegador real (claro e escuro): editou o terreno já existente do empreendimento fictício importado (Recanto das Aroeiras) — área e observação atualizadas e refletidas imediatamente na tela — confirmando o caminho de edição (upsert) tanto quanto o de criação, já que os dois empreendimentos de exemplo já tinham terreno vindo da importação.

**Não implementado nesta fatia:** múltiplas matrículas/áreas por empreendimento (schema continua 1:1, fiel à Fase 0), histórico de alterações de área (cada `Salvar` sobrescreve os campos anteriores, sem trilha de auditoria além de `updatedAt`).

## Fase 1 (código) — décima quinta fatia: polimento de lacunas menores (este repositório, concluída)

Quarto e último item da lista de candidatos apresentada — um pacote de quatro lacunas pequenas, cada uma uma fatia de dias-de-Fase-0 concluída, mas com uma ponta solta reconhecida na época:

1. **Editar modalidades de condição de pagamento pela tela** (deixado pendente na décima fatia): a rota `PATCH /api/condicoes-pagamento/:id` já aceitava `modalidades`, mas `GET /api/empreendimentos/:id` só devolvia `nome`/`percentual`/`tipoDistribuicao` de cada modalidade — faltavam `periodicidadeMeses`, `mesFixo`, `repeticoesSobreTotal`, `geraEventoParcial` para pré-preencher um formulário de edição sem perder dado. Corrigido expondo os campos que faltavam; a tela ganhou "Editar modalidades" ao lado de "Editar nome", reaproveitando as mesmas linhas dinâmicas do formulário de criação (extraídas para `ModalidadesFields`, componente compartilhado).
2. **Edição ponto a ponto de cronograma** (decisão original da décima fatia: "sem edição, exclua e recrie"): a regra R6 (soma=100%) continua exigindo substituição completa, não edição de uma linha isolada — mas a tela agora faz esse "excluir e recriar" por trás de um único botão "Editar" que pré-preenche o formulário com os valores atuais, em vez de obrigar o usuário a apagar tudo primeiro e digitar de novo do zero.
3. **Editar/estornar um valor já registrado como realizado** (limitação documentada na sétima fatia): `PATCH /api/recebimentos/:id` e `PATCH /api/custos/:id` ganharam a opção `estornar: true`, que limpa `valorRealizado` e devolve o status a `"previsto"`. Editar um valor já registrado não precisou de rota nova — a mesma `PATCH` já aceitava sobrescrever; só faltava expor "Editar" na tela ao lado do já existente "✓ valor".
4. **Editar uma permuta já registrada** (decisão original da oitava fatia: "só registrar/desfazer"): nova rota `PATCH /api/unidades/:id/permuta` e função `atualizarPermuta`, que só altera os dados nominais (contraparte/documento/valor atribuído) sem tocar no status da unidade — isso continua sendo papel exclusivo de registrar/desfazer.

**Implementado:**
- `src/db/cadastro.ts` — `atualizarPermuta`.
- API — `PATCH /api/unidades/:id/permuta`; `estornar` em `PATCH /api/recebimentos/:id` e `PATCH /api/custos/:id`; `GET /api/empreendimentos/:id` expõe os campos completos de modalidade.
- Web — `ModalidadesFields` (componente extraído, reused por criar e editar condição de pagamento), "Editar" em `CronogramaSecao` (pré-preenche e substitui via excluir+recriar), "Editar"/"Estornar" em `RealizadoPanel` para recebimentos e custos, "Editar" em `LinhaUnidadePermuta` para permuta.
- 5 novos testes de API (`tests/integration/api.polimento.test.ts`): modalidade completa devolvida pela leitura, estorno de recebimento e de custo revertendo ao status previsto, edição de permuta, 404/400 nos casos de erro. Suíte total: 24 arquivos, 131 testes.
- Verificado num navegador real (claro e escuro): editou as modalidades de uma condição de pagamento **em uso** e confirmou que a tela mostra corretamente o erro de bloqueio ("já foi usada em N venda(s)") em vez de aceitar silenciosamente — a mesma regra de integridade da décima fatia, agora exercitada pelo novo caminho de edição; editou um cronograma de 1 ponto (100% no mês 1) para 2 pontos (40%/60%); marcou um recebimento como recebido, estornou, e marcou de novo — o valor e o estado refletiram corretamente em cada passo.

**Não implementado nesta fatia:** histórico de estornos (um estorno simplesmente apaga o valor realizado anterior, sem guardar o que era), edição de modalidades de uma condição já em uso (bloqueio de integridade original da décima fatia continua valendo, agora só verificado através de um caminho de UI novo).

## Fase 1 (código) — décima sexta fatia: simulação de sensibilidade (este repositório, concluída)

Primeiro item de uma nova lista de candidatos, extraída da lista original "fica para depois" da Fundação do ERP (`FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade`, `VersaoCenario`, `EstruturaComissao`) — o usuário escolheu simulação de sensibilidade.

**Decisão de escopo:** camada analítica pura por cima do motor já existente — reroda `executarMotorFinanceiro()` (sem nenhuma mudança nele) com uma premissa perturbada, para cada variação de uma faixa, e nunca persiste nada (nem o resultado da simulação, nem nenhum `RecebimentoProjetado` intermediário — diferente de `/fluxo-caixa`, que roda o motor E grava). Três eixos, cada um perturbando uma parte diferente da entrada do motor antes de rodar, sem tocar em `motorRecebimentos.ts`/`motorCustos.ts`/`motorFluxoCaixa.ts`:
- `custo` — escala `valorPrevisto`/`percentual` de todo `Custo` pelo fator `(1+variação)`.
- `vgv` — escala `valorVenda` de toda `Venda` pelo fator `(1+variação)`; como `motorCustos` lê `venda.valorVenda` para custos `pct_vgv_vendido_no_mes`, a comissão escala junto — efeito colateral correto, não um bug.
- `velocidadeVendas` — desloca `mesOrigem` de toda `Venda` pela variação (em meses inteiros de atraso), nunca além do horizonte.

**Implementado:**
- `src/core/motorSensibilidade.ts` (novo) — `calcularSensibilidade(entradaBase, eixo, variacoes)`: para cada variação, perturba uma cópia da entrada e chama `executarMotorFinanceiro()`, devolvendo `{variacao, vpl, necessidadeMaximaCapital, mesPico}`.
- `src/db/servicoMotor.ts` — a montagem de `EntradaMotorFinanceiro` a partir do banco (antes só interna a `rodarMotorParaCenario`) foi extraída para `montarEntradaMotor()`, reaproveitada tanto pelo recálculo normal quanto pela nova `calcularSensibilidadeCenario()`.
- API — `GET /api/cenarios/:cenarioId/sensibilidade?eixo=custo&variacoes=-0.2,-0.1,0,0.1,0.2` (variações padrão por eixo quando omitidas).
- Web — novo painel "Sensibilidade" na tela de Fluxo de Caixa (`SensibilidadePanel.tsx`), com um seletor de eixo e uma tabela variação × VPL × necessidade máxima × mês do pico, destacando a linha "0% (atual)"/"sem atraso (atual)" — que deve bater exatamente com os KPIs da tela, já que é a mesma entrada sem nenhuma perturbação.
- 13 novos testes: 6 unitários (`tests/core/motorSensibilidade.test.ts`) e 7 de API (`tests/integration/api.sensibilidade.test.ts` — variações padrão, VGV aumenta VPL, não persiste nenhum `RecebimentoProjetado`, eixo inválido rejeitado, 404 sem vínculo). Suíte total: 26 arquivos, 144 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: a linha "0% (atual)"/"sem atraso (atual)" de cada um dos três eixos bateu exatamente com os KPIs da tela (VPL, necessidade máxima) em todos os casos — confirmando que a perturbação de variação zero é de fato um no-op. Aumentar o VGV ou reduzir o custo melhora o VPL e reduz a necessidade máxima monotonicamente através da faixa, e vice-versa; atrasar a velocidade de vendas piora ambos os indicadores de forma crescente com o atraso — todos os sinais economicamente esperados.

**Não implementado nesta fatia:** eixo de variação sobre o índice de correção monetária ou sobre a taxa de desconto do VPL (só os três eixos acima), gráfico da sensibilidade (só tabela), comparação lado a lado de dois eixos simultâneos.

## Fase 1 (código) — décima sétima fatia: financiamento de produção (este repositório, concluída)

Segundo item da lista de candidatos extraída da lista original "fica para depois" da Fundação do ERP (`FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade` — já implementada, `VersaoCenario`, `EstruturaComissao`) — o usuário escolheu financiamento de produção.

**Decisão de escopo:** diferente de correção monetária (F6) e sensibilidade — camadas de leitura por cima do motor, nunca somadas ao fluxo real —, financiamento **muda o fluxo de caixa de verdade** (achado F8, `docs/DECISOES.md`): liberações (atreladas à curva do cronograma físico-financeiro, mesma curva usada por custo `pct_execucao`) são uma entrada real; a amortização (o saldo devedor inteiro pago de uma vez, no mês configurado — sem modelar uma tabela de parcelas) é uma saída real. Juros capitalizam mês a mês sobre o saldo devedor, nunca pagos à parte durante a obra.

**Implementado:**
- Schema — tabela nova `FinanciamentoProducao` (`valorContratado`, `taxaJurosMensal`, `mesAmortizacao`), `@@unique([cenarioId])` — um financiamento por cenário nesta fase.
- `src/core/motorFinanciamento.ts` (novo) — `calcularFinanciamento(financiamento, cronograma, horizonteMeses)`: liberação de cada mês = `valorContratado × percentualExecucaoMensal`; saldo devedor acumula juros antes de cada nova liberação; no `mesAmortizacao`, o saldo inteiro vira uma amortização e zera.
- `src/core/motorFinanceiro.ts` — as liberações/amortizações são convertidas em objetos com a mesma forma de `RecebimentoGerado`/`DesembolsoMensal` (placeholders `"financiamento"`, nunca lidos pela consolidação) e somadas antes de `consolidarFluxoCaixa()` — sem mudar a assinatura dessa função nem arriscar seus testes existentes. Nunca voltam no campo `recebimentos` retornado (só `Venda` real é persistida).
- `src/db/servicoMotor.ts` — `montarEntradaMotor()` passou a buscar o financiamento do cenário e incluir na entrada do motor.
- API — `POST`/`DELETE /api/cenarios/:id/financiamento` (upsert); `GET /api/cenarios/:id` inclui `financiamento`; `GET /api/cenarios/:cenarioId/fluxo-caixa` inclui a série liberação/amortização/saldo devedor por mês.
- Web — nova seção "Financiamento de produção" no detalhe do cenário (`CadastroPage.tsx`, upsert como Terreno); novo painel na tela de Fluxo de Caixa (`FinanciamentoFluxoPanel.tsx`) mostrando a série completa — só aparece quando o cenário tem financiamento.
- 18 novos testes: 5 unitários do motor puro (`tests/core/motorFinanciamento.test.ts`), 5 de integração do pipeline completo (`tests/core/motorFinanceiro.financiamento.test.ts` — inclui o achado F8 sobre necessidade máxima) e 8 de API (`tests/integration/api.financiamento.test.ts`). Suíte total: 29 arquivos, 162 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido (409 vendas geradas): cadastrou um financiamento de R$10 milhões a 1% a.m., conferiu que a liberação de cada mês bate exatamente com a curva do cronograma já cadastrado, e que a necessidade máxima de capital muda de verdade (não é só uma análise por cima) ao comparar antes/depois do cadastro.

**Não implementado nesta fatia:** múltiplas tabelas de amortização (parcelas fixas, SAC/Price — só o pagamento único simplificado), mais de um financiamento por cenário, juros pagos mensalmente em vez de capitalizados.

## Fase 1 (código) — décima oitava fatia: alerta de risco (este repositório, concluída)

Terceiro e penúltimo item da lista original "fica para depois" da Fundação do ERP (só resta `VersaoCenario`) — o usuário escolheu alerta de risco.

**Decisão de escopo:** camada de interpretação sobre o que o motor já calcula — indicadores, recebimentos, financiamento — sem rodar o motor de novo e sem mudar fluxo/indicadores (diferente de financiamento, achado F8; igual em espírito a correção monetária e sensibilidade, que também só leem por cima). Quatro regras, cada uma checando algo que já existia:
- **Necessidade máxima alta em relação ao VGV** — acima de 30% (limite padrão) do total vendido no cenário.
- **Sem recuperação** — o fluxo acumulado nunca volta a ficar positivo dentro do horizonte (`mesRecuperacao === null`, já calculado por `calcularIndicadores()` desde a Fase 0).
- **Custo por execução física sem cronograma** — existe `Custo` com `tipoIncidencia="pct_execucao"`, mas nenhum `CronogramaFisicoFinanceiro` foi cadastrado; esse custo gera zero desembolso, silenciosamente, desde sempre — o alerta só torna essa armadilha visível.
- **Amortização de financiamento não coberta por receita** — a soma dos recebimentos até o mês de amortização é menor que o valor amortizado naquele mês (achado F8: o financiamento só reduz necessidade de capital de verdade quando há venda depois para pagá-lo).

**Implementado:**
- `src/core/motorAlertas.ts` (novo) — `calcularAlertas(entrada, limite?)`: recebe as peças já computadas (vendas, custos, cronograma, recebimentos, indicadores, financiamento) em vez de `EntradaMotorFinanceiro`/`SaidaMotorFinanceiro` inteiros, para não criar um import circular com `motorFinanceiro.ts`. Devolve `{tipo, severidade, mensagem}[]`, mensagem já em português com os números reais embutidos.
- `src/core/motorFinanceiro.ts` — `executarMotorFinanceiro()` chama `calcularAlertas()` ao final e retorna `alertas` como mais um campo de `SaidaMotorFinanceiro`, no mesmo padrão aditivo de `entradasCorrigidas`/`financiamento`.
- API — `GET /api/cenarios/:cenarioId/fluxo-caixa` passou a incluir `alertas`.
- Web — novo painel `AlertasPanel.tsx` na tela de Fluxo de Caixa, logo abaixo dos KPIs (o lugar mais visível da tela) — não renderiza nada quando não há alerta nenhum; cada linha usa cor de aviso (âmbar) ou crítico (vermelho) conforme a severidade.
- 15 novos testes: 10 unitários (`tests/core/motorAlertas.test.ts` — cada regra isolada, cenário vazio sem nenhum alerta, limite customizável) e 5 de API (`tests/integration/api.alertas.test.ts`). Suíte total: 31 arquivos, 177 testes.
- Verificado num navegador real (claro e escuro): o cenário Recanto das Aroeiras (sem vendas geradas ainda, só custos) mostrou corretamente "sem recuperação"; o cenário Splendido, depois de gerar vendas reais, mostrou "necessidade máxima equivale a 36% do VGV — acima do limite de 30%" com os números batendo exatamente com os KPIs da tela; um cenário de teste com financiamento e nenhuma venda mostrou os dois alertas de financiamento e recuperação simultaneamente, com os valores exatos do cálculo.

**Não implementado nesta fatia:** limite de necessidade máxima configurável pela interface (fixo em 30% no código), alertas sobre correção monetária ou sensibilidade, histórico de alertas ao longo do tempo (sempre recalculado, nunca persistido).

## Fase 1 (código) — décima nona fatia: versão de cenário (este repositório, concluída)

Último item da lista original "fica para depois" da Fundação do ERP (`FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade`, `VersaoCenario`, `EstruturaComissao`) — restava só `VersaoCenario`, seguido sem necessidade de escolha entre candidatos.

**Decisão de escopo:** `Cenario.derivadoDeCenarioId` já existia no schema desde a Fase 0, mas nunca tinha sido usado por nenhuma rota (achado F10, `docs/DECISOES.md`). "Duplicar" um cenário copia premissas/parâmetros puros — `PremissaVelocidadeVendas`, `Custo` (sem `valorRealizado`/`status`), `CronogramaFisicoFinanceiro`, `IndiceCorrecao`, `FinanciamentoProducao` — mas deliberadamente **nunca** `Venda` (nem por extensão `RecebimentoProjetado`/`Distrato`): `Unidade.status` é compartilhado por todos os cenários do mesmo empreendimento, então copiar vendas faria os dois cenários reivindicarem a mesma unidade como vendida simultaneamente, quebrando `excluirCenario`/`registrarDistrato`/`desfazerDistrato`/`registrarPermuta` de forma sutil (achado F10 detalha o raciocínio completo).

**Implementado:**
- `src/db/cadastro.ts` — `duplicarCenario(cenarioId, novoNome)`: cria o novo `Cenario` com `derivadoDeCenarioId` apontando para o original, copia as premissas/parâmetros acima, retorna a linha nova. `excluirCenario` corrigido para zerar `derivadoDeCenarioId` de qualquer duplicata antes do `delete` (bug latente encontrado e corrigido nesta fatia — ver achado F10).
- API — `POST /api/cenarios/:id/duplicar` (`{nome}`, 201; 400 sem nome, 404 cenário inexistente, mesmo `garantirAcesso` por empreendimento das outras rotas de cenário). `GET /api/empreendimentos/:id` passou a incluir `derivadoDeNome` em cada cenário do resumo (nome do original, ou `null`).
- Web — botão "Duplicar" no cartão de cenário (`CadastroPage.tsx`), com um formulário inline para o nome do novo cenário (mesmo padrão visual do "Editar"); um badge "Derivado de: {nome}" aparece no cartão de qualquer cenário duplicado.
- 7 novos testes de API (`tests/integration/api.versaoCenario.test.ts`): duplicação copia tudo exceto vendas, original permanece intacto, o duplicado gera suas próprias vendas sujeito ao estoque restante (0 unidades livres quando o original já vendeu tudo), editar um custo no duplicado não afeta o original, validação (400/404), e um teste de regressão dedicado para o bug do `derivadoDeCenarioId` ao excluir o original. Suíte total: 32 arquivos, 184 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: duplicou o cenário "Base", confirmou que o novo cartão mostra "Derivado de: Base", que as premissas/custos do clone batem com o original, e que o clone aparece corretamente na listagem em ambos os temas.

**Não implementado nesta fatia:** comparação lado a lado entre um cenário e o(s) derivado(s) dele (só o badge "Derivado de" no cartão), duplicação em cascata de múltiplos níveis de derivação exibida na árvore completa (só o vínculo direto pai→filho), promover um cenário duplicado a "oficial" substituindo o original.

## Fase 1 (código) — vigésima fatia: estrutura de comissão (este repositório, concluída)

Último item da lista original "fica para depois" da Fundação do ERP (`FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade`, `VersaoCenario`, `EstruturaComissao`) — a lista está esgotada com esta fatia.

**Decisão de escopo:** comissão já era representável desde a Fase 0 sem tabela nova — uma categoria de custo com `tipoIncidencia="pct_vgv_vendido_no_mes"` já escala com o VGV vendido a cada mês. A lacuna real era mais estreita: esse percentual é único para o cenário inteiro, sem forma de variar por tipologia (ex.: comissão de 8% em loja, 5% em apartamento). A solução (achado F11, `docs/DECISOES.md`) foi um campo novo `Custo.tipologiaId` (opcional), não uma tabela `EstruturaComissao` — sem preenchê-lo, nada muda; preenchido, o custo passa a incidir só sobre as vendas daquela tipologia. Só aceito para `tipoIncidencia="pct_vgv_vendido_no_mes"` — as outras incidências não têm uma leitura natural de "por tipologia" e a API rejeita a combinação (400) em vez de ignorá-la silenciosamente.

**Implementado:**
- Schema — `Custo.tipologiaId String?`, FK para `Tipologia` (nullable, sem `onDelete` — mesmo padrão do resto do schema).
- `src/core/types.ts` — `VendaInput.tipologiaId` (novo, obrigatório) e `CustoInput.tipologiaId` (novo, opcional).
- `src/core/motorCustos.ts` — o caso `pct_vgv_vendido_no_mes` filtra `ctx.vendas` por `tipologiaId` antes de somar o VGV vendido no mês, quando o custo tem um `tipologiaId` definido.
- `src/db/servicoMotor.ts` — `montarEntradaMotor()` passou a incluir `unidade.tipologiaId` na consulta de vendas e `tipologiaId` na de custos.
- `src/db/cadastro.ts` — `duplicarCenario` (achado F10) ajustado para copiar `Custo.tipologiaId` também — sem isso, duplicar um cenário perderia silenciosamente o escopo por tipologia de qualquer custo de comissão.
- API — `POST /api/cenarios/:id/custos` aceita `tipologiaId` (400 se combinado com uma incidência diferente de `pct_vgv_vendido_no_mes`, 404 se a tipologia não existe); `GET /api/cenarios/:id` expõe `tipologiaId`/`tipologiaNome` em cada custo.
- Web — seletor "Tipologia (opcional)" no formulário de novo custo, visível só quando a categoria selecionada é de incidência `pct_vgv_vendido_no_mes`; nova coluna "Tipologia" na tabela de custos do cenário, mostrando "Todas" ou o nome da tipologia.
- 7 novos testes: 1 unitário (`tests/core/motorCustos.test.ts` — a estratégia de incidência isolada, com e sem escopo) e 6 de API (`tests/integration/api.estruturaComissao.test.ts` — efeito de ponta a ponta no fluxo de caixa comparando com/sem escopo, exposição via `GET /api/cenarios/:id`, validação 400/404, preservação do escopo ao duplicar um cenário). Suíte total: 34 arquivos, 191 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: confirmou que o campo "Tipologia (opcional)" fica ausente por padrão (categoria "Obra", incidência por execução física) e aparece só ao selecionar uma categoria de incidência sobre VGV vendido; criou um custo de comissão escopado à tipologia "Loja" e confirmou que a tabela de custos mostra corretamente "Loja" nessa linha e "Todas" nas demais.

**Não implementado nesta fatia:** faixas de comissão progressivas por volume vendido, split nominal entre corretor/imobiliária/gerência (cadastro nominal de destinatário, no espírito de `Permuta`/`Distrato` — ficou fora por não ter sido pedido explicitamente), comissão paga na curva de recebimento em vez de no mês da venda.

## Fase 1 (código) — vigésima primeira fatia: correção monetária de custos (este repositório, concluída)

Primeiro item de uma nova lista de candidatos, levantada a partir das lacunas deixadas em aberto ao longo de toda a Fase 1 (a lista original "fica para depois" da Fundação do ERP está esgotada desde a fatia anterior) — o usuário escolheu correção monetária sobre custos.

**Decisão de escopo:** a décima segunda fatia (achado F6) aplicou correção monetária só a `RecebimentoProjetado`, deixando `Custo` de fora deliberadamente. Essa fatia fecha a lacuna reaproveitando inteiramente a mesma série `IndiceCorrecao` já cadastrada por cenário e a mesma função `calcularFatorCorrecao()` — nenhuma tabela nova, nenhum índice separado. A única decisão de design real (achado F12, `docs/DECISOES.md`) foi o mês-base: para recebimentos, cada venda tem o seu próprio (o mês em que o contrato foi assinado); para custos, não existe um equivalente por linha — um orçamento de obra é fixado uma única vez, no início do cronograma. A solução foi um mês-base fixo e único por cenário (mês 1), aplicado a todo `Custo`, de toda incidência, sem exceção.

**Implementado:**
- `src/core/motorCorrecao.ts` — `corrigirDesembolsos(desembolsos, mesBase, indices)`, quase idêntica a `corrigirRecebimentos()`, trocando "um mês-base por venda" por "um mês-base único".
- `src/core/motorFinanceiro.ts` — `executarMotorFinanceiro()` calcula `saidasCorrigidas` (mesmo padrão aditivo de `entradasCorrigidas`, nunca substitui `fluxo`/`indicadores` nominais); amortização de financiamento (achado F8) entra sem correção, mesmo tratamento que liberações já recebiam em `entradasCorrigidas`.
- API — `GET /api/cenarios/:cenarioId/fluxo-caixa` passou a incluir `saidasCorrigidas` em cada mês.
- Web — `FluxoTable.tsx` ganhou uma segunda coluna "Corrigido" (para saídas), ao lado da já existente (para entradas), com o mesmo destaque visual quando o valor corrigido diverge do nominal.
- 6 novos testes: 2 unitários (`tests/core/motorCorrecao.test.ts` — `corrigirDesembolsos` isolado, com e sem índice) e 4 de API (`tests/integration/api.correcaoMonetaria.test.ts` — efeito de ponta a ponta no fluxo de caixa, confirmando que a correção de entradas e de saídas são independentes uma da outra, e que remover o índice reverte ambas). Suíte total: 33 arquivos, 197 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: cadastrou um índice de 10% no mês 2, confirmou que a coluna "Corrigido" de Saídas aparece corretamente ao lado de "Saídas" na tabela de fluxo de caixa, e que o valor bate exatamente com o cálculo esperado (R$73.331,20 → R$80.664,32, fator 1,10) a partir do mês 3 em diante.

**Não implementado nesta fatia:** mês-base configurável por cenário ou por custo (fixo em 1 no código, decisão deliberada — ver achado F12), correção monetária diferenciada por índice (INCC para obra, IGP-M para o resto — hoje um único índice corrige tudo no cenário, entradas e saídas igualmente).

## Fase 1 (código) — vigésima segunda fatia: split nominal de comissão (este repositório, concluída)

Segundo item de uma lista de três candidatos aprovada em bloco pelo usuário ("pode seguir com todas as implementações") — split nominal de comissão, segurança de sessão, alertas de risco configuráveis.

**Decisão de escopo:** deixado de fora deliberadamente na vigésima fatia (estrutura de comissão) — o achado F13 (`docs/DECISOES.md`) trata da parte de controle: quem recebe a comissão de um custo, e como ela se divide entre corretor/imobiliária/gerência. Nova tabela `DestinatarioComissao` (1:N com `Custo`), cadastro nominal puro, nunca lido pelo motor — mesmo espírito de `Permuta`/`Distrato`. Deliberadamente **não restrito** a custos de incidência sobre VGV vendido (ao contrário do escopo por tipologia da fatia anterior): split nominal é controle do usuário, não regra de cálculo. Valida que a soma dos splits de um custo nunca ultrapassa 100%.

**Implementado:**
- Schema — tabela nova `DestinatarioComissao` (`custoId`, `nome`, `percentualSplit`).
- `src/db/cadastro.ts` — `criarDestinatarioComissao`/`atualizarDestinatarioComissao`/`excluirDestinatarioComissao`, com validação do limite de 100% (tolerância de arredondamento, mesmo padrão de `validarCronograma`); `excluirCusto` corrigido para remover destinatários antes do `delete` (bug latente, mesmo padrão dos achados F10/F11); `duplicarCenario` passou a criar custos individualmente (em vez de `createMany`) para poder copiar os destinatários de cada um, mapeados ao id novo.
- API — `POST /api/custos/:custoId/destinatarios-comissao`, `PATCH`/`DELETE /api/destinatarios-comissao/:id` (exclusão exige admin, mesmo padrão de outras rotas de exclusão); `GET /api/cenarios/:id` expõe `destinatariosComissao` em cada custo.
- Web — botão "Split" (com contador) em cada linha de custo, expandindo um painel com a lista de destinatários (nome, percentual, remover) e um formulário de adicionar.
- **Bug pré-existente corrigido** (achado F13, encontrado ao verificar em navegador): a tabela de custos já cadastrados ficava invisível sempre que o empreendimento não tinha nenhuma categoria de custo *própria* (caso do Splendido, cujas categorias são todas globais/reutilizáveis desde a Fase 0) — `CustosSecao` escondia a tabela inteira junto com o formulário de "adicionar novo". Corrigido para a tabela renderizar sempre que há custos, independente de haver categoria selecionável para criar um novo.
- 11 novos testes de API (`tests/integration/api.destinatariosComissao.test.ts`): cadastro, validação de limite de 100% (rejeita ultrapassar, aceita soma exata), edição respeitando o limite contra os demais destinatários, exclusão, exclusão em cascata ao excluir o custo, 403 para usuário comum, preservação ao duplicar um cenário, 404/400. Suíte total: 34 arquivos, 208 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: cadastrou dois destinatários (60%/40%) num custo de comissão real, confirmou a lista e os percentuais na tela, e confirmou que tentar adicionar um terceiro que ultrapassaria 100% mostra o erro correto — nos dois temas.

**Não implementado nesta fatia:** split em cascata (destinatário que por sua vez subdivide sua fatia com outro), notificação/pagamento automatizado (é só registro, igual a `Permuta`/`Distrato`), histórico de mudanças de split ao longo do tempo.

## Fase 1 (código) — vigésima terceira fatia: segurança de sessão (este repositório, concluída)

Terceiro item da lista de três candidatos aprovada em bloco pelo usuário ("pode seguir com todas as implementações") — split nominal de comissão, segurança de sessão, alertas de risco configuráveis.

**Decisão de escopo:** duas lacunas em aberto desde a nona fatia (autenticação), com a mesma raiz — a UI nunca soube diferenciar "esta chamada falhou" de "eu não estou mais autenticado" (achado F14, `docs/DECISOES.md`). Recuperação de senha: sem infraestrutura de email neste projeto, um link autoatendido exigiria construir essa infraestrutura do zero — a alternativa implementada foi **redefinição assistida por admin**, mesmo padrão de criar/excluir usuário (`UsuariosPage` já é admin-only desde a nona fatia). Sessão expirada: um evento global disparado no único ponto por onde toda chamada de API passa, em vez de cada tela tratar um 401 como mais um erro qualquer.

**Implementado:**
- `src/db/auth.ts` — `redefinirSenha(usuarioId, novaSenha)`: hasheia e atualiza, e encerra todas as sessões ativas do usuário (senha trocada não pode deixar um token já comprometido continuar válido pelos 7 dias restantes).
- API — `PATCH /api/usuarios/:id/senha`, admin-only, valida tamanho mínimo (6 caracteres, mesma regra de `criarUsuario`) e existência do usuário.
- Web — `apiFetch` (`web/src/api/client.ts`) substitui todo `fetch` direto às rotas da API — ponto único onde um 401 é reconhecido como sessão expirada e dispara `EVENTO_SESSAO_EXPIRADA`, exceto em `/api/auth/me` (verificação inicial) e `/api/auth/login` (credenciais erradas, já tratado inline). `App.tsx` escuta o evento, reseta o usuário logado (troca para `LoginPage` sem rota nova) e mostra "Sua sessão expirou. Entre novamente para continuar." `UsuariosPage` ganhou um botão "Senha" por usuário, com um formulário inline de redefinição.
- 4 novos testes de API (`tests/integration/api.auth.test.ts`): redefinição funciona (senha antiga para de logar, nova funciona), redefinir encerra sessões ativas, 403 para usuário comum, validação de tamanho/404. Suíte total: 34 arquivos, 212 testes.
- Verificado num navegador real (claro e escuro): criou um usuário de teste, redefiniu a senha pela tela, confirmou que a senha antiga deixa de logar e a nova funciona; simulou uma sessão expirada reaproveitando `redefinirSenha` para invalidar a própria sessão em uso e confirmou que a próxima ação na UI redireciona corretamente ao login com o aviso, nos dois temas.

**Não implementado nesta fatia:** recuperação autoatendida por email (exigiria infraestrutura de envio de email, fora de escopo), 2FA, expiração configurável (fixa em 7 dias desde a nona fatia), notificar o usuário quando sua sessão é encerrada remotamente enquanto ele ainda está com a aba aberta em outra janela (só a próxima chamada de API percebe).

## Próxima fase

A lista de cinco itens aprovada em bloco, a décima fatia de edição/exclusão completa, a décima primeira de permissão por empreendimento, a lista de quatro itens (correção monetária, distrato, terreno pela interface, polimento de lacunas menores), a décima sexta fatia de simulação de sensibilidade, a décima sétima de financiamento de produção, a décima oitava de alerta de risco, a décima nona de versão de cenário, a vigésima de estrutura de comissão, a vigésima primeira de correção monetária de custos, a vigésima segunda de split nominal de comissão e a vigésima terceira de segurança de sessão estão concluídas. Resta o último item da lista de três aprovada em bloco: alertas de risco configuráveis pela interface.
