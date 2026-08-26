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

## Fase 1 (código) — vigésima quarta fatia: alertas de risco configuráveis (este repositório, concluída)

Último item da lista de três candidatos aprovada em bloco pelo usuário ("pode seguir com todas as implementações") — split nominal de comissão, segurança de sessão, alertas de risco configuráveis.

**Decisão de escopo:** `calcularAlertas()` (achado F9) já aceitava um limite customizável como parâmetro desde que foi escrita na décima oitava fatia — só faltava um caminho pela API/tela para configurá-lo. Achado F15 (`docs/DECISOES.md`): o limite é um campo por **cenário**, não global nem por empreendimento — cenários base/otimista/pessimista do mesmo empreendimento legitimamente toleram riscos diferentes. A outra lacuna documentada junto ("histórico de alertas ao longo do tempo") foi deliberadamente deixada de fora — persistir contradiria o princípio de que alertas são sempre recalculados, nunca guardados (mesmo espírito dos achados F1 e F9), e decidir *quando* tirar cada "foto" é uma decisão de produto em aberto, não uma lacuna técnica simples.

**Implementado:**
- Schema — `Cenario.limiteNecessidadeMaximaCapital String?` (nulo = usa o padrão de 30% do motor).
- `src/core/motorFinanceiro.ts` — `EntradaMotorFinanceiro.limiteNecessidadeMaximaCapital` (opcional), repassado para `calcularAlertas()`.
- `src/db/servicoMotor.ts` — `montarEntradaMotor()` lê o campo do cenário.
- `src/db/cadastro.ts` — `atualizarCenario` aceita o novo campo; `duplicarCenario` copia o valor configurado para o clone.
- API — `PATCH /api/cenarios/:id` aceita `limiteNecessidadeMaximaCapital` (string decimal, ou `null` explícito para restaurar o padrão; rejeita negativo/inválido); `GET /api/cenarios/:id` expõe o valor atual.
- Web — nova seção "Alertas de risco" no detalhe do cenário (`AlertasConfigSecao`, `CadastroPage.tsx`), mostrando "30% (padrão)" ou o valor configurado, com "Editar" e "Restaurar padrão" (só aparece quando há um valor customizado).
- 6 novos testes de API (`tests/integration/api.alertas.test.ts`): limite customizado suprime um alerta que o padrão dispararia e vice-versa, `null` explícito restaura os 30%, validação de valor negativo/inválido, exposição via `GET`, preservação ao duplicar cenário. Suíte total: 34 arquivos, 218 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: editou o limite para 10%, confirmou o texto atualizado e o botão "Restaurar padrão" aparecendo; restaurou o padrão e confirmou o texto voltando a "30% (padrão)" e o botão desaparecendo.

**Não implementado nesta fatia:** histórico de alertas ao longo do tempo (decisão deliberada, ver achado F15), limite configurável por regra individual (só `necessidade_maxima_alta` é configurável — as outras três regras continuam com critérios fixos), limite por empreendimento inteiro (é sempre por cenário).

## Fase 1 (código) — vigésima quinta fatia: amortização SAC/Price (este repositório, concluída)

Item escolhido entre quatro candidatos levantados a partir de lacunas documentadas ao longo de toda a Fase 1, depois que a lista de três itens aprovada em bloco se esgotou — o usuário escolheu amortização SAC/Price.

**Decisão de escopo:** o financiamento de produção (achado F8) só modelava pagamento único do saldo devedor inteiro — o caso mais comum na prática, mas não o único. Achado F16 (`docs/DECISOES.md`): a tabela SAC/Price é fixada uma única vez, no primeiro mês de amortização, sobre o saldo acumulado até ali — mesma base que "único" já usava. O modelo assume deliberadamente que as liberações terminam antes da amortização começar; uma liberação posterior à tabela já fixada soma ao saldo reportado sem gerar parcela extra nem recalcular a tabela — problema de produto em aberto (renegociar no meio do caminho), não lacuna técnica.

**Implementado:**
- `src/core/motorFinanciamento.ts` — `calcularFinanciamento()` ganhou `tipoAmortizacao` (`"unico"` | `"sac"` | `"price"`) e `numeroParcelas`. SAC: principal dividido em parcelas iguais, juros decrescentes sobre o saldo remanescente. Price: parcela total constante (fórmula de anuidade padrão), juros decrescem e amortização do principal cresce.
- Schema — `FinanciamentoProducao.tipoAmortizacao` (padrão `"unico"`, compatibilidade retroativa total) e `numeroParcelas` (opcional).
- API — `POST /api/cenarios/:id/financiamento` aceita os novos campos (`numeroParcelas` obrigatório quando `tipoAmortizacao != "unico"`); `duplicarCenario` copia a tabela configurada.
- Web — seletor "Tabela de amortização" (Pagamento único/SAC/Price) e campo "Nº de parcelas" (condicional) no formulário de financiamento; resumo do cenário mostra "SAC, N parcelas a partir do mês X" quando aplicável.
- 9 novos testes: 4 unitários (`tests/core/motorFinanciamento.test.ts` — SAC e Price calculados à mão, caso-limite de juros zero, compatibilidade retroativa) e 5 de API (`tests/integration/api.financiamento.test.ts` — cadastro, validações, preservação ao duplicar). Suíte total: 34 arquivos, 227 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: um primeiro teste com mês de amortização cedo demais em relação à curva de liberação do cronograma expôs visualmente o comportamento documentado (parcelas de poucos reais, sem bug — o saldo acumulado até ali era mesmo pequeno); reconfigurado com um mês de amortização tardio o suficiente, a tabela SAC mostrou 6 parcelas decrescentes corretas, zerando o saldo devedor exatamente na última parcela, e o alerta de amortização sem receita (achado F9) refletiu o novo valor corretamente.

**Não implementado nesta fatia:** recalcular a tabela quando uma liberação ocorre durante o período de amortização (decisão deliberada, ver achado F16), mais de um financiamento por cenário, carência dentro da própria tabela SAC/Price (parcelas só de juros antes de começar a amortizar o principal).

## Fase 1 (código) — vigésima sexta fatia: distrato parcial (este repositório, concluída)

Item escolhido entre os candidatos remanescentes levantados a partir de lacunas documentadas ao longo da Fase 1 — o usuário optou por seguir com a recomendação.

**Decisão de escopo:** o distrato (achado F7) só modelava cancelamento total. Achado F17 (`docs/DECISOES.md`): distrato parcial é uma renegociação que **reduz** `Venda.valorVenda`, mantendo a venda ativa e a unidade vendida — não um novo mecanismo no motor, já que o motor sempre lê `valorVenda` diretamente do banco a cada recálculo. Sem "desfazer" nesta fatia (decisão deliberada): é um registro permanente, não um estado temporário.

**Implementado:**
- Schema — tabela nova `RenegociacaoVenda` (1:N com `Venda`, cadastro nominal do valor anterior/novo e motivo).
- `src/db/cadastro.ts` — `registrarRenegociacaoVenda()`: valida novo valor positivo, menor que o atual, e maior ou igual ao total já recebido (`valorRealizado` somado) — abaixo disso exigiria reembolso, fora de escopo, a orientação é usar distrato total.
- API — `POST /api/vendas/:id/renegociacoes` (sem DELETE, ver decisão de escopo); `GET /api/tipologias/:id/unidades` expõe o histórico de renegociações de cada venda.
- Web — botão "Renegociar" ao lado de "Distratar" em cada unidade vendida, com formulário inline; a coluna de status mostra "Renegociada: R$X → R$Y" quando aplicável.
- **Bug latente encontrado e corrigido proativamente** (mesmo padrão dos achados F10/F11/F13): `excluirCenario` e `excluirEmpreendimento` não removiam `RenegociacaoVenda` antes de excluir a `Venda` — encontrado ao tentar limpar o cenário de teste usado na própria verificação em navegador desta fatia.
- 13 novos testes de API (`tests/integration/api.renegociacaoVenda.test.ts`): registro, efeito no próximo recálculo do fluxo de caixa, validações de valor, rejeição para venda distratada, histórico de múltiplas renegociações, preservação de `valorRealizado`, e dois testes de regressão para o bug de exclusão em cascata. Suíte total: 35 arquivos, 240 testes.
- Verificado num navegador real (claro e escuro): gerou uma venda de teste, renegociou de R$100.000 para R$80.000 pela tela, e confirmou a linha "Renegociada: R$ 100.000,00 → R$ 80.000,00" corretamente exibida nos dois temas.

