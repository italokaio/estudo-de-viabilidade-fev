# Inventário do sistema — ERP de Viabilidade

Gerado em 2026-10-03 a partir do código atual do repositório (`src/`, `api/src/`, `web/src/`, `prisma/schema.prisma`).
Quando algo está parcial, isso está dito explicitamente. Documentos de fase (`docs/FASES.md`, `docs/HANDOFF.md`) estão desatualizados e não foram usados como fonte: onde divergem do código, vale o código.

Convenções do sistema: todo valor monetário ou percentual é **texto decimal** (`String`) no banco e `Decimal.js` no motor. Mês é sempre um **inteiro relativo** (mês 1, 2, 3…), nunca uma data — exceto `Cenario.dataMesUm`, usado só para conciliação de extrato.

---

## 1. Modelo de dados

São **25 modelos** no Prisma (SQLite em desenvolvimento, via `DATABASE_URL`).

### 1.1 Acesso e usuários

**Usuario** (`usuario`)
| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | string (cuid) | sim | |
| email | string | sim, único | Gravado em minúsculas e sem espaços |
| nome | string | sim | |
| senhaHash | string | sim | bcrypt |
| papel | string | padrão `usuario` | `admin` \| `usuario` \| `stakeholder` (validado na API) |
| createdAt / updatedAt | datetime | automáticos | |

Validações: senha com mínimo de 6 caracteres; email e nome obrigatórios.

**Sessao** (`sessao`): `id`, `usuarioId`, `token` (único, aleatório, opaco), `expiraEm`, `createdAt`. Duração fixa de 7 dias, sem renovação automática.

**EmpreendimentoUsuario** (`empreendimento_usuario`): `empreendimentoId`, `usuarioId`, `papel` (`edicao` padrão \| `leitura`), `createdAt`. Único por (usuário, empreendimento). Só tem efeito para papel `usuario`; `admin` ignora a tabela e `stakeholder` nunca pode ter `edicao` (bloqueado na API).

### 1.2 Cadastro do empreendimento

**Empreendimento** (`empreendimento`): `nome` (obrigatório), `incorporador` (opcional), `endereco` (opcional), `statusFase` (opcional — **não usado**, ver §5), `dataPrevistaConclusao` (opcional — **sem entrada pela API nem pela tela**, só por importador, ver §5), `createdAt`, `updatedAt`.
Relaciona-se com: cenários, terrenos, tipologias, unidades, condições de pagamento, premissas de velocidade, vendas, categorias de custo, custos, cronograma, permutas, vínculos de usuário, índices de correção, distratos, renegociações e financiamentos.

**Terreno** (`terreno`) — várias matrículas por empreendimento (1:N):
| Campo | Tipo | Validação / observação |
|---|---|---|
| numeroMatricula | string? | identificador livre (nº no cartório) |
| areaValor | string? | decimal-as-string; nulo = não validado |
| areaUnidade | string | padrão `m2` |
| areaStatusValidacao | string | padrão `pendente`; `pendente` \| `validado` \| `conflitante` |
| areaObservacao | string? | texto livre |
| formaAquisicao | string? | `compra` \| `permuta` \| `misto` (texto da tela) |

Terreno **nunca é lido pelo motor financeiro** — só cadastro.

**Tipologia** (`tipologia`): `nome` (obrigatório), `areaPrivativaPadrao` (decimal?), `precoUnitarioPadrao` (decimal?). Preço padrão é usado como `precoVenda` das unidades geradas em lote.

**Unidade** (`unidade`): `tipologiaId`, `numero` (obrigatório, texto; a geração em lote gera `PREFIXO-1`, `PREFIXO-2`…), `andar` (inteiro?, usado pela precificação por andar), `orientacao` (**não usado**, ver §5), `areaPrivativa` (decimal?), `precoVenda` (decimal?), `status`.
- `status` padrão `estoque`. Valores possíveis no schema: `estoque | reservada | vendida | permutada | distratada | indisponivel`. **Na prática, o código grava apenas `estoque`, `vendida` e `permutada`** (ver §5).
- Estoque é **compartilhado entre todos os cenários do mesmo empreendimento**: uma venda num cenário consome a unidade para os outros.

**Permuta** (`permuta`): 1:1 com Unidade (`unidadeId` único). `nomeContraparte` (obrigatório), `documento?`, `valorAtribuido?` (só registro), `dataAcordo?`, `observacao?`. A unidade fica `permutada` e sai do VGV. **Nunca lida pelo motor** além de tirar a unidade do estoque.

**ContrapartePermuta** (`contraparte_permuta`): `permutaId` (cascata ao apagar a permuta), `nome`, `documento?`, `percentualSplit` (0..1; soma de todas as contrapartes não pode passar de 100%, validado na API), `valorAtribuido?`. Só registro.

### 1.3 Condições de pagamento

**CondicaoPagamento** (`condicao_pagamento`): `empreendimentoId`, `tipologiaId?` (opcional no schema), `nome`. Relaciona-se com modalidades e vendas.

**ModalidadePagamento** (`modalidade_pagamento`): `condicaoPagamentoId`, `nome`, `percentual` (0..1; a soma das modalidades de uma condição deve ser 1 — validado em `validarCondicaoPagamento`), `tipoDistribuicao`, `periodicidadeMeses?` (obrigatório se periódica), `mesFixo?` (obrigatório se mês fixo), `repeticoesSobreTotal` (inteiro, padrão 1), `geraEventoParcial` (booleano, padrão `false`), `ordem` (inteiro, padrão 0).
- `tipoDistribuicao` válido no motor e na tela: **`unica_na_venda` \| `nivelada` \| `periodica` \| `mes_fixo`**. O comentário do schema cita `sobre_total`, que **não existe no motor** (ver §5).

### 1.4 Vendas e premissas

**PremissaVelocidadeVendas** (`premissa_velocidade_vendas`): `cenarioId`, `tipologiaId`, `mes`, `unidadesPrevistas` (texto decimal, na prática inteiro). Alimenta a geração de vendas reais (§2.7) e a projeção de vendas (§2.7b).

**Venda** (`venda`): `cenarioId`, `unidadeId`, `mesOrigem` (inteiro), `valorVenda` (decimal), `condicaoPagamentoId`, `status` (`ativa` \| `distratada`), `comprador?`, `documentoComprador?` (cadastro nominal, nunca lido pelo motor).
- Vendas são criadas de duas formas: manual (valida `mesOrigem` entre 1 e o horizonte e exige preço na unidade) ou automática por premissa de velocidade (ver §2.7).

