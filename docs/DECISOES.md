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

## F10 — Versão de cenário: duplicar nunca copia `Venda`, porque `Unidade.status` é global ao empreendimento (achado da Fase 1)

**Contexto.** `Cenario.derivadoDeCenarioId` existe no schema desde a Fase 0 (self-relation `derivadoDe`/`derivados`), e `docs/ARQUITETURA.md` (Princípio I) já descrevia como aspiração que "criar um cenário derivado copia dados para novas linhas" — mas nenhuma rota ou função jamais populou esse campo. `criarCenario` sempre criou um cenário vazio; a coluna existia sem nenhum código que a usasse.

**Decisão.** A pergunta central para implementar `duplicarCenario()` foi: o que copiar? A resposta óbvia — tudo — esbarra num fato arquitetural já usado (mas nunca documentado como achado até agora) pela cascata de `excluirCenario`: `Unidade.status` é um campo **global ao empreendimento**, compartilhado por todos os seus cenários, não um campo por cenário. Se `duplicarCenario` copiasse `Venda`, os dois cenários passariam a reivindicar simultaneamente a mesma unidade como "vendida" — e qualquer chamada subsequente a `excluirCenario`, `registrarDistrato`, `desfazerDistrato` ou `registrarPermuta` feita a partir de um dos cenários acabaria liberando ou travando a unidade incorretamente para o outro. A decisão foi excluir `Venda` (e por extensão `RecebimentoProjetado`/`Distrato`) da cópia — o cenário duplicado nasce sem vendas, livre para gerar as suas próprias a partir do estoque disponível no momento (`gerarVendasDePremissaVelocidade`, inalterado). Tudo o que é premissa/parâmetro puro é copiado normalmente: `PremissaVelocidadeVendas`, `Custo` (sem `valorRealizado`/`status` — o clone sempre começa "previsto"), `CronogramaFisicoFinanceiro`, `IndiceCorrecao` e `FinanciamentoProducao`.

**Bug latente encontrado e corrigido de forma proativa.** Como `derivadoDeCenarioId` nunca tinha sido populado antes desta fatia, ninguém tinha notado que `excluirCenario` não desfazia essa referência antes do `delete` — sem `onDelete` explícito no schema, o Prisma/SQLite usa RESTRICT por padrão, então excluir um cenário que tem duplicatas apontando para ele via `derivadoDeCenarioId` teria falhado por violação de chave estrangeira assim que a feature entrasse em uso real. Corrigido zerando `derivadoDeCenarioId` de todas as duplicatas antes do `delete` — elas continuam existindo normalmente, só perdem o vínculo histórico com o original.

**Status.** Aprovado e implementado (décima nona fatia). Testado em `tests/integration/api.versaoCenario.test.ts`, incluindo um teste de regressão dedicado para o bug do `derivadoDeCenarioId`.

## F11 — Estrutura de comissão nunca precisou de tabela nova: um escopo opcional por tipologia sobre o mecanismo genérico existente (achado da Fase 1)

**Contexto.** `EstruturaComissao` era o último item da lista original "fica para depois" da Fundação do ERP. Desde a Fase 0, comissão já era representável sem nenhuma tabela dedicada: uma categoria de custo com `tipoIncidencia="pct_vgv_vendido_no_mes"` já escala automaticamente com o total vendido em cada mês (`src/core/motorCustos.ts`), no mesmo espírito do comentário histórico do arquivo — "nenhuma das estratégias sabe o nome da rubrica que a usa". A lacuna real não era "comissão não existe", era mais específica: o percentual de comissão de um `Custo` é único para o cenário inteiro, sem forma de variar por produto (ex.: corretora cobra 8% em loja e 5% em apartamento — prática comum, não hipotética).

**Decisão.** Em vez de uma tabela `EstruturaComissao` nova, `Custo` ganhou um campo opcional `tipologiaId` (nullable, FK para `Tipologia`). Sem preenchê-lo, o comportamento é idêntico ao de sempre — incide sobre todas as vendas do cenário. Preenchido, `gerarDesembolsosMensais()` filtra `ctx.vendas` por `tipologiaId` antes de somar o VGV vendido no mês, isolando a base de cálculo daquele custo a uma única tipologia. Isso permite cadastrar múltiplos custos da mesma categoria "Comissão de vendas", um por tipologia, cada um com seu próprio percentual — sem introduzir nenhum conceito novo no motor, só um filtro a mais sobre `VendaInput.tipologiaId` (campo novo, adicionado por `unidade.tipologiaId` na montagem da entrada em `src/db/servicoMotor.ts`).