**Não implementado nesta fatia:** desfazer uma renegociação (decisão deliberada, ver achado F17), renegociação que aumenta o valor da venda (fora do conceito de "distrato parcial" — seria só editar a venda), reembolso automatizado quando o novo valor é menor que o já recebido (a API rejeita esse caso e orienta usar distrato total).

## Fase 1 (código) — vigésima sétima fatia: comparação de cenários derivados (este repositório, concluída)

Item escolhido entre os candidatos remanescentes (gráfico de sensibilidade, comparação de cenários derivados) — o usuário optou por seguir com a recomendação.

**Decisão de escopo:** a décima nona fatia (achado F10) implementou duplicar um cenário, mas só existia um badge "Derivado de" — nenhuma tela mostrava os indicadores de um cenário e seus derivados lado a lado, a razão prática de existir a funcionalidade. Achado F18 (`docs/DECISOES.md`): nova rota monta a "família" do cenário (ele mesmo, seu original se for derivado, e seus derivados diretos) e roda o motor já existente para cada um — só um nível para cada lado, não a árvore inteira de derivações em cascata.

**Implementado:**
- API — `GET /api/cenarios/:id/comparacao`: para cada versão da família, roda `rodarMotorParaCenario()` (sem nenhuma mudança no motor) e devolve VPL, necessidade máxima, mês do pico e mês de recuperação, com uma `relacao` (`atual`/`original`/`derivado`) para a tela rotular cada linha.
- Web — novo painel "Comparar versões" (`ComparacaoVersoesPanel.tsx`) na tela de Fluxo de Caixa, entre o financiamento e a sensibilidade — não renderiza nada quando o cenário não tem nenhuma relação de derivação, mesmo padrão de `FinanciamentoFluxoPanel`.
- 5 novos testes de API (`tests/integration/api.versaoCenario.test.ts`): cenário sem relação só se vê a si mesmo; a partir do original o derivado aparece corretamente; a partir do derivado o original aparece corretamente; os indicadores refletem os dados de cada cenário (o derivado sem vendas copiadas tem VPL menor); 404 para cenário inexistente. Suíte total: 35 arquivos, 245 testes.
- Verificado num navegador real (claro e escuro): duplicou um cenário de teste, selecionou o original na tela de Fluxo de Caixa e confirmou o painel mostrando "Base · ATUAL" e "Base — Otimista · DERIVADO" lado a lado, com o VPL do derivado corretamente menor (sem vendas copiadas, achado F10).

**Não implementado nesta fatia:** comparação em cascata de múltiplos níveis (decisão deliberada, mesmo escopo original do achado F10), gráfico visual da comparação (só tabela, mesmo padrão da sensibilidade), comparar cenários que não têm relação de derivação entre si (só a família direta).

## Fase 1 (código) — vigésima oitava fatia: gráfico de sensibilidade (este repositório, concluída)

Último item entre os candidatos remanescentes levantados ao longo da Fase 1 — o único que restava depois da comparação de cenários derivados.

**Decisão de escopo:** a décima sexta fatia (simulação de sensibilidade) já expunha os pontos calculados pela API, só nunca tinham uma leitura visual — a tabela sozinha exige ler número por número para perceber a tendência. Achado F19 (`docs/DECISOES.md`): componente de visualização pura dos mesmos pontos, nenhuma rota nova, nenhuma mudança em `src/core/`, `src/db/` ou na API.

**Implementado:**
- Web — `SensibilidadeChart.tsx`, gráfico de linha em SVG puro (mesmo padrão sem biblioteca de `FluxoChart.tsx`), eixo x categórico por variação, linha de VPL, ponto base (0%) destacado, tooltip por hover mostrando VPL/necessidade máxima/mês do pico. `SensibilidadePanel.tsx` passou a exibir o gráfico ao lado da tabela existente, em duas colunas.
- Nenhum teste automatizado novo — renderização pura de dados já cobertos por `tests/integration/api.sensibilidade.test.ts` (décima sexta fatia), sem lógica de cálculo própria nesta fatia. Suíte total inalterada: 35 arquivos, 245 testes.
- Verificado num navegador real (claro e escuro) no cenário Splendido: o gráfico renderizou a linha de VPL corretamente decrescente ao longo da variação de custo total, com o ponto de 0% destacado e o valor batendo exatamente com a tabela ao lado e com o card de indicadores, nos dois temas.

**Não implementado nesta fatia:** plotar os outros três indicadores (necessidade máxima, mês do pico, recuperação) no gráfico — decisão deliberada, ver achado F19; comparar visualmente mais de um eixo de sensibilidade ao mesmo tempo.

## Fase 1 (código) — vigésima nona fatia: correção monetária por índice diferenciado (este repositório, concluída)

Item escolhido pelo usuário entre quatro candidatos levantados a partir de lacunas documentadas em todas as fatias anteriores, depois que a lista original da Fase 1 se esgotou por completo na vigésima oitava fatia.

**Decisão de escopo:** o índice de correção monetária (achados F6/F12) sempre foi uma única série por cenário, aplicada indistintamente a vendas e a todos os custos — mas obra costuma corrigir por INCC enquanto o restante do orçamento corrige por IGP-M ou outro índice, duas dinâmicas de mercado diferentes hoje forçadas para a mesma curva. Achado F20 (`docs/DECISOES.md`): `IndiceCorrecao` ganhou um `grupo` (texto livre, "padrao" por omissão — comportamento idêntico a antes desta fatia), permitindo mais de uma série por cenário; `Custo` ganhou `grupoIndiceCorrecao` para escolher qual série o corrige. Vendas continuam corrigindo sempre pela série "padrao" — o motor não tem como saber qual venda "é" obra. Deliberadamente sem nenhum catálogo de índices reais pré-cadastrados (INCC/IGP-M oficiais) nem integração externa — os grupos são só um agrupamento livre, o usuário continua digitando os percentuais manualmente.

