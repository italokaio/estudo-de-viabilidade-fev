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