**RenegociacaoVenda** (`renegociacao_venda`): `vendaId`, `valorVendaAnterior`, `novoValorVenda` (sempre menor que o anterior), `motivo?`. Registro histórico; o motor lê `Venda.valorVenda` já atualizado.

**Distrato** (`distrato`): 1:1 com Venda. `dataDistrato`, `valorRecebidoAteDistrato` (soma dos recebimentos marcados como recebidos), `percentualRetencao` (0..1), `valorRetido` (= recebido × retenção), `valorReembolsar` (= recebido − retido), `motivo?`. Só registro; o motor simplesmente deixa de considerar a venda.

### 1.5 Recebimentos

**RecebimentoProjetado** (`recebimento_projetado`): `vendaId`, `modalidadeId`, `mesCompetencia`, `valorPrevisto` (decimal, gerado pelo motor), `valorRealizado?`, `status` (`previsto` padrão; `recebido` \| `atrasado`). Chave única (venda, modalidade, mês). Gerado e regravado pelo motor; `valorRealizado` e `status` são preenchidos pelo usuário.

### 1.6 Custos

**CategoriaCusto** (`categoria_custo`): `empreendimentoId?` (nulo = categoria global), `nome`, `tipoIncidencia`. Valores aceitos pela API (6): `fixo` \| `pct_vgv_vendido_no_mes` \| `pct_recebido_no_mes` \| `pct_recebido_mes_anterior` \| `pct_execucao` \| `faixas_vgv_acumulado`. (O comentário do schema lista valores antigos — `pct_vgv`, `pct_recebido` — que não são mais os usados.)

**Custo** (`custo`): `cenarioId`, `categoriaId`, `tipologiaId?` (escopo — só aceito para `pct_vgv_vendido_no_mes`, `pct_recebido_no_mes` e `faixas_vgv_acumulado`), `valorPrevisto?` (decimal, para `fixo` e `pct_execucao`), `percentual?` (0..1, para os demais percentuais), `competenciaMes?` (obrigatório para `fixo`), `vencimentoMes?` (**não usado**), `recorrencia` (`unico` padrão \| `mensal`; `mensal` repete de `competenciaMes` até o horizonte), `valorRealizado?` (só para `fixo`), `participaFluxoCaixa` (padrão `true`; `false` tira o custo do fluxo), `status` (`previsto` \| `realizado`), `grupoIndiceCorrecao` (padrão `padrao`).
- Validações na criação/edição: valor e percentual aceitam **apenas número com ponto decimal, sem espaços**; percentual entre 0 e 1 (adicionado nesta rodada). Demais entradas: ver §1.10.

**DesembolsoCusto** (`desembolso_custo`): `custoId`, `mes`, `valorPrevisto` (regravado pelo motor), `valorRealizado?`, `status`. Chave única (custo, mês). Existe porque um custo percentual gera **várias** parcelas, e cada uma pode ser marcada como paga.

**DestinatarioComissao** (`destinatario_comissao`): `custoId`, `nome`, `percentualSplit` (0..1). Cadastro nominal de quem recebe a comissão — **só registro, não lido pelo motor**.

**FaixaComissao** (`faixa_comissao`): `custoId`, `volumeAte?` (VGV acumulado; nulo = faixa aberta), `percentual` (0..1). Validado: `volumeAte` não duplicado e no máximo uma faixa aberta. **Lida pelo motor.**

### 1.7 Cronograma, correção e financiamento

**CronogramaFisicoFinanceiro** (`cronograma_fisico_financeiro`): `cenarioId`, `mes`, `percentualExecucaoMensal` (0..1), `previstoRealizado` (padrão `previsto`, **não usado**). Chave única (cenário, mês). A soma dos percentuais deve fechar em 1 (tolerância 0,0005), validado ao salvar.

**IndiceCorrecao** (`indice_correcao`): `cenarioId`, `grupo` (padrão `padrao`), `mes`, `percentual` (variação do mês, pode ser negativa). Chave única (cenário, grupo, mês). Sem soma obrigatória: cada mês é independente.

**FinanciamentoProducao** (`financiamento_producao`): 1:1 com o cenário. `valorContratado` (decimal), `taxaJurosMensal` (0..1), `mesAmortizacao` (inteiro ≥ 1), `tipoAmortizacao` (`unico` padrão \| `sac` \| `price`), `numeroParcelas?` (obrigatório ≥ 1 para `sac` e `price`).

### 1.8 Cenário e empreendimento de topo

**Cenario** (`cenario`): `empreendimentoId`, `tipo` (`base` \| `otimista` \| `pessimista` \| `personalizado` — **é só um rótulo; nenhum cálculo depende dele**), `nome`, `derivadoDeCenarioId?` (cópia de outro cenário, ver §3), `horizonteProjecaoMeses` (inteiro ≥ 1), `limiteNecessidadeMaximaCapital?` (0..1; nulo = padrão de 30% do VGV), `dataMesUm?` (data de calendário do mês 1, só para conciliação de extrato), `createdAt`, `updatedAt`.
- **Taxa de desconto (TMA) por cenário**, opcional (`taxaDescontoMensal`). Nulo = padrão do sistema, 0,5% a.m. (ver §2.2).

### 1.9 Relações resumidas

Empreendimento → (1:N) Cenário, Terreno, Tipologia, Unidade, CondicaoPagamento, CategoriaCusto (opcional), Permuta, Distrato, RenegociacaoVenda, EmpreendimentoUsuario.
Tipologia → (1:N) Unidade, CondicaoPagamento, PremissaVelocidadeVendas, Custo (escopo opcional).
Unidade → (1:N) Venda; (1:1) Permuta.
Venda → (1:N) RecebimentoProjetado, RenegociacaoVenda; (1:1) Distrato.
Custo → (1:N) DesembolsoCusto, DestinatarioComissao, FaixaComissao (todas em cascata ao apagar o custo).
Cenário → (1:N) Venda, Custo, PremissaVelocidadeVendas, CronogramaFisicoFinanceiro, IndiceCorrecao; (1:1) FinanciamentoProducao; (1:N, auto-relação) Cenario derivado.

### 1.10 Validações da API (resumo)

