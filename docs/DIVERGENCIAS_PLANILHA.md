# Divergências entre o motor do ERP e a planilha original

Toda diferença encontrada entre o resultado do motor genérico e os números da planilha `VIABILIDADE.xlsx` foi investigada antes de decidir o que fazer — nunca ajustada apenas para "bater o número" (conforme item 6/7 da aprovação da Fase 0).

## Conflitos já registrados na Fase 1/2 (não resolvidos automaticamente)

Ver o documento [Especificação Splendido](https://claude.ai/code/artifact/bb949561-5224-4633-b3c5-d9c31b39bbb1), seção "Conflitos & pontos em aberto", e [Fundação do ERP](https://claude.ai/code/artifact/cf66a27e-85fc-4b7b-85da-6f57381901a8), seção 3 e 5, para o detalhamento de C1–C6 e F1–F3. Resumo do que foi implementado na Fase 0:

- **C1 (área do terreno 5.000×3.000 m²)** — `Terreno.areaValor` fica `null`, `areaStatusValidacao='conflitante'`, com a divergência descrita em `areaObservacao`. Não escolhido arbitrariamente.
- **C2 (referência quebrada CRONOGRAMA→ANALISE!E31)** — o motor nunca usa referência de célula; `custoObraTotal` é um campo nomeado, carregado com o valor validado (R$ 36.665.600 = 22.916 m² × R$1.600/m², que é o cálculo real de `ANALISE!E33`).
- **C3 (custos fora do fluxo original)** — implementado via `Custo.participaFluxoCaixa`. Splendido é importado com esse flag `false` para terreno/legalização/publicidade (modo replicação, usado na validação) e o teste `modo completo` (`splendido.goldenNumbers.test.ts`) prova que ligar o flag aumenta a necessidade de capital exatamente pela soma dos custos extras (R$ 667.883,97).

## D1 — a planilha original perde ~0,94% do VGV vendido em seu próprio motor de coortes

**Como foi encontrado.** O motor do ERP conserva 100% do valor de cada venda entre as modalidades de recebimento (testado explicitamente: `diferencaConservacao < 1` em `splendido.goldenNumbers.test.ts`). Comparando o total recebido calculado pelo motor (R$ 61.158.302,10) com o total recebido da própria planilha (`EVOLUÇÃO REC!B43` = R$ 60.581.188,75), há uma diferença de R$ 577.113,35 (0,944%).

**Investigação.** O total vendido implícito pela própria fórmula de comissão da planilha (`VELOCIDADE!G46` ÷ 5% = R$ 61.158.302,00) bate, até o centavo, com o total que o motor do ERP calcula de forma independente (R$ 61.158.302,10). Ou seja: **a planilha original não é internamente consistente** — sua própria aba de comissão implica um VGV vendido diferente do que sua aba de recebimentos (`REC PROJETADA` → `EVOLUÇÃO REC`) efetivamente soma.

**Causa mais provável.** A tabela de divisores manuais de intermediária (`G2`/`M2`/`S2`/`Y2` em `REC PROJETADA`, valores 4/3/2/1 digitados por faixa de coluna, não recalculados por fórmula) não cobre todas as coortes com precisão — para algumas delas, o número de intermediárias efetivamente pago pode ficar levemente aquém do que os 5%/10% contratados definem. Não foi possível confirmar célula a célula sem uma segunda fonte externa (fora do escopo desta fase), mas a hipótese é consistente com a estrutura da fórmula (ver Fase 1, aba `REC PROJETADA`).

**Decisão (regra do item 7 da aprovação: "se a planilha estiver errada, não reproduza automaticamente o erro").** O motor do ERP implementa a regra correta (R4 — periodicidade explícita, sempre conservando o valor total de cada venda) e **não** replica a perda de valor da planilha. O teste `splendido.goldenNumbers.test.ts` afirma explicitamente que o motor sempre recebe **mais ou igual** ao total da planilha, nunca menos — provando que a diferença é uma correção, não uma perda de dados.

**Efeito propagado.** Como o motor recebe ~0,94% a mais de caixa ao longo do projeto, os indicadores de fluxo divergem na mesma ordem de grandeza:

| Indicador | Motor do ERP | Planilha original | Diferença |
|---|---|---|---|
| Total recebido | R$ 61.158.302,10 | R$ 60.581.188,75 | +0,94% |
| Necessidade máxima de capital | R$ 22.178.011,63 | R$ 20.262.826,63 | +9,45% |
| **Mês do pico de necessidade** | **30** | **30** | **exato** |
| **Mês de recuperação** | **38** | **38** | **exato** |
| Saldo final | R$ 19.009.557,73 | R$ 18.434.426,10 | +3,12% |
| VPL (0,5% a.m.) | R$ 14.152.789,47 | R$ 13.859.471,94 | +2,12% |
| RET total | R$ 2.425.229,26 | R$ 2.423.247,55 | +0,08% |

Os dois indicadores mais usados para decisão — **mês do pico** e **mês de recuperação** — batem exatamente. A necessidade máxima de capital diverge mais (9,45%) porque é o ponto mais sensível a *quando* exatamente a diferença de R$577 mil chega, não apenas *quanto*.

## Divergência tipo B — periodicidade das intermediárias

A planilha original não usa uma fórmula recalculada por coorte para decidir quantas parcelas intermediárias uma venda recebe — usa uma tabela de constantes digitadas (`G2=4`, `M2=3`, `S2=2`, `Y2=1`) associada a faixas de colunas, sem lógica documentada de como esses valores foram escolhidos. O motor do ERP usa, em vez disso, a regra universal R4 (`docs/REGRAS_DE_NEGOCIO.md`) com periodicidade explícita de 9 meses (= 36 meses de obra ÷ 4 intermediárias contratadas), uma premissa nomeada e auditável.

**Classificação:** metodologia da planilha substituída por regra correta, não reproduzida — consistente com a distinção pedida no item 7 da aprovação entre "reproduzir a metodologia" (quando correta) e "reproduzir um erro" (quando não é uma fórmula de negócio, é uma aproximação manual).

## Limitação registrada (não é uma divergência de cálculo)

O Splendido foi importado na Fase 0 apenas com as unidades efetivamente vendidas na curva de velocidade (409 unidades) mais 8 lojas nunca vendidas — não com o estoque completo do edifício (~535 unidades reportado na Fase 1). Isso não afeta nenhum golden number (o motor só soma o que é vendido), mas significa que uma futura tela de "estoque disponível" para o Splendido, se construída hoje, mostraria menos unidades em estoque do que a planilha original tinha. Ver `docs/DECISOES.md`.
