# Decisões de modelagem — Fase 0

## F1 — `MovimentoCaixa` não é uma tabela persistida

**Contexto.** A especificação da Fase "ERP Multiempreendimento" havia desenhado `MovimentoCaixa` como tabela, alimentada a partir de `Custo` e `RecebimentoProjetado`.

**Problema encontrado.** Isso reintroduz exatamente a classe de bug encontrada entre as abas `PERMUTA` e `SÍNTESE` da planilha original: duas tabelas guardando o mesmo fato, sem garantia estrutural de sincronia.

**Decisão.** O fluxo de caixa é sempre computado (`consolidarFluxoCaixa()`), nunca armazenado. Confirmado em produção: `rodarMotorParaCenario()` (`src/db/servicoMotor.ts`) persiste apenas `RecebimentoProjetado`; o fluxo em si nunca toca o banco.

**Status.** Aprovado e implementado.

## F2 — Preço direto por unidade, sem cascata por andar

**Decisão.** `Unidade.precoVenda` é um valor direto na Fase 0/MVP. A cascata de preço por andar/orientação (fiel à planilha original) fica para depois, como uma segunda estratégia de precificação plugável — sem exigir alteração de schema quando for implementada.

**Status.** Aprovado e implementado. Splendido foi importado com preço médio por tipologia (não por unidade individual), consistente com a decisão.

## F3 — Permuta modelada apenas como status de unidade

**Decisão.** `Unidade.status = 'permutada'` é suficiente para excluir a unidade do estoque disponível e do VGV de venda — que é tudo que o motor financeiro precisa saber. O cadastro nominal completo (quem recebeu o quê) fica para depois.

**Status.** Aprovado. Não exercitado na Fase 0 porque nenhuma unidade do cenário de teste do Splendido foi marcada como permutada (a simulação usa apenas as unidades efetivamente vendidas via velocidade de vendas — ver limitação abaixo).

## F4 — `RecebimentoProjetado` precisa de identidade estável entre recálculos (achado da Fase 1)

**Contexto.** F1 estabeleceu que o fluxo de caixa é sempre recomputado, e que `rodarMotorParaCenario()` persiste `RecebimentoProjetado` como efeito colateral desse recálculo. Até a sétima fatia da Fase 1, isso era implementado como delete-all-recreate-all a cada chamada.

**Problema encontrado.** Ao implementar "fluxo de realizado × projetado" (registrar `valorRealizado`/`status` numa parcela), o delete-all-recreate-all criava dois problemas: (1) apagava o `valorRealizado` já registrado, porque a linha recriada nunca soube que existia um valor real gravado nela; (2) trocava o `id` da linha a cada recálculo, então uma tela que buscou a lista de recebimentos antes de um recálculo (ex.: ao trocar de cenário, que dispara `GET /fluxo-caixa`) ficava com um id que já não existia mais no banco — a ação "marcar como recebido" falhava com 404 mesmo com o usuário fazendo tudo certo.

**Decisão.** `RecebimentoProjetado` ganhou `@@unique([vendaId, modalidadeId, mesCompetencia])` — chave que o motor já garante única por construção (nenhuma estratégia de distribuição em `src/core/motorRecebimentos.ts` gera duas parcelas da mesma modalidade, da mesma venda, no mesmo mês). `persistirRecebimentos()` (`src/db/servicoMotor.ts`) passou a fazer diff contra o que já existe: cria em lote as parcelas novas, apaga em lote as obsoletas, e só atualiza (preservando id/`valorRealizado`/`status`) as que mudaram de valor previsto. A primeira correção usou `upsert()` por linha, que é correto mas lento demais (estourou timeout de 30s nos testes do Splendido, ~1000 round-trips); a versão final opera em lote sempre que possível.

**Status.** Aprovado e implementado. Testado explicitamente em `tests/integration/api.realizadoXProjetado.test.ts` (o id de um recebimento não muda entre dois recálculos consecutivos).

## F5 — Permissão por empreendimento como segundo eixo, não uma matriz RBAC (achado da Fase 1)

**Contexto.** A nona fatia da Fase 1 implementou dois papéis (`admin`/`usuario`), mas deixou explicitamente pendente: "sem controle por empreendimento nesta fase — todo usuário autenticado vê todos os empreendimentos". Isso é aceitável para uma equipe pequena, mas não escala para uma incorporadora com múltiplos empreendimentos geridos por equipes diferentes, onde um usuário de um empreendimento não deveria nem saber que outro existe.

**Decisão.** Em vez de uma matriz RBAC completa (permissão por ação × por recurso × por empreendimento), o controle por empreendimento entra como um segundo eixo independente do papel: uma tabela de junção simples `EmpreendimentoUsuario` (`usuarioId` × `empreendimentoId`) que só responde "este usuário enxerga este empreendimento?" — nunca "o que ele pode fazer nele". `admin` continua tendo acesso total e incondicional, sem nunca consultar o vínculo; `usuario` só enxerga os empreendimentos vinculados, mas mantém as mesmas permissões de ação (visualizar/cadastrar, não excluir) dentro deles. Acesso negado devolve 404 em vez de 403, para não revelar a existência de um empreendimento que o usuário não deveria nem saber que existe.