**Decisão de escopo — por que só `pct_vgv_vendido_no_mes`.** O escopo por tipologia só faz sentido semântico para incidência sobre VGV vendido — um custo `fixo` (valor absoluto) ou `pct_execucao` (curva de obra) não tem uma leitura natural de "incidir só sobre uma tipologia". A API rejeita (400) `tipologiaId` combinado com qualquer outra `tipoIncidencia`, em vez de aceitar e ignorar silenciosamente.

**Achado ao implementar.** `duplicarCenario` (achado F10) já copiava `Custo` linha a linha — precisou de um ajuste de uma linha (`tipologiaId: c.tipologiaId`) para não perder o escopo do custo original ao duplicar um cenário. Sem esse ajuste, o clone teria voltado silenciosamente ao comportamento "incide sobre tudo", uma regressão sutil coberta agora por teste dedicado.

**Status.** Aprovado e implementado (vigésima fatia). Testado em `tests/core/motorCustos.test.ts` (a estratégia de incidência isolada) e `tests/integration/api.estruturaComissao.test.ts` (efeito de ponta a ponta no fluxo de caixa, validação de escopo, exposição na API, preservação ao duplicar cenário).

## F12 — Correção monetária de custos usa um mês-base fixo por cenário, não um mês-base por linha (achado da Fase 1)

**Contexto.** A décima segunda fatia (achado F6) aplicou correção monetária só a `RecebimentoProjetado` — `Custo` ficou de fora, deliberadamente, como uma lacuna documentada. É uma lacuna real: um orçamento de obra de R$36 milhões, desembolsado ao longo de 36 meses sem nenhuma correção por INCC/CUB, subestima sistematicamente o capital necessário em qualquer cenário com inflação de insumos — exatamente o tipo de erro que a planilha original do Splendido já cometia (ver `docs/DIVERGENCIAS_PLANILHA.md`, achado D1).

**Decisão.** Reaproveitar inteiramente `calcularFatorCorrecao()` (já genérico: `mesInicio`, `mesFim`, `indices`) e a mesma série `IndiceCorrecao` já cadastrada por cenário — nenhuma tabela nova, nenhum índice separado para custos. A única decisão de design real foi **qual mês-base usar**. Para `RecebimentoProjetado`, o mês-base é o mês da *venda* que originou aquela parcela — cada venda tem o seu próprio, porque cada contrato é assinado (e precificado) em um mês diferente. Para `Custo` não existe um equivalente: um orçamento de obra é fixado **uma única vez**, no início do cronograma — não a cada linha de custo, e as incidências percentuais (`pct_execucao`, `pct_vgv_vendido_no_mes`, `pct_recebido_mes_anterior`) nem têm um "mês de origem" individual, só uma série de desembolsos mensais. A decisão foi usar um mês-base **fixo e único por cenário: o mês 1** — aplicado a todo `Custo`, de toda incidência, sem exceção. Sem nenhum índice cadastrado, o fator é sempre 1 e o comportamento é idêntico ao motor antes desta fatia (mesma garantia aditiva do achado F6).

**Decisão de implementação.** `corrigirDesembolsos()` (`src/core/motorCorrecao.ts`) é quase idêntica a `corrigirRecebimentos()`, só trocando "um `Map<vendaId, mesOrigem>`" por um `mesBase: number` único. `executarMotorFinanceiro()` soma o resultado em `saidasCorrigidas`, exposto em `GET /cenarios/:id/fluxo-caixa` e na tela ao lado de `entradasCorrigidas` — mesmo padrão aditivo, nunca substitui `fluxo`/`indicadores` nominais. Amortização de financiamento (achado F8) é somada a `saidasCorrigidas` **sem correção** — não é um custo orçado, é uma devolução de capital — mesmo tratamento que liberações de financiamento já recebiam em `entradasCorrigidas`.

**Status.** Aprovado e implementado (vigésima primeira fatia). Testado em `tests/core/motorCorrecao.test.ts` (`corrigirDesembolsos` isolado) e `tests/integration/api.correcaoMonetaria.test.ts` (efeito de ponta a ponta, confirmando que a correção de entradas e de saídas são independentes uma da outra, e que remover o índice reverte ambas).

