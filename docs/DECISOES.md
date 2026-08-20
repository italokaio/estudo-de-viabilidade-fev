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