**Implementado:**
- Schema — `IndiceCorrecao.grupo` (chave única `(cenarioId, grupo, mes)`, antes `(cenarioId, mes)`) e `Custo.grupoIndiceCorrecao`, ambos `"padrao"` por omissão.
- `src/core/motorCorrecao.ts` — `corrigirDesembolsos` agrupa as séries por `grupo` e aplica a série do próprio grupo de cada desembolso (fator 1 quando o grupo não tem nenhum ponto); `corrigirRecebimentos` sempre filtra para a série "padrao", ignorando qualquer outro grupo cadastrado.
- `src/core/motorCustos.ts` — cada `DesembolsoMensal` gerado carrega o `grupoIndiceCorrecao` do `Custo` que o originou.
- API — `POST/DELETE /api/cenarios/:id/indices-correcao` aceitam `grupo` (querystring no DELETE, corpo no POST, "padrao" quando omitido); `POST/PATCH` de custo aceitam `grupoIndiceCorrecao`; `GET /api/cenarios/:id` expõe o grupo de cada índice e de cada custo; `duplicarCenario` preserva o grupo de cada série e de cada custo.
- Web — `IndiceCorrecaoSecao` agora agrupa a tabela por série (com um campo "Grupo" no formulário, sugestões via `datalist`) e `CustosSecao`/`LinhaCusto` ganharam um campo "Índice" (criação e edição) e uma coluna "Índice" na tabela de custos, mostrando "Padrão" ou o nome do grupo.
- 12 novos testes: 5 unitários (`tests/core/motorCorrecao.test.ts` — série própria por desembolso, grupo sem pontos com fator 1, desembolso sem grupo informado usa "padrao", recebimentos sempre em "padrao") e 1 em `tests/core/motorCustos.test.ts` (propagação do grupo do custo para o desembolso), mais 7 de API (`tests/integration/api.correcaoMonetaria.test.ts` — correção diferenciada end-to-end, grupo sem série cadastrada, vendas imunes a séries não-padrao, DELETE por grupo, PATCH trocando o grupo, preservação ao duplicar cenário, exposição do grupo no GET). Suíte total: 35 arquivos, 257 testes.
- Verificado num navegador real (claro e escuro): cadastrou duas séries pela tela ("padrao" a 10% e "obra" a 30%, mês 4), editou um custo de R$500.000 para seguir o grupo "obra" mantendo outro de R$50.000 em "padrao", e confirmou o fluxo de caixa corrigindo cada um pela sua própria série (R$705.000,00 no mês 4, batendo com o cálculo esperado) — tabela de custos mostrando corretamente "Padrão" e "obra" na nova coluna Índice, nos dois temas.

**Não implementado nesta fatia:** catálogo de índices reais pré-cadastrados ou integração externa para buscar INCC/IGP-M publicados (decisão deliberada, ver achado F20), grupo por venda/tipologia (só custos escolhem grupo), editar o nome de um grupo já usado em lote (é preciso recadastrar cada ponto/custo individualmente).

## Fase 1 (código) — trigésima fatia: realizado para custos percentuais (este repositório, concluída)

Item escolhido pelo usuário entre quatro candidatos levantados a partir de lacunas documentadas em todas as fatias anteriores.

**Decisão de escopo:** a sétima fatia (fluxo de realizado × projetado) só permitia registrar valor realizado em custos de incidência fixa, com um único mês de competência — um custo percentual gera várias parcelas mensais recalculadas pelo motor, nunca persistidas, sem onde marcar uma parcela como paga. Achado F21 (`docs/DECISOES.md`): nova tabela `DesembolsoCusto`, mesmo padrão diff-based de `RecebimentoProjetado` (upsert por `(custoId, mes)`, id estável entre recálculos), só para custos de incidência não-fixa — custos fixos continuam usando `Custo.valorRealizado` exatamente como antes, sem nenhuma mudança.

**Implementado:**
- Schema — tabela nova `DesembolsoCusto` (`custoId`, `mes`, `valorPrevisto`, `valorRealizado?`, `status`), `@@unique([custoId, mes])`.
- `src/core/motorFinanceiro.ts` — `SaidaMotorFinanceiro` passou a expor `desembolsos` (valores nominais já calculados internamente, nenhuma lógica nova no motor puro).
- `src/db/servicoMotor.ts` — `persistirDesembolsosCusto()`, chamada por `rodarMotorParaCenario()` junto com `persistirRecebimentos()`, filtrando só custos de categoria não-`fixo`.
- API — `GET /api/cenarios/:id/desembolsos-custos` (lista as parcelas de custos percentuais), `PATCH /api/desembolsos-custos/:id` (registra valor realizado ou estorna); `GET /api/cenarios/:id/fluxo-caixa` passou a somar `DesembolsoCusto.valorRealizado` em `saidasRealizadas`, ao lado de `Custo.valorRealizado`.
- Web — painel "Realizado × Projetado" ganhou uma terceira coluna "Custos percentuais", com o mesmo padrão de ação inline ("Marcar pago"/"Editar"/"Estornar") das outras duas.
- Correção proativa do padrão recorrente de exclusão em cascata (achados F10/F11/F13/F17): `excluirCusto`, `excluirCenario` e `excluirEmpreendimento` passaram a apagar `DesembolsoCusto` antes do `Custo` correspondente, coberta por dois testes de regressão dedicados.
- 10 novos testes de API (`tests/integration/api.realizadoPercentual.test.ts`): listagem restrita a custos percentuais, registro/estorno, estabilidade de id entre recálculos, validações, e os dois testes de regressão de exclusão em cascata. Suíte total: 36 arquivos, 267 testes.
- Verificado num navegador real (claro e escuro): gerou uma venda de R$300.000 com comissão de 5%, marcou a parcela de R$15.000 prevista como paga por R$14.500 na nova coluna, e confirmou a tabela "Detalhe mês a mês" mostrando R$15.000,00 em Corrigido e R$14.500,00 em Pago no mesmo mês.

**Não implementado nesta fatia:** histórico de estornos (mesma decisão deliberada do achado da décima terceira fatia — um estorno apaga o valor anterior sem guardar o que era), migrar custos fixos para o mesmo mecanismo de `DesembolsoCusto` (decisão deliberada — sem necessidade, `Custo.valorRealizado` já cobre o caso de mês único sem nenhuma lacuna), importação em lote de extrato bancário.

## Fase 1 (código) — trigésima primeira fatia: vínculo de usuário em lote (este repositório, concluída)

Primeiro item de uma lista de sete candidatos aprovada em bloco pelo usuário — permissão por empreendimento com papel próprio, permuta parcial, comissão paga na curva de recebimento, faixas de comissão progressivas, múltiplas matrículas/áreas por empreendimento, importação em lote de extrato bancário, e este.

**Decisão de escopo:** `POST /api/usuarios/:id/empreendimentos` (achado F5) só vinculava um empreendimento por requisição. Achado F22 (`docs/DECISOES.md`): a mesma rota passou a aceitar `empreendimentoIds` (array), com `empreendimentoId` (singular) preservado por compatibilidade. Todos os ids são validados como existentes antes de vincular qualquer um — sem estado parcial silencioso se algum id da lista for inválido.

**Implementado:**
- API — `POST /api/usuarios/:id/empreendimentos` aceita `empreendimentoIds` além de `empreendimentoId`.
- Web — `AcessoEmpreendimentos` (`UsuariosPage.tsx`) trocou o `<select>` simples por `multiple`, com rótulo explicando o atalho de seleção (Ctrl/Cmd + clique) e botão "Adicionar (N)" quando mais de um está selecionado.
- 4 novos testes de API (`tests/integration/api.permissaoPorEmpreendimento.test.ts`): vínculo de vários de uma vez, `empreendimentoId` singular preservado, validação de corpo vazio, 404 com id inválido na lista sem vincular nenhum. Suíte total: 36 arquivos, 271 testes.
- Verificado num navegador real (claro e escuro): criou um usuário de teste, selecionou dois empreendimentos de uma vez e confirmou os dois aparecendo como chips após uma única ação.

**Não implementado nesta fatia:** desvincular em lote (só vincular — desvincular continua sendo uma ação por vez, já era simples o suficiente), notificar o usuário quando um vínculo é concedido/removido (mesma lacuna já documentada na décima primeira fatia, fora de escopo aqui).

## Fase 1 (código) — trigésima segunda fatia: permissão por empreendimento com papel próprio (este repositório, concluída)

Segundo item da lista de sete candidatos aprovada em bloco pelo usuário.