## F13 — Split nominal de comissão: cadastro puro, sem restrição de tipo de incidência (achado da Fase 1)

**Contexto.** A vigésima fatia (achado F11, estrutura de comissão) deixou de fora deliberadamente "split nominal entre corretor/imobiliária/gerência". Diferente do escopo por tipologia (que muda o CÁLCULO da comissão), o split nominal não muda nenhum número — é só um registro de controle: quem recebe, e que fatia da comissão cabe a cada um.

**Decisão.** Nova tabela `DestinatarioComissao` (`custoId`, `nome`, `percentualSplit`), 1:N com `Custo` — mesmo espírito nominal de `Permuta`/`Distrato`: **nunca lido pelo motor** (nenhum arquivo em `src/core/` ou `src/db/servicoMotor.ts` sabe que esta tabela existe). Deliberadamente **não restrito** a `tipoIncidencia="pct_vgv_vendido_no_mes"` — ao contrário do escopo por tipologia (achado F11), split nominal é uma classificação de controle do usuário, não uma regra de cálculo; não há razão para o sistema impedir um destinatário nominal em um custo fixo (ex.: quem recebe uma taxa de corretagem lançada como valor fixo). Validação: a soma dos `percentualSplit` de um custo nunca pode ultrapassar 100% (com tolerância de 0,05% para arredondamento, mesmo padrão de `validarCronograma`), verificada tanto ao criar quanto ao editar um destinatário.

**Bug pré-existente encontrado e corrigido durante a verificação em navegador.** Ao testar o split num custo real do Splendido, a tabela de custos existentes simplesmente não aparecia na tela — nenhum erro no console, dado presente na API (`GET /api/cenarios/:id` retornava os 5 custos corretamente). Causa: `CustosSecao` (`web/src/pages/CadastroPage.tsx`) tinha um retorno antecipado — `if (categoriasDisponiveis.length === 0) return <div>Cadastre uma categoria...</div>` — que **também escondia a tabela de custos já cadastrados**, não só o formulário de "adicionar novo". Como as categorias de custo do Splendido são todas globais (`CategoriaCusto.empreendimentoId = null`, criadas assim pelo importador desde a Fase 0) e a relação `empreendimento.categoriasCusto` do Prisma só retorna categorias com FK preenchida, `categoriasDisponiveis` chega vazio para o Splendido — escondendo os 5 custos já cadastrados por trás de uma mensagem que sugeria que nenhum existia. Bug antigo (existia desde antes desta fatia), nunca notado porque nenhuma verificação anterior clicou em "Detalhes do cenário" do Splendido depois que a tela de custos ganhou essa forma. Corrigido: a tabela de custos existentes agora renderiza sempre que há custos, independente de `categoriasDisponiveis` — só o formulário de "adicionar novo" fica condicionado a existir ao menos uma categoria selecionável.

**Bug latente corrigido proativamente (mesmo padrão dos achados F10/F11).** `excluirCusto` não removia `DestinatarioComissao` antes do `delete` — excluir um custo com destinatários cadastrados falharia por violação de chave estrangeira. `duplicarCenario` também precisou passar a copiar `Custo` individualmente (em vez de `createMany`) para poder mapear cada `DestinatarioComissao` ao id do custo novo.

**Status.** Aprovado e implementado (vigésima segunda fatia). Testado em `tests/integration/api.destinatariosComissao.test.ts` (cadastro, validação de limite de 100%, edição, exclusão, exclusão em cascata do custo, preservação ao duplicar cenário). O bug de visibilidade da tabela de custos não tem teste automatizado (projeto não tem suíte de componentes web) — encontrado e verificado via navegador real.

## F14 — Segurança de sessão: redefinição de senha assistida por admin, e um evento global para sessão expirada (achado da Fase 1)

**Contexto.** Duas lacunas deixadas em aberto desde a nona fatia (autenticação): "recuperação de senha" e "sessão expirada mostrada como erro genérico em vez de redirecionar para o login". As duas têm a mesma raiz — a UI nunca soube diferenciar "esta chamada específica falhou" de "eu não estou mais autenticado".

