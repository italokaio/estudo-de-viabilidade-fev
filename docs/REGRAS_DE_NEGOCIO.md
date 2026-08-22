# Regras de negócio universais

Extraídas da engenharia reversa da planilha do Splendido, mas **nenhuma delas cita um valor do Splendido** — são verdadeiras para qualquer empreendimento. Implementadas em `src/core/`.

| # | Regra | Implementação |
|---|---|---|
| R1 | Uma venda nunca é caixa integral no mês da venda — gera uma série de recebimentos futuros conforme sua condição de pagamento. | `motorRecebimentos.gerarRecebimentos()` |
| R2 | A soma dos percentuais das modalidades de uma condição de pagamento deve ser 100%. | `validadorCondicaoPagamento.ts`, chamado antes de gravar (`src/db/cadastro.ts`) |
| R3 | Uma modalidade nivelada distribui seu valor igualmente pelos meses restantes até o horizonte, recalculado por venda conforme o tempo restante no momento da venda. | `tipoDistribuicao = "nivelada"` |
| R4 | Uma modalidade periódica só gera evento se houver ao menos um ciclo completo restante, salvo `geraEventoParcial=true`. | `tipoDistribuicao = "periodica"` |
| R5 | Modalidades calculadas sobre o valor total (não por coorte) são computadas sobre o valor desta venda e lançadas em mês(es) fixo(s) do calendário — por distributividade, isso produz resultado idêntico a agregar primeiro e depois aplicar o percentual, sem precisar de uma etapa de agregação separada. | `tipoDistribuicao = "mes_fixo"` |
| R6 | A soma dos percentuais de execução mensal de um cronograma deve fechar em 100%. | `motorCustos.validarCronograma()` |
| R7 | Um encargo pode incidir sobre valor vendido no mês, valor recebido no mês anterior, ou acompanhar a curva de recebimento de cada parcela — a base é parametrizável por rubrica, nunca fixa no motor. | `CustoInput.tipoIncidencia` (5 estratégias, `motorCustos.gerarDesembolsosMensais()`) |
| R8 | O fluxo de caixa de um período é a soma de entradas menos saídas, apenas com os desembolsos já filtrados por `participaFluxoCaixa`. | `motorFinanceiro.executarMotorFinanceiro()` |
| R9 | O saldo acumulado de um período = saldo acumulado anterior + fluxo do período; a necessidade máxima de capital é o menor valor do acumulado no horizonte, e o pico é o mês em que ocorre. | `motorFluxoCaixa.calcularIndicadores()` |
| R10 | O mês de recuperação é o primeiro mês, após o pico, a partir do qual o acumulado permanece ≥ 0 até o fim do horizonte — não o primeiro cruzamento pontual. | `motorFluxoCaixa.calcularIndicadores()` |
| R11 | Um cenário é uma cópia isolada e completa das premissas; alterações em um cenário nunca propagam para outro. | Modelo de dados — todo dado de premissa carrega `cenarioId` |
| R12 | Toda entidade transacional pertence a exatamente um empreendimento e um cenário; a agregação de portfólio nunca altera os dados de origem. | `empreendimentoId` obrigatório em toda tabela transacional |
| R13 | Toda grandeza com valor previsto e valor realizado armazena os dois separadamente — o realizado nunca sobrescreve o previsto. | `Custo.valorRealizado`, `RecebimentoProjetado.valorRealizado` |
| R14 | O valor corrigido de um recebimento é o valor previsto multiplicado pelo fator acumulado de `(1 + variação do índice)` de cada mês entre o mês da venda (exclusive) e o mês de competência do recebimento (inclusive); sem índice cadastrado para um mês, a variação daquele mês é zero. | `motorCorrecao.calcularFatorCorrecao()`, `motorCorrecao.corrigirRecebimentos()` |
| R15 | A liberação de um financiamento de produção em um mês é o valor contratado multiplicado pelo percentual de execução do cronograma físico naquele mês; juros capitalizam sobre o saldo devedor antes de cada nova liberação; a amortização é o saldo devedor inteiro, pago de uma vez, no mês configurado. | `motorFinanciamento.calcularFinanciamento()` |

## As 4 estratégias de distribuição de uma modalidade de pagamento (`TipoDistribuicao`)

| Tipo | Quando usar | Regra |
|---|---|---|
| `unica_na_venda` | Entrada/sinal | 100% do valor da modalidade no mês da venda |
| `nivelada` | Parcelas mensais | Valor total ÷ meses restantes até o horizonte, um evento por mês |
| `periodica` | Intermediárias/reforços | Valor total ÷ ciclos completos restantes (R4); zero eventos se não houver ciclo completo, salvo configuração explícita |
| `mes_fixo` | Chaves, financiamento bancário | Lançado em um mês fixo do calendário (ou N meses consecutivos a partir dele), independente de quando a venda ocorreu |

## As 5 estratégias de incidência de um custo (`TipoIncidenciaCusto`)

| Tipo | Exemplo real (Splendido) | Regra |
|---|---|---|
| `fixo` | Terreno, legalização, publicidade | Valor absoluto, único ou recorrente mensal |
| `pct_vgv_vendido_no_mes` | Comissão de vendas (5%) | % sobre o total vendido naquele mês |
| `pct_recebido_no_mes` | Comissão paga na curva de recebimento (Fase 1, achado F25) | % sobre cada parcela recebida, no mesmo mês dela |
| `pct_recebido_mes_anterior` | Encargo tipo RET (4%) | % sobre o total recebido no mês anterior |
| `pct_execucao` | Obra | % do custo total, distribuído pela curva de cronograma físico |

Nenhuma dessas cinco funções sabe o nome "comissão" ou "RET" — esses são apenas nomes de `CategoriaCusto` que um empreendimento escolhe.