| Entrada | Regra |
|---|---|
| Quantidade de unidades | inteiro > 0 |
| Preço de venda das unidades | obrigatório |
| Prefixo de número | obrigatório |
| Horizonte do cenário | inteiro > 0 |
| Limite de risco | número ≥ 0 |
| Mês da venda (manual) | inteiro entre 1 e o horizonte |
| Valor da venda (manual) | obrigatório — unidade precisa ter preço |
| Tipo de incidência de custo | um dos 6 valores acima |
| Tipo de cenário | um dos 4 valores |
| Valor e percentual de custo | só texto decimal com ponto, sem espaços; percentual 0..1 (nesta rodada) |
| Mês de competência de custo fixo | obrigatório |
| Cronograma | soma = 100% |
| Condição de pagamento | soma das modalidades = 100% |
| Índice de correção | mês inteiro ≥ 1; percentual numérico |
| Financiamento | valor e taxa numéricos; mês de amortização inteiro ≥ 1; nº de parcelas inteiro ≥ 1 se não for pagamento único |
| Split de permuta/comissão | soma ≤ 100% |
| Papel de usuário | `admin`, `usuario` ou `stakeholder` |
| Vínculo de acesso | `edicao` ou `leitura`; stakeholder só `leitura` |
| Senha | mínimo 6 caracteres |

Validação de formato decimal (sem espaços, com ponto) aplicada a: custos (valor e percentual), cronograma, índices de correção (aceitam variação negativa), condições de pagamento (percentual de modalidade), financiamento (valor e taxa), destinatários de comissão, faixas de comissão, contrapartes de permuta e premissas de velocidade.

---

## 2. Fórmulas e regras do motor financeiro

O motor (`src/core/`) é puro: não acessa banco, não lê relógio, usa `Decimal.js`. `executarMotorFinanceiro` encadeia as etapas abaixo. As **saídas oficiais** (saldo, VPL, necessidade, mês de pico e de recuperação) usam **valores nominais**; a correção monetária é uma visão paralela (§2.6).

### 2.1 Recebimentos (motorRecebimentos.ts)

Para cada venda e cada modalidade, `valorTotalModalidade = valorVenda × percentual`, distribuído como segue:

- **`unica_na_venda`**: um único evento no mês da venda.
- **`nivelada`**: divide igualmente pelos meses **restantes** (de `mesOrigem + 1` até o horizonte). Se a venda cai no último mês ou depois, o valor inteiro cai no próprio mês da venda.
- **`periodica`**: com `periodo = periodicidadeMeses`, `ciclos = floor((horizonte − mesOrigem) / periodo)`. Cada ciclo recebe `valorTotal / ciclos`, no mês `mesOrigem + i × periodo`. Se não há ciclo completo, a modalidade **não gera nada**, a menos que `geraEventoParcial = true` — nesse caso, o valor inteiro vai para o último mês do horizonte. (`geraEventoParcial` existe no motor, mas a tela **não expõe o campo**: fica sempre `false`.)
- **`mes_fixo`**: mês efetivo = `max(mesFixo, mesOrigem)` — uma venda nunca recebe antes de ser vendida. O valor é dividido por `repeticoesSobreTotal` (mínimo 1) e lançado em **meses consecutivos** a partir do mês efetivo. (A **repetição é suportada pelo motor, mas a tela não tem o campo** — cadastrar repetição exige a API.)

### 2.2 Indicadores e VPL (motorFluxoCaixa.ts)

- **Fluxo mensal** = entradas − saídas de cada mês (entradas = recebimentos nominais + liberações de financiamento; saídas = desembolsos de custo + amortizações de financiamento). Só entram custos com `participaFluxoCaixa = true`.
- **Fluxo acumulado** = soma cumulativa do fluxo mensal, mês a mês, até o horizonte.
- **Necessidade máxima de capital** = `|menor acumulado|` se o menor for negativo; senão 0.
- **Mês do pico** = primeiro mês em que o acumulado atinge seu menor valor.
- **Mês de recuperação** = primeiro mês **após o pico** a partir do qual o acumulado fica ≥ 0 até o fim do horizonte. `null` se não recupera.
- **Saldo final** = acumulado do último mês.
- **VPL** = Σ fluxo(t) / (1 + i)^t, com t começando em 1 (equivalente ao NPV do Excel).
- **Taxa de desconto i**: a do cenário (`taxaDescontoMensal`) ou, se nula, 0,5% a.m. (`TAXA_DESCONTO_MENSAL_PADRAO`). A mesma taxa vale para fluxo, comparação, sensibilidade e relatórios.
- **TIR mensal**: taxa que zera o VPL do mesmo fluxo mensal. Procura trocas de sinal numa grade de -99% a 1.000% a.m. e refina por bisseção; se houver mais de uma raiz, usa a mais próxima de zero. Devolve "não aplicável" quando o fluxo não tem entradas e saídas de sinais opostos ou não muda de sinal.

### 2.3 Custos (motorCustos.ts) — seis tipos de incidência

- **`fixo`**: valor único no mês de competência (`recorrencia = unico`) ou repetido todo mês de `competenciaMes` até o horizonte (`recorrencia = mensal`).
- **`pct_vgv_vendido_no_mes`**: para cada mês de origem de venda, soma `valorVenda` das vendas daquele mês × percentual. Com escopo de tipologia, considera só as vendas dessa tipologia.
- **`pct_recebido_no_mes`**: para cada mês, soma os **recebimentos** daquele mês (das vendas no escopo) × percentual. A comissão acompanha a curva de recebimento.
- **`pct_recebido_mes_anterior`**: para cada mês, soma **todos** os recebimentos do mês anterior × percentual. Não tem escopo por tipologia. Meses sem recebimento anterior não geram linha.
- **`pct_execucao`**: `valorPrevisto` (custo total) × percentual de execução de cada mês do cronograma. Meses com percentual zero não geram linha.
- **`faixas_vgv_acumulado`**: as vendas no escopo são ordenadas por mês de origem (desempate por id) e o VGV acumulado é contado venda a venda. Cada venda usa **uma única taxa**: a da faixa em que o acumulado fica **depois** de incluir a própria venda. Acima da última faixa, usa a taxa da última. Não é tributação marginal.

Observação: o motor não conhece o nome das rubricas ("comissão", "RET" etc.) — isso é só uma convenção do usuário.

### 2.4 Financiamento de produção (motorFinanciamento.ts)