**Decisão de escopo:** `EmpreendimentoUsuario` (achado F5) sempre foi um vínculo binário — acesso total ou nenhum. Achado F23 (`docs/DECISOES.md`): `papel` (`"edicao"` por omissão, ou `"leitura"`) no próprio vínculo, dimensão independente do `Usuario.papel` global. `garantirAcesso()` — o único ponto que já gateava as ~40 rotas escopadas por empreendimento — passou a ler `req.method`: vínculo "leitura" e método != GET devolve 403. Nenhuma das ~40 chamadas existentes precisou mudar, já que toda rota de leitura já era GET e toda escrita já era POST/PATCH/DELETE nesta base de código. Deliberadamente sem granularidade por módulo/rota — o papel é do empreendimento inteiro, não "leitura em Custos, edição em Vendas".

**Implementado:**
- Schema — `EmpreendimentoUsuario.papel` (`"edicao"` padrão, ou `"leitura"`).
- `src/db/auth.ts` — `temAcessoEmpreendimento` virou `nivelAcessoEmpreendimento`, devolvendo `"admin" | "edicao" | "leitura" | null` em vez de um booleano; `vincularUsuarioEmpreendimento` aceita `papel` (upsert — reenviar o mesmo vínculo troca o papel).
- API — `garantirAcesso` bloqueia escrita para vínculo "leitura"; `POST /api/usuarios/:id/empreendimentos` aceita `papel` no corpo (aplicado a todos os ids da chamada, achado F22).
- Web — `AcessoEmpreendimentos` (`UsuariosPage.tsx`) ganhou um seletor "Papel" (Edição/Leitura) no formulário de vínculo, e cada chip de empreendimento vinculado agora tem um badge clicável com o papel atual, que alterna entre os dois ao ser clicado.
- 5 novos testes de API (`tests/integration/api.permissaoPorEmpreendimento.test.ts`): vínculo sem papel continua "edicao", "leitura" permite GET e bloqueia escrita com 403, troca de papel via upsert, validação de papel inválido, admin nunca afetado. Suíte total: 36 arquivos, 276 testes.
- Verificado num navegador real (claro e escuro): vinculou um usuário de teste como "Leitura", confirmou GET 200 / POST 403 via chamadas diretas à API na sessão desse usuário, alternou para "Edição" clicando no badge, e confirmou o badge atualizado nos dois temas.

**Não implementado nesta fatia:** granularidade por rota/módulo dentro de um empreendimento (decisão deliberada, ver achado F23), papel padrão diferente por usuário (é sempre escolhido no momento do vínculo), notificar o usuário quando seu papel muda.

## Fase 1 (código) — trigésima terceira fatia: permuta parcial (este repositório, concluída)

Terceiro item da lista de sete candidatos aprovada em bloco pelo usuário.

**Decisão de escopo:** `Permuta` (achado F3) sempre modelou uma contraparte única por unidade. Achado F24 (`docs/DECISOES.md`): nova tabela `ContrapartePermuta`, espelhando `DestinatarioComissao` (achado F13) quase linha a linha — cadastro nominal puro, nunca lido pelo motor, soma de `percentualSplit` nunca ultrapassa 100%. `Permuta.nomeContraparte` continua intacta como contraparte principal; `ContrapartePermuta` só registra quem mais divide a mesma permuta.

**Implementado:**
- Schema — tabela nova `ContrapartePermuta` (`permutaId`, `nome`, `documento?`, `percentualSplit`, `valorAtribuido?`).
- `src/db/cadastro.ts` — `criarContrapartePermuta`/`atualizarContrapartePermuta`/`excluirContrapartePermuta`, validação de soma reaproveitando a mesma constante de tolerância (`TOLERANCIA_SPLIT`) já usada pelo split de comissão. `desfazerPermuta` e `excluirEmpreendimento` passaram a apagar `ContrapartePermuta` antes da `Permuta` correspondente (mesmo padrão recorrente dos achados F10/F11/F13/F17/F21).
- API — `POST /api/permutas/:permutaId/contrapartes`, `PATCH`/`DELETE /api/contrapartes-permuta/:id`; `GET /api/tipologias/:id/unidades` passou a incluir `contrapartes` dentro de `permuta`.
- Web — botão "Split" (com contador) em cada unidade permutada, abrindo o mesmo padrão de painel já usado para split de comissão (`LinhaCusto`), com lista de contrapartes e formulário de adicionar.
- 9 novos testes de API (`tests/integration/api.permuta.test.ts`): cadastro, soma exata de 100%, rejeição de excesso, edição respeitando o limite, exclusão, dois testes de regressão de exclusão em cascata (desfazer permuta / excluir empreendimento), 403 para usuário comum, 404 para permuta inexistente. Suíte total: 36 arquivos, 285 testes.
- Verificado num navegador real (claro e escuro): registrou uma permuta e cadastrou uma segunda contraparte com 40% pela tela, confirmando o botão "Split (1)" e a linha do split no painel, nos dois temas.

**Não implementado nesta fatia:** split em cascata (uma contraparte que por sua vez subdivide sua fatia com outra — mesma decisão deliberada do achado F13), notificação/pagamento automatizado (é só registro, igual a `Permuta`/`Distrato`), histórico de mudanças de split ao longo do tempo.

## Fase 1 (código) — trigésima quarta fatia: comissão paga na curva de recebimento (este repositório, concluída)

Quarto item da lista de sete candidatos aprovada em bloco pelo usuário.

**Decisão de escopo:** `pct_vgv_vendido_no_mes` (achado F11) paga a comissão inteira no mês da venda; `pct_recebido_mes_anterior` resolve um problema diferente (encargo agregado, defasado, sem saber de qual venda veio). Achado F25 (`docs/DECISOES.md`): novo `tipoIncidencia="pct_recebido_no_mes"` — para cada `RecebimentoProjetado` de uma venda, lança a fatia da comissão no mesmo mês da parcela, suportando o mesmo escopo por tipologia do achado F11.

**Implementado:**
- Core — `ContextoCustos` ganhou `recebimentos: RecebimentoGerado[]` (cada um com seu `vendaId`); nova estratégia `pct_recebido_no_mes` em `src/core/motorCustos.ts`, simétrica a `pct_vgv_vendido_no_mes` mas agrupando por mês de cada recebimento em vez do mês de origem da venda.
- API — `tiposValidos` de categoria de custo ganhou o novo tipo; escopo por tipologia passou a aceitar `pct_vgv_vendido_no_mes` ou `pct_recebido_no_mes`.
- Web — nova opção "% do recebido, na curva de recebimento" no seletor de incidência de categoria de custo.
- 6 novos testes (2 unitários em `tests/core/motorCustos.test.ts`, 4 de API em `tests/integration/api.comissaoCurvaRecebimento.test.ts`, incluindo a sinergia com o achado F21 — as parcelas já podem ser marcadas como realizadas sem nenhuma mudança adicional). Suíte total: 38 arquivos, 291 testes.
- Verificado num navegador real (claro e escuro): uma venda de R$200.000 paga em duas parcelas (40%/60%) com comissão de 10% gerou R$8.000,00 no mês da primeira parcela e R$12.000,00 no mês da segunda, batendo exatamente com o previsto.

**Não implementado nesta fatia:** juros/correção sobre a fatia de comissão ainda não paga (a comissão simplesmente segue o valor nominal de cada parcela, sem nenhum acréscimo), comissão parcialmente na venda e parcialmente na curva (é um ou outro, por custo).

## Fase 1 (código) — trigésima quinta fatia: múltiplas matrículas/áreas por empreendimento (este repositório, concluída)