**Status.** Aprovado e implementado (décima primeira fatia). Testado em `tests/integration/api.permissaoPorEmpreendimento.test.ts`.

## F6 — Correção monetária como camada computada sobre recebimentos, nunca persistida (achado da Fase 1)

**Contexto.** O motor financeiro nunca teve nenhum tratamento de inflação — todo valor previsto (`RecebimentoProjetado.valorPrevisto`, `Custo.valorPrevisto`) é nominal, no valor do mês em que o motor o calcula. Isso é uma lacuna real de viabilidade imobiliária: a planilha original do Splendido já lidava com correção por índice (INCC durante a obra, IGP-M/IPCA depois), e qualquer análise de longo prazo sem correção subestima sistematicamente o capital necessário.

**Decisão.** Correção monetária aplicada só sobre `RecebimentoProjetado` nesta fatia (não sobre `Custo` — mesmo padrão poderia ser estendido depois, fora de escopo agora). Uma série de índice (`IndiceCorrecao`: mês × variação percentual, cadastrada por cenário) é usada para corrigir cada parcela pelo fator acumulado entre o mês da venda que a originou e o mês de competência da parcela (`src/core/motorCorrecao.ts`). Igual ao achado F1 (fluxo de caixa nunca é uma tabela), o valor corrigido nunca é persistido — é recomputado a cada `GET /fluxo-caixa`, a partir da série de índice e dos recebimentos já calculados pelo motor. Sem nenhum índice cadastrado, o fator é sempre 1 e o comportamento é idêntico ao motor antes desta fatia — mudança inteiramente aditiva (`fluxo`/`indicadores` nominais não mudam; só um campo novo, `entradasCorrigidas`, é adicionado à saída).

**Status.** Aprovado e implementado (décima segunda fatia). Testado em `tests/core/motorCorrecao.test.ts` e `tests/integration/api.correcaoMonetaria.test.ts`.

## F7 — Distrato: o motor já estava pronto, só faltava a ação de cadastro (achado da Fase 1)

**Contexto.** `Venda.status: "ativa" | "distratada"` existe desde a Fase 0 (schema original), e `rodarMotorParaCenario()` (`src/db/servicoMotor.ts`) sempre filtrou vendas por `status: "ativa"` ao montar a entrada do motor. Nenhuma dessas duas coisas foi alterada para implementar distrato — o motor já sabia, desde sempre, ignorar uma venda distratada.

**Achado confirmado ao implementar.** Como `persistirRecebimentos()` (achado F4) já faz diff entre o que o motor calculou agora e o que existe no banco, marcar uma `Venda` como `"distratada"` é suficiente por si só: no próximo `GET /fluxo-caixa`, essa venda simplesmente não aparece mais no resultado do motor, e os `RecebimentoProjetado` que ela tinha gerado são identificados como obsoletos e apagados automaticamente — sem nenhuma linha de código nova em `src/core/`.

**Decisão.** A parte que realmente faltava era o cadastro nominal do que aconteceu: quanto já tinha sido recebido, quanto a incorporadora retém, quanto precisa devolver. Isso vira uma tabela `Distrato` (registro histórico, nunca lido pelo motor — mesmo padrão do achado F3, `Permuta`), calculada sobre o valor **efetivamente recebido** (`RecebimentoProjetado.valorRealizado`), nunca sobre o previsto.

**Status.** Aprovado e implementado (décima terceira fatia). Testado em `tests/integration/api.distrato.test.ts`.

## F8 — Financiamento de produção muda o fluxo de caixa de verdade, ao contrário de correção monetária e sensibilidade (achado da Fase 1)

**Contexto.** Correção monetária (F6) e simulação de sensibilidade são camadas de leitura por cima do motor: recomputam ou perturbam a entrada, mas o `fluxo`/`indicadores` "oficiais" de um cenário nunca mudam por causa delas. Financiamento de produção é estruturalmente diferente — um empréstimo bancário de obra reduz de verdade o capital próprio necessário durante a construção, então precisa entrar na consolidação real (`consolidarFluxoCaixa()`), não ficar ao lado dela.

**Decisão.** Liberações seguem a mesma curva do cronograma físico-financeiro já usada por custos `pct_execucao` — o banco libera capital conforme a obra avança, nunca de uma vez. Juros capitalizam mês a mês sobre o saldo devedor (nunca pagos à parte durante a obra, prática comum em financiamento de produção). A amortização é um único pagamento do saldo devedor inteiro, no mês configurado — o caso mais comum na prática (repasse bancário na entrega das unidades), sem modelar uma tabela de parcelas.