- **Liberação** do mês = `valorContratado × percentual de execução do mês` (mesma curva do cronograma).
- **Juros** são capitalizados mês a mês sobre o saldo devedor enquanto a obra avança, antes de `mesAmortizacao`: `juros = saldo × i`, e o saldo cresce pelos juros e pela liberação.
- **Pagamento único (`unico`)**: no mês de amortização, a amortização é o saldo inteiro (principal + juros capitalizados) e o saldo zera.
- **SAC**: a tabela é fixada no mês de amortização sobre o saldo acumulado `P`. Amortização constante `P / n`; em cada mês, `juros = saldo × i` e parcela = amortização + juros, decrescente.
- **Price**: a tabela é fixada sobre `P`, com parcela constante `PMT = P × i / (1 − (1 + i)^−n)` (ou `P / n` se `i = 0`). Em cada mês, `juros = saldo × i` e amortização = PMT − juros.
- Simplificação documentada: **liberações que ocorram durante a amortização aumentam o saldo, mas não geram parcela extra nem recalculam a tabela.**

### 2.5 Alertas (motorAlertas.ts) — quatro regras

1. `necessidade_maxima_alta` (crítico): necessidade máxima / VGV total acima do limite (padrão 30%, ou o configurado no cenário).
2. `sem_recuperacao` (crítico): o acumulado nunca volta a ficar ≥ 0 dentro do horizonte.
3. `custo_execucao_sem_cronograma` (aviso): há custo `pct_execucao` e nenhum cronograma cadastrado.
4. `financiamento_amortizacao_sem_receita` (crítico): a amortização é maior que a receita de recebimentos acumulada até o mês da amortização.

Alertas só interpretam o resultado: nunca mudam fluxo nem indicadores. São recalculados a cada consulta, nunca persistidos.

### 2.6 Correção monetária (motorCorrecao.ts) — visão paralela

- **Fator** entre um mês-base e outro = produto de `(1 + variação)` de cada mês do intervalo `(base, mês]`. Mês sem índice conta como variação zero. Sem nenhum índice, fator = 1.
- **Recebimentos**: corrigidos pela série `padrao`, com base no **mês da venda** de cada parcela.
- **Desembolsos de custo**: corrigidos pela série do próprio custo (`grupoIndiceCorrecao`; grupo sem pontos = fator 1), com **mês-base fixo = 1**.
- **Liberações e amortizações de financiamento não são corrigidas.**
- Resultado: `entradasCorrigidas` e `saidasCorrigidas` por mês, exibidos na tela de fluxo.
- **Ponto de atenção para análise de mercado:** a correção **não altera** saldo, VPL, necessidade nem mês de pico — esses indicadores são sempre nominais. E o **relatório não inclui a série corrigida** (§3).

### 2.7 Geração automática de vendas (src/db/gerarVendas.ts)

A partir das premissas de velocidade (tipologia × mês × unidades), para cada premissa: arredonda a quantidade com `Math.round`, procura a condição de pagamento da tipologia, pega as unidades em estoque da tipologia **ordenadas por `numero` como texto** e cria uma venda por unidade com `valorVenda = precoVenda` (ou `"0"` se a unidade não tiver preço). Se faltar unidade em estoque, lança erro. Não há transação: um erro no meio deixa vendas já criadas (§5).

### 2.7b Vendas projetadas por premissa (src/db/servicoMotor.ts, `montarVendasProjetadasDoCenario`)

Cada unidade prevista numa premissa vira uma venda **em memória**, sem registro `Venda` e sem consumir o estoque, que é compartilhado entre cenários. O motor financeiro, o VGV e o relatório a enxergam junto com as vendas reais.

- **Regra de entrada (tudo ou nada por tipologia):** a projeção só entra para tipologias do cenário que não têm nenhuma venda registrada nele (qualquer status). Tipologia com venda real no cenário fica só com a venda real, mesmo que a premissa peça mais unidades.
- **Preço:** média das vendas reais ativas da tipologia em qualquer cenário do empreendimento; se não houver nenhuma, o preço padrão da tipologia. Sem preço padrão, lança erro.
- **Condição de pagamento:** a primeira condição da tipologia no empreendimento. Sem condição, lança erro.
- **Persistência:** projeções nunca viram `RecebimentoProjetado`. Ficam só no resultado do motor e nos relatórios, rotuladas como "Projetada (tipologia)".
- **Relatórios:** o Resumo separa unidades e VGV reais de projetados (linhas só aparecem quando há projeção); a seção "Vendas projetadas (premissa de velocidade)" resume por tipologia (unidades, VGV, ticket médio). A linha "Estoque" ganha a nota de que inclui vendas de todos os cenários quando há projeção.
- **Premissas no Comparativo e no painel:** mostram unidades reais e projetadas por cenário.

**Limitações conhecidas:**
- A projeção é tudo-ou-nada por tipologia. Se a tipologia já tem uma venda real, a premissa restante **não** é projetada, mesmo que faltem unidades. Projeção parcial está planejada para depois da demo.
- A premissa não tem teto de estoque. Se a soma passar do total de unidades da tipologia, o resultado é projetado mesmo assim. Isso gera **aviso não bloqueante** ("Premissa de velocidade da tipologia X soma N unidades, mas a tipologia tem M"), exibido no formulário de premissas, no painel do Comparativo e como "[AVISO]" nos relatórios. O aviso não altera nenhum número.
- Vendas projetadas não aparecem nas listas de vendas, nem em "Unidades vendidas" (que conta só as reais), nem na tabela de recebimentos da tela de cenário (que lê só o banco).
- Duplicar um cenário copia as premissas, mas não as vendas reais; o derivado passa a ter receita só se a premissa copiada for projetada.

### 2.8 Cronograma e curva (motorCronograma.ts)

A curva combina `percentualExecucaoMensal` com o desembolso das obras (`pct_execucao`). Mostra percentual mensal e acumulado, desembolso mensal e acumulado. A união de meses entre cronograma e desembolsos evita perder meses.

### 2.9 Precificação por andar (precificacaoAndar.ts)

Preço de uma unidade a partir de um andar-base:
- **`fixo`**: `precoBase + incremento × (andar − andarBase)`.
- **`percentual`**: `precoBase × (1 + incremento)^(andar − andarBase)`.
Andares abaixo da base seguem a mesma regra com diferença negativa. Exposto pela rota de geração de unidades por andar.

### 2.10 Sensibilidade (motorSensibilidade.ts)

Reexecuta o motor com uma premissa perturbada, para cada variação pedida, e devolve VPL, necessidade máxima e mês de pico. **Nada é persistido.** Três eixos:
- `custo`: escala todos os custos pelo fator `1 + variação`.
- `vgv`: escala o valor de todas as vendas pelo fator `1 + variação`. A comissão percentual acompanha.
- `velocidadeVendas`: desloca o mês de origem de todas as vendas em N meses; vendas que saem do horizonte somem da projeção.