Quinto item da lista de sete candidatos aprovada em bloco pelo usuário.

**Decisão de escopo:** `Terreno` (Fase 0) sempre foi 1:1 com `Empreendimento`. Achado F26 (`docs/DECISOES.md`): `Terreno.empreendimentoId` perdeu o `@unique` (virou 1:N) e ganhou `numeroMatricula`. Fecha uma lacuna documentada desde a própria Fase 0 — o `RegistroAreaTerreno` da especificação original, deliberadamente simplificado para `Terreno.areaObservacao` naquele momento. Deliberadamente sem renomear o modelo: `Terreno` já é o nome certo, só a cardinalidade mudou.

**Implementado:**
- Schema — `Terreno.empreendimentoId` sem `@unique`; novo campo `numeroMatricula`.
- `src/db/cadastro.ts` — `definirTerreno` (upsert) virou `atualizarTerreno(id, input)` + `excluirTerreno(id)`; `criarTerreno` (já existente, usado pelos importadores) ganhou `numeroMatricula` opcional.
- API — `POST /api/empreendimentos/:id/terrenos` (plural, sempre cria) substitui o antigo `POST .../terreno` (upsert); `PATCH`/`DELETE /api/terrenos/:id` operam numa matrícula específica. `GET /api/empreendimentos/:id` expõe `terrenos` (array) em vez de `terreno` (objeto único).
- Web — `TerrenoSecao` (`CadastroPage.tsx`) virou uma lista, mesmo padrão de `CustosSecao`: cada matrícula com "Editar"/"Excluir" próprios, mais um formulário de "Adicionar matrícula" abaixo da lista.
- `tests/integration/api.terreno.test.ts` reescrito para o formato plural (+4 testes líquidos). Suíte total: 37 arquivos, 295 testes.
- Verificado num navegador real (claro e escuro): cadastrou duas matrículas pela tela ("12.345" com 3.000 m² e "67.890" com 2.000 m²) e confirmou as duas listadas simultaneamente.

**Não implementado nesta fatia:** soma automática de área total entre matrículas de unidades diferentes (cada matrícula mostra sua própria área; agregação ficaria ambígua quando as unidades de medida divergem entre matrículas), histórico de alterações de área (mesma decisão deliberada já documentada na décima terceira fatia).

## Fase 1 (código) — trigésima sexta fatia: importação em lote de extrato bancário (este repositório, concluída)

Sexto item da lista de sete candidatos aprovada em bloco pelo usuário — mencionado desde a sétima fatia (fluxo de realizado × projetado) e nunca puxado até agora.

**Decisão de escopo (duas perguntas feitas ao usuário antes de codificar):** formato do arquivo — CSV genérico (`Data,Descrição,Valor`), não um layout específico de banco; estratégia de conciliação — "sugerir e confirmar": o sistema nunca marca nada sozinho, só sugere candidatos ranqueados e o usuário confirma cada um pela tela. Achado F27 (`docs/DECISOES.md`): como nenhum "mês" do sistema jamais teve âncora de calendário real (confirmado por busca em todo o schema), `Cenario` ganhou `dataMesUm DateTime?` opcional — sem ela a sugestão casa só por valor; com ela, também por proximidade de mês.

**Implementado:**
- Schema — `Cenario.dataMesUm DateTime?`.
- Core — novo `src/core/conciliacaoExtrato.ts` (`parseExtratoCSV`, `sugerirConciliacao`), motor puro sem I/O.
- `src/db/conciliacao.ts` — `montarCandidatosConciliacao` (recebimentos/custos fixos/desembolsos ainda "previsto" do cenário) e `confirmarConciliacao` (valida que cada id confirmado pertence ao cenário antes de escrever, reaproveitando os mesmos campos das rotas de "marcar realizado" individuais).
- API — `POST /api/cenarios/:id/extrato/sugestoes` (só leitura), `POST /api/cenarios/:id/extrato/confirmar`; `PATCH /api/cenarios/:id` passou a aceitar `dataMesUm`.
- Web — novo componente `ImportarExtratoPanel` (upload de CSV, tabela de sugestões com seletor por linha, formulário da data-âncora), montado em `FluxoCaixaPage` logo após o painel de realizado.
- Testes novos: `tests/core/conciliacaoExtrato.test.ts` (parsing e scoring do motor puro) e `tests/integration/api.conciliacaoExtrato.test.ts` (as duas rotas, `dataMesUm`, e que o vínculo "leitura" do achado F23 também bloqueia a confirmação).
- Verificado num navegador real (claro e escuro): salvou a data do mês 1, enviou um CSV com uma entrada e uma saída, conferiu as sugestões corretas, confirmou uma delas e viu o valor aparecer como realizado no painel de fluxo.

**Não implementado nesta fatia:** parsing de layout específico de banco (é sempre o CSV genérico decidido com o usuário), desfazer uma confirmação pela tela de importação (já é possível pela edição individual do item, achado F21), importação incremental que lembra quais linhas de um arquivo já foram processadas em uma sessão anterior.

## Fase 1 (código) — trigésima sétima fatia: faixas de comissão progressivas por volume vendido (este repositório, concluída)

Sétimo e último item da lista de sete candidatos aprovada em bloco pelo usuário. Perguntado explicitamente antes de codificar (nenhum padrão existente no sistema para espelhar, diferente dos outros seis itens): base do volume é VGV vendido (R$), não contagem de unidades; acumula desde o início do cenário, nunca reinicia por período; cada venda usa a taxa única da faixa em que o VGV acumulado se encontra após incluí-la, não fatiada marginalmente entre faixas.

**Decisão de escopo:** achado F28 (`docs/DECISOES.md`) — novo `tipoIncidencia="faixas_vgv_acumulado"`, novo modelo `FaixaComissao` (`volumeAte`, `percentual`) ligado a `Custo`, **lido pelo motor** (diferente de `DestinatarioComissao`/`ContrapartePermuta`, que são só cadastro nominal). Validação de faixas é independente da ordem de cadastro — só rejeita `volumeAte` duplicado ou mais de uma faixa aberta.

**Implementado:**
- Schema — novo modelo `FaixaComissao`, relação `Custo.faixas`.
- Core — nova estratégia `faixas_vgv_acumulado` em `src/core/motorCustos.ts`: ordena vendas por mês (empate por id), acumula VGV venda a venda, aplica a taxa da faixa atingida à venda inteira.
- `src/db/cadastro.ts` — `criarFaixaComissao`/`atualizarFaixaComissao`/`excluirFaixaComissao`, validação `validarFaixasAscendentes`; cascade de exclusão em `excluirCusto`/`excluirCenario`/`excluirEmpreendimento`; `duplicarCenario` corrigido para também copiar as faixas (achado lateral encontrado ao escrever os testes).
- API — `POST /api/custos/:custoId/faixas-comissao`, `PATCH`/`DELETE /api/faixas-comissao/:id`; `POST /api/cenarios/:id/custos` passou a aceitar a nova categoria sem exigir `valorPrevisto`/`percentual`; escopo por tipologia (achado F11) estendido para esta incidência também.
- Web — painel "Faixas" em `LinhaCusto` (`CadastroPage.tsx`), mesmo padrão visual do split de comissão, com lista ordenável e formulário de nova faixa.
- 18 novos testes de API (`tests/integration/api.faixasComissao.test.ts`) e 4 novos testes de motor (`tests/core/motorCustos.test.ts`): taxa única por faixa, ordenação determinística de vendas, escopo por tipologia, comissão zero sem faixas, validação de duplicidade/faixa aberta, fluxo de caixa ponta a ponta, cascade de exclusão, duplicação de cenário, 403/404.
- Verificado num navegador real (claro e escuro): cadastrou um custo de faixas, adicionou duas faixas pela tela (até R$1.000.000 a 3%, aberta a 5%), gerou vendas que cruzam a fronteira, e conferiu no fluxo de caixa que a comissão de cada mês bateu com a taxa da faixa correta.