**Decisão de implementação.** Em vez de mudar a assinatura de `consolidarFluxoCaixa()` (arriscando os testes existentes de fluxo/custos/recebimentos), `executarMotorFinanceiro()` (`src/core/motorFinanceiro.ts`) converte as liberações/amortizações de `calcularFinanciamento()` em objetos com a mesma forma de `RecebimentoGerado`/`DesembolsoMensal` (`vendaId`/`custoId` = `"financiamento"`, nunca lidos pela consolidação — só `mes`/`valor` importam) e os concatena antes de chamar `consolidarFluxoCaixa()`. Esses objetos sintéticos nunca voltam no campo `recebimentos` retornado — `persistirRecebimentos()` só grava linhas de `Venda` real, então não há risco de uma FK inválida.

**Achado ao testar.** Um financiamento só reduz a necessidade máxima de capital **durante a construção**, quando ainda não há receita de venda para pagá-lo de volta — se a amortização cai dentro do horizonte sem nenhuma venda cobrindo o valor, o empréstimo só desloca o pico de necessidade de capital do início (obra) para o mês da amortização (capital próprio paga o banco de volta), sem reduzir o total. Isso não é um bug: reflete a mecânica real de "repasse bancário" — o financiamento só compensa de verdade quando há receita de venda depois, para quitar o saldo devedor.

**Status.** Aprovado e implementado (décima sétima fatia). Testado em `tests/core/motorFinanciamento.test.ts`, `tests/core/motorFinanceiro.financiamento.test.ts` e `tests/integration/api.financiamento.test.ts`.

## F9 — Alerta de risco reaproveita achados anteriores em vez de inventar regras novas (achado da Fase 1)

**Contexto.** Depois de correção monetária (F6), distrato (F7) e financiamento de produção (F8), o motor já calcula ou expõe quase tudo que um alerta de risco precisaria interpretar — a lacuna nunca foi "o dado não existe", sempre foi "ninguém olhou para o dado e disse que aquilo é um problema".

**Decisão.** Das quatro regras implementadas, duas vêm diretamente de comportamento já documentado como achado em fatias anteriores, agora só tornado visível: "custo `pct_execucao` sem cronograma gera zero desembolso, silenciosamente" (regra R7/R6, sempre foi assim, nunca alertado) e "financiamento só reduz necessidade de capital quando há receita depois" (achado F8, descoberto ao testar financiamento, agora virou regra formal de alerta). As outras duas (necessidade máxima acima de X% do VGV, sem recuperação dentro do horizonte) são limiares de bom senso sobre indicadores que já existem desde a Fase 0 (`calcularIndicadores()`).

**Decisão de implementação.** `calcularAlertas()` (`src/core/motorAlertas.ts`) recebe as peças já computadas (vendas, custos, cronograma, recebimentos, indicadores, financiamento) em vez de `EntradaMotorFinanceiro`/`SaidaMotorFinanceiro` inteiros — evita um import circular, já que `motorFinanceiro.ts` precisa chamar `calcularAlertas()` para montar `SaidaMotorFinanceiro.alertas`, e `motorAlertas.ts` não pode importar de volta o arquivo que a importa.

**Status.** Aprovado e implementado (décima oitava fatia). Testado em `tests/core/motorAlertas.test.ts` e `tests/integration/api.alertas.test.ts`.

## Simplificações adicionais decididas durante a implementação da Fase 0

| Item | Decisão | Motivo |
|---|---|---|
| `Empresa` | Consolidada em `Empreendimento.incorporador` (texto) | Multiempresa real não é um requisito desta fase — só multiempreendimento |
| `CategoriaCusto` | Sem hierarquia categoria/subcategoria | Lista plana é suficiente para o MVP; hierarquia pode ser adicionada depois sem quebrar dados existentes |
| Estoque de unidades do Splendido | Apenas as unidades efetivamente vendidas na curva de velocidade (409) + 8 lojas nunca vendidas, não as ~535 unidades do edifício completo | O motor financeiro só precisa das unidades que geram venda/receita; replicar o estoque completo não muda nenhum golden number e teria sido trabalho sem valor de verificação nesta fase — **registrado aqui como limitação, não escondido** |
| Intermediárias — periodicidade | Fixada em 9 meses (= 36 meses de obra ÷ 4 intermediárias contratadas) para o Splendido, como premissa explícita por condição de pagamento | A planilha original não usa uma fórmula recalculada por coorte para isso — usa uma tabela de divisores digitados à mão (G2/M2/S2/Y2 em `REC PROJETADA`) que muda por faixa de coluna. Ver `DIVERGENCIAS_PLANILHA.md`, divergência tipo B |

## Execução dos testes de integração em sequência, não em paralelo

**Problema encontrado durante a Fase 0 (não estava previsto na especificação).** O Vitest roda arquivos de teste em paralelo por padrão; como os três arquivos de teste de integração compartilham o mesmo arquivo SQLite, um arquivo apagava dados que outro estava inserindo no mesmo instante, causando erros de chave estrangeira e timeouts intermitentes.

**Decisão.** `vitest.config.ts` define `fileParallelism: false`. Aceitável na Fase 0 (poucos arquivos, suíte roda em ~25s); se a suíte crescer muito, a solução correta é um banco de teste isolado por arquivo, não reintroduzir paralelismo sobre um banco compartilhado.