### 2.11 Conciliação de extrato (conciliacaoExtrato.ts)

Lê CSV com cabeçalho `Data, Descrição, Valor` (nomes sem diferenciar maiúsculas e acentos). Linha com valor inválido é descartada. Positivo = entrada, negativo = saída. A camada de banco monta candidatos e o motor **sugere** casamentos por valor e, quando há `dataMesUm`, por proximidade de data. Nada é gravado sem confirmação explícita do usuário.

---

## 3. Composição dos relatórios

Todos os relatórios são montados a partir de `montarDadosRelatorioViabilidade` (ou `…Comparativo`), que roda o motor **uma vez** e agrega o que ele devolve. Nenhum relatório recalcula valor fora do motor.

### 3.1 Viabilidade (PDF e Excel) — completo

**PDF, nesta ordem:**
1. **Capa**: título, empreendimento, incorporador, cenário (tipo e, se houver, de qual cenário foi derivado), data de geração.
2. **Resumo Executivo**: VGV, unidades, unidades vendidas, recebimentos previstos, custos previstos, fluxo líquido (saldo final), necessidade máxima de capital, mês do pico, mês de recuperação, VPL. Depois, os **alertas** do cenário (se houver), com `[ALERTA]` para os críticos.
3. **Premissas**: horizonte, limite de capital (ou "padrão 30%"), velocidade total prevista; **tabela de velocidade por tipologia** (se houver); **bloco de financiamento** (valor, juros, tipo de amortização) — só se existir financiamento.
4. **Produto e Unidades**: tabela por tipologia (área, preço unitário, quantidade) e linha de estoque por status.
5. **Vendas** (só se houver vendas): **todas as vendas, inclusive distratadas**, uma linha por unidade — unidade, tipologia, comprador, mês, valor, status.
6. **Recebimentos Projetados** (só se houver): uma linha por unidade × modalidade × mês — previsto, realizado, status.
7. **Custos** (só se houver): categoria, incidência, previsto, realizado, saldo a realizar.
8. **Cronograma Físico-Financeiro** (só se houver): frase com mês de início e fim da obra, depois tabela mensal de percentual e desembolso, mensal e acumulado.
9. **Fluxo de Caixa**: gráfico (entradas, saídas, saldo acumulado) e tabela mês a mês.
10. **Necessidade de Capital**: parágrafo com o valor, o mês do pico e a recuperação.

**Excel, abas:** Resumo (com alertas), Premissas, Unidades (estoque por status), Vendas, Recebimentos, Custos, Cronograma, Fluxo de Caixa, Necessidade de Capital. As abas Vendas, Recebimentos, Custos e Cronograma aparecem só quando há dados.

### 3.2 Viabilidade Resumido (PDF e Excel) — versão enxuta

Mesmas seções do completo, exceto duas:
- **Vendas**: uma linha por tipologia, só com vendas **ativas** — unidades vendidas, VGV vendido, ticket médio (VGV ÷ unidades) — mais linha de total.
- **Recebimentos**: uma linha por mês do horizonte (inclusive meses sem recebimento) — total previsto e total realizado — mais linha de total.

Excel: abas "Vendas por tipologia" e "Recebimentos por mês".

### 3.3 Comparativo de Cenários (PDF e Excel)

Requer dois ou mais cenários do mesmo empreendimento.
- **PDF**: capa; **Indicadores** (tabela, um cenário por coluna, com nota de que TIR e "Resultado" não são calculados); **Premissas** (tabela); **Fluxo de Caixa — saldo acumulado comparado** (gráfico com uma curva por cenário); **Necessidade de Capital** (tabela).
- **Excel**: abas Resumo, Premissas, Fluxo de Caixa, Necessidade de Capital.
- Indicadores da comparação: VGV, recebimentos previstos, custos previstos, fluxo líquido (saldo final), necessidade máxima de capital, mês do pico, VPL.

### 3.4 O que **não** aparece em nenhum relatório

- Permutas (nominais e valores atribuídos) — a unidade aparece como "permutada" no estoque, sem detalhe.
- Distratos (valor recebido, retenção, reembolso) e renegociações de venda.
- Sensibilidade e alertas de conciliação de extrato.
- Correção monetária: a série corrigida de entradas e saídas (§2.6) **não está no relatório**.
- Destinatários de comissão e faixas de comissão progressiva (aparecem só o custo agregado).
- Financiamento detalhado mês a mês (só os parâmetros aparecem; a tabela de liberação/amortização não).
- Histórico de alertas (não existe — ver §5).

---

## 4. Papéis e permissões

Os papéis são globais (campo `Usuario.papel`) e se combinam com o vínculo por empreendimento (`EmpreendimentoUsuario.papel`).

### 4.1 Admin
- Acesso total a **todos** os empreendimentos, sem precisar de vínculo.
- Único papel que pode: criar, listar e excluir usuários; redefinir a senha de qualquer usuário; gerenciar vínculos de acesso; **executar as 17 rotas de exclusão** (empreendimento, tipologia, categoria de custo, condição de pagamento, cenário, custo, cronograma, índice de correção, financiamento, terreno, permuta, contraparte, distrato, destinatário, faixa, usuário e vínculo).
- Não pode excluir a própria conta (bloqueado na API).

### 4.2 Usuário (`papel = usuario`)
- Vê **só** os empreendimentos vinculados. Acesso a um empreendimento sem vínculo devolve **404** (não revela que ele existe).
- Com vínculo `edicao`: cria, edita e registra vendas, custos, cronograma, premissas, índices, financiamento e permutas dentro do empreendimento.
- Com vínculo `leitura`: só leitura. Qualquer método que não seja GET devolve 403.
- Pode criar empreendimento; o criador é vinculado automaticamente com `edicao`.
- **Não pode excluir nada** (exclusões são exclusivas de admin).
- Não vê a lista de usuários nem gerencia vínculos.

**Decisão (criação de empreendimento por quem tem vínculo de leitura):** mantida. A API permite criar empreendimento ao papel `usuario`, inclusive com vínculo de leitura em outros empreendimentos; só o stakeholder é bloqueado. O criador recebe edição no empreendimento que criou. A tela mostra "Criar empreendimento" para esses usuários, de acordo com a API. Não é pendência.

### 4.3 Stakeholder (`papel = stakeholder`)
- Só visualização, nos empreendimentos vinculados.
- Não cria empreendimento.
- Vínculo nunca pode ser `edicao` (a API recusa); qualquer escrita devolve 403.