**Decisão 1 — recuperação de senha sem infraestrutura de email.** Este projeto não tem (e não tinha) nenhuma capacidade de enviar email — um fluxo de recuperação autoatendido por link enviado ao usuário exigiria inventar essa infraestrutura do zero, fora do escopo pedido. A alternativa honesta e imediatamente utilizável: **redefinição assistida por admin** — mesmo padrão já usado para criar/excluir usuário (`UsuariosPage` é admin-only desde a nona fatia). `PATCH /api/usuarios/:id/senha`, admin-only, define a senha diretamente; o admin comunica a nova senha ao usuário por fora do sistema (o mesmo "por fora" que já vale para a senha inicial, definida na criação do usuário). Redefinir a senha **sempre encerra todas as sessões ativas** daquele usuário — sem isso, um token já comprometido continuaria válido pelos 7 dias restantes mesmo depois da senha trocada.

**Decisão 2 — sessão expirada como evento global, não erro local.** Antes desta fatia, cada chamada de API tratava um 401 como só mais um erro daquela chamada específica — resultado: um usuário cuja sessão expirou via `fetchFluxoCaixa()` via um banner vermelho dizendo "Não foi possível carregar os dados: Não autenticado", sem nenhuma indicação de que precisava logar de novo. A correção: toda chamada de API passa por um único ponto (`apiFetch`, `web/src/api/client.ts`), que reconhece um 401 (fora das duas exceções esperadas — `/api/auth/me` na verificação inicial e `/api/auth/login` com credenciais erradas) e dispara um evento global (`EVENTO_SESSAO_EXPIRADA`). `App.tsx` escuta esse evento, reseta o usuário logado (o que já troca a tela para `LoginPage`, sem nenhuma rota nova) e passa um aviso — "Sua sessão expirou. Entre novamente para continuar." — em vez de deixar a última tela visível com um erro sem contexto.

**Status.** Aprovado e implementado (vigésima terceira fatia). Testado em `tests/integration/api.auth.test.ts` (redefinição funciona, senha antiga para de logar, redefinir encerra sessões ativas, 403 para usuário comum, validações de tamanho/existência). O evento global de sessão expirada não tem teste automatizado (sem suíte de componentes web) — verificado em navegador real, nos dois temas, reaproveitando `redefinirSenha` para invalidar a própria sessão em uso e confirmar que a próxima chamada pela UI redireciona corretamente ao login com o aviso.

## F15 — Limite de alerta configurável por cenário, não por linha de negócio (achado da Fase 1)

**Contexto.** `calcularAlertas()` (achado F9, décima oitava fatia) já recebia `limiteNecessidadeMaximaSobreVgv` como parâmetro opcional desde que foi escrito — o motor sempre foi flexível. A lacuna documentada era só a falta de um caminho, pela API/tela, para de fato configurar esse valor por cenário; o padrão de 30% ficava hardcoded em todo lugar que chamava a função.

**Decisão.** Novo campo `Cenario.limiteNecessidadeMaximaCapital` (nullable) — nulo continua significando "usa o padrão do motor" (30%, `LIMITE_NECESSIDADE_MAXIMA_SOBRE_VGV_PADRAO`), preenchido substitui esse valor só para o alerta `necessidade_maxima_alta` daquele cenário. Deliberadamente um campo por cenário, não um parâmetro global do sistema nem por empreendimento: cenários diferentes do mesmo empreendimento (base/otimista/pessimista) legitimamente toleram riscos diferentes — um cenário pessimista propositalmente mais alavancado não deveria disparar o mesmo alerta que um cenário base conservador dispararia no mesmo número.

**Decisão de escopo — histórico de alertas não implementado.** A outra lacuna documentada junto com esta ("manter um histórico de alertas ao longo do tempo") foi deliberadamente deixada de fora: alertas são recalculados a cada `GET /fluxo-caixa`, nunca persistidos (mesmo princípio do achado F1 para `MovimentoCaixa` e do achado F9 para os próprios alertas). Persistir um histórico exigiria decidir *quando* tirar cada "foto" (a cada view? um snapshot diário?) — uma decisão de produto em aberto, não uma lacuna técnica simples de fechar dentro desta fatia.

**Status.** Aprovado e implementado (vigésima quarta fatia). Testado em `tests/integration/api.alertas.test.ts` (limite customizado suprime/antecipa o alerta em relação ao padrão, `null` explícito restaura os 30%, validação de valor negativo/inválido, preservação ao duplicar cenário).

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