**Não implementado nesta fatia:** taxa progressiva fatiada marginalmente entre faixas (decisão deliberada do usuário — taxa única pela faixa atingida), acumulação por período que reinicia (decisão deliberada — acumula desde o início do cenário), faixas por contagem de unidades em vez de VGV (decisão deliberada).

Com esta fatia, **a lista de sete itens aprovada em bloco pelo usuário está completa.**

## Fase 1 (código) — trigésima oitava fatia: fechamento e hardening da Fase 1 (este repositório, concluída)

Não é uma funcionalidade nova — é a etapa de estabilização pedida explicitamente antes de abrir qualquer nova fase, motivada pelos achados de uma auditoria técnica completa (relatório publicado como artifact). Escopo: corrigir a causa raiz do bug crítico da auditoria (não um patch superficial), auditar integridade referencial do resto do schema, revalidar golden numbers com classificação explícita de cada divergência, provar genericidade/regressão do motor com 3 empreendimentos fictícios novos e estruturalmente diferentes entre si, endurecer segurança básica (CORS + rate limiting), e reconfirmar que nenhuma decisão arquitetural (MovimentoCaixa nunca persistido, zero hardcode do Splendido) regrediu.

**Decisão de escopo:** achado F29 (`docs/DECISOES.md`) — dois problemas reais de integridade referencial corrigidos na raiz (cascata de exclusão de `DestinatarioComissao`/`FaixaComissao`/`DesembolsoCusto`/`ContrapartePermuta` virou `onDelete: Cascade` no schema, em vez de depender de código de aplicação lembrar de replicar a limpeza; `Custo.tipologiaId` ganhou um bloqueio explícito contra o `SetNull` silencioso do Prisma). CORS e rate limiting também documentados no mesmo achado.

**Implementado:**
- Schema — `onDelete: Cascade` em `DestinatarioComissao.custo`, `FaixaComissao.custo`, `DesembolsoCusto.custo`, `ContrapartePermuta.permuta`.
- `src/db/cadastro.ts` — limpeza manual redundante removida de `excluirEmpreendimento`/`excluirCenario`/`excluirCusto`/`desfazerPermuta`; `excluirTipologia` bloqueia exclusão se algum `Custo` estiver escopado à tipologia.
- `api/src/app.ts` — CORS restrito a `CORS_ORIGINS` (padrão: só origens de desenvolvimento local); rate limiting no login via `@fastify/rate-limit` (`RATE_LIMIT_LOGIN_MAX`, padrão mais alto sob a suíte de testes).
- Três novos empreendimentos de teste (`src/import/importadorTesteA.ts`/`B`/`C`) deliberadamente distintos entre si e do Splendido/Recanto das Aroeiras: A (poucas unidades, preço alto, poucas parcelas, sem financiamento), B (muitas unidades — 300 —, preço baixo, prazo de 48 meses, financiamento SAC), C (garagem como tipologia própria vendida em paralelo, parcela única na entrega, financiamento Price, comissão em faixas progressivas).
- Web — `ImportarExtratoPanel` limpa sugestões pendentes ao trocar de cenário (achado de UX de baixo risco da auditoria de frontend — o backend já rejeitava a consequência séria, mas a tela ficava mostrando dado do cenário errado).
- Testes novos: `tests/integration/api.integridadeReferencial.test.ts` (reproduz os dois bugs antes da correção, comprova depois), `tests/integration/fechamentoFase1.genericidadeEIsolamento.test.ts` (motor rodando sem erro nos 5 cenários, conservação de valor, garagem como produto normal, financiamentos SAC×Price coexistindo, determinismo sob ordem de execução, e isolamento obrigatório A×B incluindo exclusão), `tests/integration/api.seguranca.test.ts` (rate limiting com 429, CORS não refletindo origem desconhecida).
- Golden numbers revalidados (6/6 passando, mesmos números de antes — o motor não foi tocado) e classificados: ver relatório de fechamento.
- Verificado: `grep` confirma zero ocorrência de "splendido" fora de `src/import`; zero model `MovimentoCaixa` no schema.

**Não implementado nesta fatia (fora de escopo deliberado, ver relatório de fechamento):** telas dedicadas de Vendas/Custos/Cronograma/Cenários, paginação nas listas, migrations versionadas, taxa de desconto do VPL configurável, migração de SQLite para Postgres — todos itens de dívida técnica conhecida, não bloqueantes para o uso atual, registrados para decisão futura.

## Fase 2 (código) — trigésima nona fatia: Fase 2.1 — tela de Vendas (este repositório, concluída)

Primeiro incremento funcional da Fase 2 ("Operação do Empreendimento"), depois da Fase 1 aprovada e encerrada. Objetivo: interface operacional real para registrar e acompanhar vendas — não uma "casca visual", conectada ao motor e ao modelo já existentes.

**Decisão de escopo:** achado F30 (`docs/DECISOES.md`) — `Venda` ganhou `comprador`/`documentoComprador` (cadastro nominal, nunca lido pelo motor); `registrarVenda()` é uma segunda via de criação de venda (individual, com escolha manual de unidade e comprador), paralela a `gerarVendasDePremissaVelocidade()` (Fase 1, em lote); as duas convergem no mesmo modelo e no mesmo motor. Zero alteração em `src/core`.

**Implementado:**
- Schema — `Venda.comprador`, `Venda.documentoComprador` (opcionais, nominais).
- `src/db/cadastro.ts` — `registrarVenda`, `atualizarVenda`, `listarVendasDoCenario`, `resumoEstoque`.
- API — `POST`/`GET /api/cenarios/:id/vendas`, `PATCH /api/vendas/:id`, `GET /api/empreendimentos/:id/estoque`; `GET /api/cenarios/:id/recebimentos` ganhou `vendaId` (campo aditivo). A rota de criação chama `rodarMotorParaCenario()` depois de criar a venda, reaproveitando a mesma função já usada por `/fluxo-caixa` — nenhuma regra nova.
- Web — `web/src/pages/VendasPage.tsx` (nova): seletor de cenário, cards de estoque (Total/Disponíveis/Vendidas/Permutadas/Reservadas/Distratadas), formulário de registrar venda, tabela de vendas com editar/distratar/renegociar (reaproveitando as rotas já existentes) e painel expansível com os recebimentos gerados pelo motor para cada venda. Item "Vendas" do menu lateral ativado.
- **Primeira infraestrutura de teste do frontend**: `vitest` + `@testing-library/react` em `web/` (config própria, separada da raiz — ambiente `jsdom` vs. `node`).
- 13 testes novos de API (`tests/integration/api.vendas.test.ts`) e 4 testes novos de frontend (`web/src/pages/VendasPage.test.tsx`, incluindo um teste que prova que trocar de cenário não deixa dado do cenário anterior visível, e outro que reproduz o bug real descrito abaixo).
- Golden numbers, genericidade (Splendido + Ficticio + A + B + C) e isolamento multiempreendimento reexecutados depois desta fatia.
- **Bug encontrado na verificação visual e corrigido**: o formulário de registrar venda ficava preso na tipologia do cenário anterior ao trocar de cenário — travava o botão "Registrar venda" para sempre em cenários com uma única tipologia (sem outra opção pra forçar a resincronização manual). Causa raiz em duas camadas (achado F30, `docs/DECISOES.md`); corrigido nas duas, com teste que reproduz o problema e reverificação em navegador real sob trocas repetidas e rápidas.