### 4.4 Sessão e autenticação
- Login por email e senha. Cookie `sessao`, `httpOnly`, `sameSite=lax`, validade de 7 dias, sem renovação.
- Sessão expirada ou ausente devolve 401; o front-end trata isso mostrando a tela de login com aviso.
- Limite de tentativas de login por minuto (padrão 20, configurável por variável de ambiente).
- Não há recuperação de senha por email: o admin redefine a senha manualmente.
- Não há edição de dados do usuário (nome, email, papel) depois de criado — só a senha.
- Não há 2FA.

Sessão e papel: a sessão é um registro no servidor (token → sessão → usuário) e o papel é lido do banco a cada requisição. Um admin rebaixado perde o poder na requisição seguinte, sem esperar o token expirar (coberto em teste).

### Visibilidade de botões de escrita por papel

A tela esconde o botão quando a API negaria a ação, e nunca cria regra de acesso própria: quem decide continua sendo a API.

- A API informa o nível de acesso em cada empreendimento (`nivelAcesso`: `admin`, `edicao` ou `leitura`), na lista e no detalhe.
- Escrita num empreendimento exige nível `edicao` ou `admin`. Exclusão exige `admin`, em qualquer empreendimento.
- Criar empreendimento é negado a `stakeholder`, qualquer que seja o vínculo.
- O componente `Button` aceita `requer="editar"`, `requer="excluir"` ou `requer="criarEmpreendimento"` e some quando o usuário não tem a permissão. Botões de leitura e navegação não recebem `requer`.
- Os `<button>` crus de escrita e o campo de upload do extrato são envolvidos por `PermitidoEditar` ou `PermitidoExcluir`.
- Criação de empreendimento: permitida ao papel `usuario` (stakeholder não cria), sem depender de vínculo. Verificado: o criador sem vínculo recebe `edicao` automaticamente no empreendimento, o vê na lista e consegue editá-lo; não vê empreendimentos criados por outros sem vínculo.

---

## 5. Limitações conhecidas, pendências e pontos de atenção

### 5.1 Funcionalidades parciais ou sem efeito

- **Taxa de desconto (TMA)**: configurável por cenário (padrão 0,5% a.m.).
- **Repetições de modalidade de mês fixo**: o motor suporta, a tela não expõe o campo.
- **`geraEventoParcial` de modalidade periódica**: o motor suporta, a tela não expõe (sempre `false`).
- **Campos do schema sem uso**: `Unidade.orientacao`, `Empreendimento.statusFase`, `Custo.vencimentoMes`, `CronogramaFisicoFinanceiro.previstoRealizado`.
- **`dataPrevistaConclusao`** do empreendimento não tem entrada pela API nem pela tela (só o importador grava).
- **Status de unidade `reservada`, `indisponivel` e `distratada`**: existem no schema e contam no resumo de estoque, mas **nenhum caminho do código as grava**. Um distrato devolve a unidade a `estoque`.
- **Tipo de distribuição `sobre_total`**: citado no comentário do schema, não existe no motor. Gravado por fora da API, quebraria o cálculo de recebimentos.
- **Comentário de `tipoIncidencia`** no schema lista valores antigos (`pct_vgv`, `pct_recebido`). Os valores reais são os seis listados em §1.6.
- **Realizado de custo fixo** é um único valor agregado, sem marcação mês a mês (o próprio código registra isso como limitação do modelo).
- **Realizado de custo percentual** é marcado parcela a parcela (tabela de desembolsos).
- **TIR** é calculada (mensal, a.m.) e aparece nos relatórios e no fluxo. **"Resultado"** = margem líquida = saldo final ÷ VGV (%, uma casa decimal). Sem VGV, aparece como não aplicável.

### 5.2 Limitações de regra de negócio

- **Correção monetária não entra nos indicadores** (VPL, necessidade de capital, mês de pico, saldo final). É uma visão paralela, e o relatório não a inclui.
- **Correção de custo** usa mês-base fixo no mês 1; a de recebimentos usa o mês da venda.
- **Financiamento**: a tabela SAC/Price é fixada no mês de amortização; liberações posteriores não geram parcela. Liberações e amortizações não são corrigidas.
- **Distrato** tira a venda do fluxo, mas o **reembolso devido não é lançado como saída**, e a retenção não entra como receita. O valor fica só no registro do distrato.
- **Renegociação** reduz o valor da venda (mesmo distrato parcial) sem lançar reembolso; o novo valor não pode ficar abaixo do já recebido.
- **Estoque compartilhado** entre cenários do mesmo empreendimento: gerar vendas reais em um cenário consome unidades que também valem para os outros. Vendas projetadas (§2.7b) não consomem estoque.
- **Premissa de velocidade: quantidade editável e linha excluível, mas mês e tipologia não são editáveis.** `PATCH /api/cenarios/:id/premissas-velocidade/:premissaId` altera só `unidadesPrevistas` (mesmas regras numéricas do cadastro); `DELETE` na mesma rota remove uma linha e exige perfil admin, como as demais exclusões. Na tela, cada linha tem Editar e Excluir (com confirmação). Linhas iguais na mesma tipologia e mês continuam sendo somadas e são registros separados. Para corrigir mês ou tipologia, exclui-se a linha e cria-se outra. O aviso de premissa acima do total reage a ambas as operações. Duplicar um cenário copia as premissas, então um erro de premissa também se propaga para a cópia.
- **Venda fora do horizonte**: uma venda com mês de origem depois do horizonte entra no VGV, mas seus recebimentos caem fora da projeção e somem silenciosamente do fluxo. A validação de mês só existe no cadastro manual; a geração automática não valida.
- **Permutas** não entram no motor financeiro além de remover a unidade do estoque; o valor atribuído é só registro.
- **Histórico de alertas** não existe, por decisão de produto registrada em `docs/DECISOES.md`.
- **Tipo de cenário** (base, otimista etc.) é só um rótulo.

### 5.3 Problemas técnicos conhecidos

- **Entradas numéricas**: a normalização (espaços, vírgula e faixa) foi aplicada a todas as entradas de percentual e valor que o motor lê. Não há mais risco conhecido de erro 500 por esse motivo.
  - cronograma (`percentualExecucaoMensal` é validado com `new Decimal(...)` e gravado como texto cru; um espaço ou vírgula quebra a criação com erro);
  - índices de correção (percentual gravado cru e lido com `Decimal` no motor — texto inválido derruba o fluxo de caixa);
  - percentuais de modalidade de condição de pagamento;
  - valores e taxa de financiamento;
  - percentuais de destinatário, faixa e contraparte;
  - unidades previstas de premissa de velocidade (convertidas com `Number`).
  Esta lista vem da leitura do código; não foi testada rota a rota.
