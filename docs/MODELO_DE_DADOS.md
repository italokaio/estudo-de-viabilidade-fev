# Modelo de dados — Fase 0

Schema completo em [`prisma/schema.prisma`](../prisma/schema.prisma). 13 tabelas, todas genéricas — nenhuma coluna ou valor específico de um empreendimento. O que muda entre o Splendido e qualquer outro empreendimento são as **linhas**, nunca a tabela.

Convenção: todo valor monetário ou percentual é `String` (texto decimal), nunca `Float`. Ver `docs/ARQUITETURA.md`, princípio B.

| Tabela | Finalidade | Observação |
|---|---|---|
| `empreendimento` | Raiz de tudo | `incorporador` é um campo texto simples nesta fase (achado da revisão: multiempresa real não é necessária ainda — só multiempreendimento) |
| `cenario` | Base/otimista/pessimista/personalizado | `horizonteProjecaoMeses` é obrigatório e nunca hardcoded em nenhum outro lugar do sistema |
| `terreno` | 1:1 com empreendimento | `areaStatusValidacao` (`pendente`/`validado`/`conflitante`) + `areaObservacao` registram divergências de fonte em vez de escondê-las (ver Splendido: conflito SÍNTESE×LEGAL) |
| `tipologia` | Produto (ex.: "1 Quarto", "Loja") | Cadastro livre, sem lista fixa |
| `unidade` | Unidade física vendável | Fase 0: preço direto (`precoVenda`), sem tabela de posição por andar — ver achado F2 |
| `condicao_pagamento` | Agrupa modalidades | 0 ou 1 por tipologia (ou pode ser por empreendimento, se `tipologiaId` for nulo) |
| `modalidade_pagamento` | Uma fatia da condição (ex.: "Entrada") | `tipoDistribuicao` é o campo que generaliza o motor — ver `REGRAS_DE_NEGOCIO.md` |
| `premissa_velocidade_vendas` | Quantas unidades/mês/tipologia se espera vender | Consumida por `gerarVendasDePremissaVelocidade()` para criar `Venda` reais |
| `venda` | Uma unidade vendida em um mês | Gatilho do motor de recebimentos |
| `recebimento_projetado` | Saída do motor — um evento de caixa futuro | Sempre regenerável a partir de `venda` + `modalidade_pagamento`; nunca editado à mão |
| `categoria_custo` | Categoria + tipo de incidência | `empreendimentoId` nulo = categoria reutilizável entre empreendimentos |
| `custo` | Uma linha de custo/despesa | `participaFluxoCaixa` decide se entra no fluxo — é o mecanismo do achado F/4.3 |
| `cronograma_fisico_financeiro` | % de execução física por mês | Curva livre, sem formato pressuposto (não precisa ser "S") |

## O que foi deliberadamente deixado de fora da Fase 0

Ver `docs/DECISOES.md` para a justificativa de cada item — nenhum foi esquecido, todos foram avaliados e adiados conscientemente:

- `RegistroAreaTerreno` (auditoria de múltiplas origens de área) — Fase 0 usa `Terreno.areaObservacao` (texto) para o mesmo fim
- `Permutante` / `Permuta` / `ItemPermuta` — Fase 0 usa apenas `Unidade.status = 'permutada'`
- `TabelaPrecoPosicao` (preço por andar/orientação) — Fase 0 usa preço direto por unidade
- `MovimentoCaixa` — **removida como tabela**, é serviço computado (achado F1)
- `FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade`, `VersaoCenario`, `EstruturaComissao`, `Usuario`/`PapelAcesso`/`EmpreendimentoUsuario`, `IndiceCorrecao`, `Distrato` — todas fora do MVP definido, sem impacto no motor financeiro