**Não implementado nesta fatia (deliberadamente fora de escopo — Custos/Cronograma/Cenários ainda não começaram):** ação de "reservar" uma unidade (o status `reservada` já existe no schema desde a Fase 0/1, mas nenhum fluxo o produz — nem antes nem depois desta fatia, não é uma regressão), condição de pagamento empreendimento-wide (`tipologiaId=null`) não aparece no formulário de registrar venda (só as condições escopadas à tipologia selecionada), edição de unidade/condição de pagamento de uma venda já criada (só comprador/valor/mês são editáveis — trocar a unidade exigiria desfazer e refazer a venda).

## Fase 2 (código) — quadragésima fatia: Fase 2.2 — tela de Custos (este repositório, concluída)

Segundo incremento funcional da Fase 2, depois de Vendas aprovada. Objetivo: visão gerencial de custos (previsto/realizado/saldo/desvio) sem inventar nenhum cálculo novo — tudo que a tela mostra é o que o motor já projeta.

**Decisão de escopo:** achado F31 (`docs/DECISOES.md`) — zero alteração em `src/core` (as seis estratégias de incidência já cobriam tudo que a tela precisa). Duas rotas novas só agregam `resultado.desembolsos` (a mesma saída do motor já usada pelo fluxo de caixa): `/custos-resumo` (previsto/realizado/saldo/desvio por custo) e `/distribuicao-mensal` (a mesma saída, filtrada por custo, mês a mês). Lacuna real do modelo identificada e registrada, não contornada: custo fixo recorrente não tem realizado por mês, só um valor agregado para a série inteira — a tela expõe essa diferença explicitamente em vez de fingir um acompanhamento que o modelo não sustenta.

**Implementado:**
- API — `GET /api/cenarios/:id/custos-resumo` (novo), `GET /api/custos/:id/distribuicao-mensal` (novo); `POST /api/cenarios/:id/custos` e `PATCH /api/custos/:id` (quando altera campo do previsto) passaram a chamar `rodarMotorParaCenario()` depois de salvar, mesmo padrão de Vendas; `DELETE /api/custos/:id` ganhou `garantirAcesso()` (achado de permissão da mesma auditoria — consistência, sem risco prático hoje no modelo binário admin/usuário).
- Web — `web/src/pages/CustosPage.tsx` (nova): cards de KPI, filtro/busca/agrupamento/ordenação, formulário de lançamento (mesma lógica condicional por estratégia de incidência de `CadastroPage.tsx`), tabela com previsto/realizado/saldo/desvio por linha, painel de distribuição mensal expansível, marcar/estornar realizado (reaproveitando as rotas já existentes, nenhuma nova). Item "Custos" do menu lateral ativado. `key={cenarioId}` e reset de `categoriasDisponiveis`/`tipologiasDisponiveis` aplicados desde o primeiro commit — lição direta do bug de troca de cenário encontrado em Vendas (achado F30).
- 6 testes novos de API (`tests/integration/api.custosGerencial.test.ts`) e 4 testes novos de frontend (`web/src/pages/CustosPage.test.tsx`).
- Golden numbers, genericidade e isolamento multiempreendimento (custo em A não aparece no resumo de B nem altera sua necessidade de capital) reexecutados depois desta fatia.
- Verificado em navegador real (claro e escuro), incluindo os 10 fluxos do pedido do usuário e um teste de estresse dedicado: 18 trocas de cenário, incluindo uma rajada de 10 disparadas sem nenhuma espera entre elas (chegou a haver 4 requisições simultâneas em voo, confirmado por log de rede) — em nenhum momento a tabela mostrou dado do cenário anterior, e o formulário sempre resincronizou corretamente. Zero bugs funcionais encontrados nesta verificação.

**Duas observações honestas registradas, nenhuma corrigida nesta fatia (fora de escopo):** (1) `CategoriaCusto.empreendimentoId` é opcional (categoria pode ser global) — os dois empreendimentos usados na verificação tinham só categorias globais, então `GET /api/cenarios/:id` (campo `categoriasCustoDisponiveis`, que só segue a relação direta `empreendimento.categoriasCusto`) as devolvia vazias mesmo com custos reais já usando essas categorias via join direto em `/custos-resumo` — comportamento pré-existente, idêntico ao que `CadastroPage.tsx` já tinha antes desta fatia, não uma regressão da tela de Custos; corrigi-lo (decidir se/como listar categorias globais por empreendimento) é uma mudança de modelo de inventário, fora do escopo de uma tela operacional. (2) `recarregar()` em `CustosPage.tsx`, assim como em `VendasPage.tsx`, não tem `AbortController` nem checagem de que o `cenarioId` resolvido ainda é o atual — risco teórico de corrida sob respostas fora de ordem; não reproduzido no teste de estresse (localhost resolve em FIFO), mas é dívida técnica compartilhada pelas duas telas, registrada para uma fatia futura de hardening de frontend.

**Não implementado nesta fatia (deliberadamente fora de escopo — Cronograma/Cenários ainda não começaram):** granularidade mensal de realizado para custo fixo recorrente (limitação real do modelo, registrada acima — exigiria uma tabela nova), cadastro de destinatários de comissão/faixas de VGV pela tela de Custos (continua só em Cadastro, escopo de cadastro estrutural, não de operação), paginação na tabela de custos.

## Fase 2 (código) — quadragésima primeira fatia: Fase 2.3 — tela de Cronograma (este repositório, concluída)

Terceiro incremento funcional da Fase 2, depois de Vendas (Fase 2.1) e Custos (Fase 2.2). Objetivo pedido explicitamente: tratar o cronograma como entrada financeira (cronograma físico → curva de execução → desembolsos → fluxo de caixa → necessidade de capital), não como agenda — com análise do modelo apresentada antes de qualquer código, e nenhuma fórmula financeira relevante duplicada no frontend.

**Decisão de escopo:** achado F32 (`docs/DECISOES.md`) — a Fase 0 já deixava toda a base pronta (`CronogramaFisicoFinanceiro`, a estratégia `pct_execucao` do motor, a regra R6 de soma=100%, o CRUD excluir-e-recriar); a única peça que faltava era uma visão combinando `% físico`, `% acumulado`, `desembolso mensal` e `desembolso acumulado` num só lugar. Nova função pura `calcularCurvaCronograma()` (`src/core/motorCronograma.ts`, arquivo novo) resolve isso sem tocar em nenhuma das seis estratégias de incidência existentes. Nenhum campo novo além do que o domínio já suporta (curva continua livre, sem forma imposta; "duração da obra" é derivada, não um campo).