- **Geração automática de vendas não é transacional**: um erro no meio deixa vendas já criadas e unidades já marcadas como vendidas.
- **Ordenação de unidades por texto** na geração automática: `AP-10` vem antes de `AP-2`, então as primeiras unidades vendidas podem não ser as de menor número.
- **Unidade sem preço vira venda de valor zero** na geração automática, sem aviso.
- **Premissa de velocidade fracionária** é arredondada silenciosamente (`Math.round`).
- **Condição de pagamento**: se a tipologia tiver mais de uma condição, a geração automática pega a primeira encontrada, sem critério definido.
- **Erros do motor** são devolvidos como erro 500 genérico, sem indicar o campo culpado.

- **Troca de cenário (corrigido nesta rodada)**: a carga inicial da lista sobrescrevia o cenário escolhido pelo usuário (efeito que roda duas vezes em desenvolvimento), e a resposta atrasada de um cenário anterior substituía a lista do atual. Corrigido em Vendas, Custos, Cronograma, Fluxo de caixa, Conciliação e Sensibilidade (`useCenarioAtivo` descarta respostas de outro cenário; a carga inicial só define o padrão se não houver escolha). Coberto por teste em Vendas; Custos, Cronograma e Fluxo usam o mesmo hook, sem teste próprio.
- **Mensagem de erro do Cadastro persiste** depois de uma ação bem-sucedida (observado na conferência; não corrigido).

### 5.4 Comentários e marcadores no código

- `TODO` / `FIXME`: nenhum relevante no código.
- Comentários de limitação registrados no código: custo fixo com realizado agregado (`api/src/app.ts`, rota de distribuição mensal de custo); cronograma de obra importado do Splendido com limitação registrada no relatório de conclusão (`src/import/splendido.data.ts`).
- Texto de `title` na barra lateral ("Ainda não implementado nesta fatia da Fase 1") é legado; hoje todos os itens são clicáveis.

### 5.5 Documentação desatualizada

- `docs/HANDOFF.md` descreve a Fase 0 e não deve ser usado como status atual.
- `docs/FASES.md` tem muitas seções "Não implementado nesta fatia" que já foram resolvidas depois (cadastro pela tela, permuta parcial, realizado × projetado, conciliação de extrato, controle de acesso por empreendimento). Use o código como referência.
- Comentários de tipos no `schema.prisma` estão defasados (ver §5.1).

### 5.6 Realizado × regeneração de parcelas (protegido)

Regra geral, válida para todos os chamadores: a regeneração de parcelas de custo percentual (`persistirDesembolsosCusto`) nunca apaga parcela paga. Se o mês perdeu a base (VGV vendido, recebido ou recebido do mês anterior), a parcela fica **sem base**: previsto zero, realizado e status mantidos. Ela aparece na tela de Custos (Distribuição) e em Realizado × Projetado com o rótulo "sem base — previsto removido" e com Estornar. Estornar uma parcela sem base remove a linha, no próprio estorno. Parcela obsoleta sem realizado continua sendo removida, como antes. Os indicadores oficiais (fluxo, VPL, TIR, necessidade de capital) usam o previsto e não mudam; o realizado é uma camada de conferência.

Caminhos de correção de erro são pré-checados por um auxiliar único (`parcelasPagasQuePerderiamBase`, em `src/db/servicoMotor.ts`), que simula a operação na entrada do motor sem gravar nada. Se a operação deixaria parcela paga sem base, é recusada com mensagem que lista custo, mês e valor pago e explica o contorno: estornar o pagamento, fazer a correção e marcar de novo.

| Caminho | Regra |
|---|---|
| Distrato (`POST /api/vendas/:id/distrato`) | **Permitido.** Parcela paga da base do mês fica sem base, preservada. Desfazer o distrato devolve o previsto à mesma linha. |
| Excluir venda (`DELETE /api/vendas/:id`) | **Bloqueado** se a venda é a única base de parcela paga. Recebimento marcado como recebido continua bloqueando, com mensagem própria. |
| Mudar o mês de origem (`PATCH /api/vendas/:id`) | **Bloqueado** se a mudança remove o mês de parcela paga. |
| Excluir linha de premissa (`DELETE .../premissas-velocidade/:id`) | **Bloqueado** se a linha é a única base de parcela paga. |
| Excluir custo (`DELETE /api/custos/:id`) | **Bloqueado** com parcela paga de custo percentual, ou com custo fixo que tem valor realizado registrado no próprio custo. |
| Editar custo (`PATCH /api/custos/:id`) | **Bloqueado só se o resultado removeria o mês de parcela paga.** Achado: nenhum campo editável hoje (valor, percentual, mês, recorrência) remove um mês; zerar o percentual mantém a linha com valor zero. A checagem existe como guarda para edições futuras. |
| Excluir cenário ou empreendimento (admin) | **Permitido.** A confirmação lista vendas, recebimentos recebidos, parcelas pagas e custos fixos com realizado (e o número de cenários, no empreendimento). Sem bloqueio. |
| Substituir o cronograma | Continua **bloqueado** se há parcela de obra paga (decisão mantida). Com a preservação acima, essa trava poderia ser relaxada no futuro. Não implementado. |
| Horizonte, preço de unidade, renegociação, registro ou geração de vendas, duplicar cenário, permuta | **Não removem mês**; não exigem trava. |

Divisão por zero: com previsto zero e realizado maior que zero, o desvio percentual aparece como "—" (não NaN nem Infinity) na tabela de Custos, na categoria de maior desvio, nos saldos e nos relatórios de PDF e Excel. Coberto por teste (`api.semBase`).

Testes: `api.semBase` (distrato com comissão paga, estorno da linha sem base, regressão dos números oficiais, divisão por zero) e `api.pagoProtegido` (um por caminho bloqueado, com mensagem e sem apagar nada, e o caminho sem parcela paga segue normal). O antigo `api.realizadoExposicao` documentava a perda e foi removido.

**Decisões registradas:**

1. A trava do cronograma com parcela de obra paga fica como está. A reconciliação do valor realizado fica no backlog.
2. Excluir a única venda de uma tipologia no cenário continua permitido ao admin, com aviso na confirmação: "A premissa de velocidade passará a valer para esta tipologia e o VGV do cenário deve mudar." O aviso não bloqueia.

**Nota de usabilidade:** o preço de unidade é editado dentro da seção "Permuta" de cada tipologia no Cadastro. Fica difícil de achar. Candidato a uma listagem de Unidades própria.

## 6. Matriz de CRUD

Legenda das células: **API e tela** = rota HTTP e controle na tela; **API** = só rota (sem controle na tela); **Tela** = só na tela; **não existe** = nem rota nem controle. Todas as rotas de exclusão exigem perfil admin, salvo indicação. Os controles de escrita aparecem só para os papéis que a API aceita (ver "Visibilidade de botões de escrita por papel" na seção 4).

| Entidade | Criar | Ler | Editar | Excluir | Travas e observações |
|---|---|---|---|---|---|
| Empreendimento | API e tela | API e tela | API e tela | API e tela | Exclusão em cascata: apaga cenários, vendas, custos, premissas e registros realizados. Criação permitida ao papel `usuario` e ao admin; stakeholder não cria. |
| Terreno (matrícula) | API e tela | API e tela | API e tela | API e tela | Vários por empreendimento. Sem trava conhecida. |
| Tipologia | API e tela | API e tela | API e tela | API e tela | Exclusão bloqueada com unidade vendida ou reservada, custo escopado à tipologia, ou venda ativa. |
| Unidade | API e tela (lote e cascata por andar) | API e tela | API e tela (**só preço de venda**, e só com status `estoque`; área e número ficam fixos) | **não existe** (só junto com a tipologia) | Vendida, reservada, permutada e indisponível bloqueiam a edição, com mensagem. A edição não altera vendas, projeções nem resultados existentes; vale só para vendas futuras. Controle na tela: linha de unidade na seção "Permuta" da tipologia. |
| Condição de pagamento | API e tela | API e tela | API e tela | API e tela | Edição bloqueada se a condição já foi usada em venda. Exclusão bloqueada pelo mesmo motivo. |
| Modalidade da condição | API e tela (dentro da condição) | API e tela | API e tela (reescreve a lista inteira da condição; mesma trava) | **não existe** isoladamente | Corrigir uma modalidade exige reescrever todas; a trava impede isso quando há venda. |
| Categoria de custo | API e tela | API e tela | API e tela | API e tela | Troca de incidência bloqueada se há custo com a categoria. Exclusão bloqueada com custo usando a categoria. |
| Custo | API e tela | API e tela | API e tela (bloqueada se remove o mês de parcela paga; ver §5.6) | API e tela (admin; bloqueada com parcela paga ou custo fixo com realizado; ver §5.6) | Parcela paga nunca some em silêncio: a regeneração preserva como "sem base". |
| Faixa de comissão | API e tela | API e tela | API e tela | API e tela | Edição de volume e percentual na tela, com as mensagens de validação da API. |
| Cenário | API e tela | API e tela | API e tela (nome, horizonte, taxa, limite, mês um) | API e tela (admin; confirmação lista vendas, recebimentos recebidos e parcelas pagas) | Exclusão apaga vendas, premissas e custos do cenário e devolve as unidades ao estoque. Duplicar copia premissas, custos, cronograma, índices, financiamento e TMA, mas não vendas. Tipo do cenário não é editável. |
| Premissa de velocidade | API e tela | API e tela | API e tela (só quantidade; mês e tipologia não editáveis) | API e tela (admin; bloqueada se a linha é a única base de parcela paga; ver §5.6) | Linhas iguais na mesma tipologia e mês são somadas e cada linha é um registro separado. Para corrigir mês ou tipologia, excluir a linha e criar outra. Ver §2.7b. |
| Cronograma | API e tela (uma vez; a API recusa se já existir) | API e tela (curva) | API e tela (**substituição atômica** de todos os meses, numa transação; soma exatamente 100%; respeita o horizonte; bloqueada se houver parcela de custo de obra paga) | API e tela (apaga todos os meses; admin) | Não existe edição de um mês isolado. Falha de validação não apaga nada. |
| Índice de correção | API e tela (upsert por grupo e mês) | API e tela | API e tela (mesmo `POST`, upsert) | API e tela (por mês e grupo; admin) | Sem trava conhecida. |
| Financiamento de produção | API e tela (upsert) | API e tela | API e tela (mesmo `POST`, upsert) | API e tela (admin) | Sem trava conhecida. |
| Venda | API e tela (manual e gerada por premissa) | API e tela | API e tela | API e tela (**admin**; só venda ativa, sem recebimento marcado como recebido e sem remover o mês de parcela de custo paga; a unidade volta ao estoque e os recebimentos previstos saem) | Venda distratada não é excluída (histórico financeiro). Se for a única venda da tipologia no cenário, a projeção por premissa passa a valer e o VGV muda (coberto em teste). |
| Permuta | API e tela | API e tela | API e tela | API e tela (desfazer; admin) | Só unidade em estoque pode receber permuta. |
| Contraparte de permuta | API e tela | API e tela | API e tela (nome e split, com mensagens da API) | API e tela (admin) | Soma dos splits não pode passar de 100%. |
| Distrato | API e tela | API e tela | **não existe** (refazer = desfazer e registrar de novo) | API e tela (desfazer; admin) | Renegociação de venda também só se registra, sem edição. |
| Usuário | API e tela | API e tela | API e tela (**admin**: nome e papel; e-mail não editável; não rebaixa o último admin; não torna stakeholder quem tem vínculo de edição) | API e tela (admin) | Senha tem rota própria (admin). Não há desativação de usuário no modelo. |
| Vínculo de acesso | API e tela | API e tela | API e tela (reenviar com novo papel) | API e tela | Papel por empreendimento: `edicao` ou `leitura`. Stakeholder só pode ter `leitura`. |

### Lacunas em que um erro só se corrige apagando algo maior

- **Premissa de velocidade, mês ou tipologia errados:** não editáveis; corrige-se excluindo a linha e criando outra. Quantidade já se corrige.
- **Preço, área ou número de unidade:** o preço é editável em unidade em estoque. Área e número continuam fixos na criação; só se corrige apagando a tipologia, o que é bloqueado depois de qualquer venda.
- **Modalidade de condição:** corrigir uma modalidade reescreve a condição inteira, e a trava impede isso depois de qualquer venda.
- **Cronograma:** corrigir um mês exige substituir o cronograma inteiro, o que é atômico e bloqueado se houver parcela de custo de obra paga.
- **Venda lançada por engano:** excluível pelo admin, desde que ativa e sem recebimento marcado como recebido. Venda distratada precisa de desfazer o distrato antes.
- **Distrato:** não se edita; desfazer e refazer.
- **Unidade:** não se exclui individualmente.