**Implementado:**
- Motor — `src/core/motorCronograma.ts` (novo): `calcularCurvaCronograma(cronograma, desembolsosObra)`, pura e determinística. Novo tipo `PontoCurvaCronograma` (`src/core/types.ts`).
- `src/db/servicoMotor.ts` — `montarCurvaCronogramaDoCenario()`: roda o motor, filtra `resultado.desembolsos` pelos ids de `Custo` com `tipoIncidencia="pct_execucao"` (mesmo padrão de filtro de `persistirDesembolsosCusto`), chama a função do motor.
- API — `GET /api/cenarios/:id/cronograma-curva` (novo), mesmo padrão de `custos-resumo`/`distribuicao-mensal`; nenhuma rota de escrita nova.
- Web — `CronogramaPage.tsx` (nova): 4 KPIs (duração da obra, mês de maior desembolso, desembolso total de obra, meses cadastrados), dois gráficos SVG lado a lado (curva física em % e curva financeira em R$, mesma convenção manual de `FluxoChart.tsx`), tabela mês a mês, formulário de cadastro/edição reaproveitando a lógica já existente em `CronogramaSecao` (`CadastroPage.tsx`, que continua existindo). Item "Cronograma" do menu lateral ativado — existia como stub inerte desde a Fase 1.
- 4 testes novos de motor (`tests/core/motorCronograma.test.ts`) e 6 novos de integração (`tests/integration/api.cronogramaCurva.test.ts`, incluindo o teste fundamental pedido: mesma soma de custo `pct_execucao`, curvas diferentes em relação ao mês da venda, necessidade de capital muda de R$1.200.000,00 para R$0,00). 3 testes novos de frontend (`web/src/pages/CronogramaPage.test.tsx`). Suíte total: backend 387 testes (era 377), frontend 11 testes (era 8).
- Verificado num navegador real (claro e escuro) contra o empreendimento Splendido (36 meses de cronograma real): KPIs, os dois gráficos, tooltip por mês ao passar o mouse (confirmado: "Mês 19 · % mensal 5,0% · % acumulado 48,1%"), tabela mês a mês e formulário de edição pré-preenchido, nos dois temas — zero erro no console além dos 401 esperados de `/api/auth/me` antes do login.

**Não implementado nesta fatia (deliberadamente fora de escopo):** etapas/fases construtivas nomeadas, datas reais de início/término de obra (nenhum dos dois existe no domínio — não inventados), indicador de "estágio atual" ancorado no relógio real (violaria o motor determinístico — documentado como possibilidade futura usando `Cenario.dataMesUm`), edição ponto a ponto do cronograma (mesma política já em vigor desde a Fase 0 — excluir e recriar), granularidade de "realizado" mês a mês para o cronograma (`previstoRealizado` já existe no schema, mesma lacuna do achado F31 para custo fixo, carregada sem alteração), tela de Cenários (explicitamente fora de escopo).

## Fase 2 (código) — quadragésima segunda fatia: Fase 2.4 — tela de Cenários (este repositório, concluída)

Quarto incremento funcional da Fase 2, depois de Vendas (2.1), Custos (2.2) e Cronograma (2.3). Objetivo pedido explicitamente: cenário não é "três cadastros chamados Otimista/Realista/Pessimista", é uma ferramenta para entender como premissas diferentes mudam VGV → recebimentos → custos → cronograma → fluxo de caixa → necessidade de capital, com comparação, gráficos e diferenças de premissas — sem inventar indicadores que o motor não suporta, com análise do modelo apresentada antes de qualquer código.

**Decisão de escopo:** achado F33 (`docs/DECISOES.md`) — a maior parte já existia: CRUD completo de `Cenario` (`CadastroPage.tsx`), duplicação com cópia seletiva de premissas (achado F10) e uma comparação de 1 nível por derivação (achado F18, `ComparacaoVersoesPanel.tsx` em `FluxoCaixaPage.tsx`) — **nenhum dos dois foi alterado**. A lacuna real era uma tela dedicada comparando **qualquer subconjunto** de cenários do mesmo empreendimento, com mais indicadores e diferenças de premissas. Dois achados negativos importantes, sinalizados em vez de inventados: TIR/margem/lucro não existem no motor (só `necessidadeMaximaCapital`, `mesPico`, `mesRecuperacao`, `saldoFinal`, `vpl`); "preço médio" e "prazo de recebimento" não são premissas por cenário neste modelo (vivem em `Unidade`/`Tipologia`/`CondicaoPagamento`, compartilhados por todos os cenários do empreendimento).

**Implementado:**
- `src/db/servicoMotor.ts` — `montarComparacaoCenarios(empreendimentoId, cenarioIds)` (novo): roda `rodarMotorParaCenario()` (sem mudança) para cada cenário pedido, filtrado por empreendimento (R12); agrega VGV (soma de `Venda.valorVenda`), recebimentos/custos previstos, `saldoFinal`, indicadores já existentes, fluxo mensal completo e resumo de premissas (velocidade de vendas, custos, cronograma, financiamento). **Zero alteração em `src/core`.**
- API — `GET /api/empreendimentos/:id/cenarios/comparacao?ids=a,b,c` (novo, leitura apenas); a rota de 1 nível (`/cenarios/:id/comparacao`) e `ComparacaoVersoesPanel` continuam intocadas.
- Web — `CenariosPage.tsx` (nova): lista de cenários com seleção por checkbox e badge "Base"; criar/editar/duplicar/excluir reaproveitando as mesmas funções de `client.ts` já usadas em `CadastroPage.tsx` (que continua existindo); botão "Comparar selecionados" → tabela de indicadores (VGV, Recebimentos, Custos, Fluxo líquido, Necessidade máxima de capital, Mês do pico, VPL — com nota explicando a ausência de TIR/"Resultado"), 4 gráficos multi-série (`CenariosComparacaoChart.tsx`, novo) e painel de diferenças de premissas. Item "Cenários" do menu lateral ativado — stub inerte desde a Fase 1.
- 7 testes novos de integração (`tests/integration/api.cenariosComparacao.test.ts`, incluindo o teste fundamental pedido: Base → duplicar Otimista com comissão menor → indicadores mudam, Base intacto → duplicar Base para Pessimista com financiamento → comparar os três juntos) e 5 novos de frontend (`web/src/pages/CenariosPage.test.tsx`). Suíte total: backend 394 testes (era 387), frontend 16 testes (era 11).
- Verificado num navegador real (claro e escuro) contra o empreendimento Splendido: duplicou dois cenários pela tela, selecionou os três, comparou — tabela, os 4 gráficos com legenda por cor e o painel de diferenças de premissas mostrando as tipologias/custos reais do Splendido, corretos nos dois temas.

**Não implementado nesta fatia (deliberadamente fora de escopo):** TIR/margem/lucro (não existem no motor — sinalizado, não implementado), "preço médio"/"prazo de recebimento" por cenário (não são premissas cenario-scoped neste modelo), módulo de Relatórios (PDF/Excel — a comparação já usa só dados oficiais do motor/banco, pronta para um exportador futuro, mas nada é exportado nesta fase), IA, notificações, alertas automáticos, gestão preventiva, dashboard executivo, portfólio — explicitamente adiados pelo usuário.

## Próxima fase

A lista de cinco itens aprovada em bloco, a décima fatia de edição/exclusão completa, a décima primeira de permissão por empreendimento, a lista de quatro itens (correção monetária, distrato, terreno pela interface, polimento de lacunas menores), a décima sexta fatia de simulação de sensibilidade, a décima sétima de financiamento de produção, a décima oitava de alerta de risco, a décima nona de versão de cenário, a vigésima de estrutura de comissão, a vigésima primeira de correção monetária de custos, a vigésima segunda de split nominal de comissão, a vigésima terceira de segurança de sessão, a vigésima quarta de alertas de risco configuráveis, a vigésima quinta de amortização SAC/Price, a vigésima sexta de distrato parcial, a vigésima sétima de comparação de cenários derivados, a vigésima oitava de gráfico de sensibilidade, a vigésima nona de correção monetária por índice diferenciado, a trigésima de realizado para custos percentuais, a lista de sete itens aprovada em bloco pelo usuário (trigésima primeira a trigésima sétima fatias), a trigésima oitava de fechamento e hardening da Fase 1, a trigésima nona de Fase 2.1 — Vendas, a quadragésima de Fase 2.2 — Custos, a quadragésima primeira de Fase 2.3 — Cronograma, e a quadragésima segunda de Fase 2.4 — Cenários estão concluídas. **Aguardando aprovação do relatório da Fase 2.4 para iniciar a Fase 2.5.**
