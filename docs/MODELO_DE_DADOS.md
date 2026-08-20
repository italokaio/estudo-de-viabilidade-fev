# Modelo de dados — Fase 0

Schema completo em [`prisma/schema.prisma`](../prisma/schema.prisma). 17 tabelas (13 da Fase 0 + `permuta`, `usuario`, `sessao` e `empreendimento_usuario`, adicionadas na Fase 1), todas genéricas — nenhuma coluna ou valor específico de um empreendimento. O que muda entre o Splendido e qualquer outro empreendimento são as **linhas**, nunca a tabela.

Convenção: todo valor monetário ou percentual é `String` (texto decimal), nunca `Float`. Ver `docs/ARQUITETURA.md`, princípio B.

| Tabela | Finalidade | Observação |
|---|---|---|
| `empreendimento` | Raiz de tudo | `incorporador` é um campo texto simples nesta fase (achado da revisão: multiempresa real não é necessária ainda — só multiempreendimento) |
| `cenario` | Base/otimista/pessimista/personalizado | `horizonteProjecaoMeses` é obrigatório e nunca hardcoded em nenhum outro lugar do sistema |
| `terreno` | 1:1 com empreendimento | `areaStatusValidacao` (`pendente`/`validado`/`conflitante`) + `areaObservacao` registram divergências de fonte em vez de escondê-las (ver Splendido: conflito SÍNTESE×LEGAL) |
| `tipologia` | Produto (ex.: "1 Quarto", "Loja") | Cadastro livre, sem lista fixa |
| `unidade` | Unidade física vendável | `precoVenda` é um valor direto na linha — sempre foi assim, inclusive quando calculado por cascata de andar (Fase 1, achado F2): a estratégia de precificação decide o número no momento da criação, o schema nunca soube que existia mais de uma estratégia |
| `permuta` | Cadastro nominal de quem recebeu uma unidade permutada | 1:1 com `unidade` (achado F3/F4); nunca lida pelo motor — `Unidade.status='permutada'` já é suficiente para excluir a unidade do VGV |
| `condicao_pagamento` | Agrupa modalidades | 0 ou 1 por tipologia (ou pode ser por empreendimento, se `tipologiaId` for nulo) |
| `modalidade_pagamento` | Uma fatia da condição (ex.: "Entrada") | `tipoDistribuicao` é o campo que generaliza o motor — ver `REGRAS_DE_NEGOCIO.md` |
| `premissa_velocidade_vendas` | Quantas unidades/mês/tipologia se espera vender | Consumida por `gerarVendasDePremissaVelocidade()` para criar `Venda` reais |
| `venda` | Uma unidade vendida em um mês | Gatilho do motor de recebimentos |
| `recebimento_projetado` | Saída do motor — um evento de caixa futuro | O campo `valorPrevisto` é sempre regenerado a partir de `venda` + `modalidade_pagamento`; `valorRealizado`/`status` são dado real registrado pelo usuário (Fase 1) e preservados entre recálculos — chave `(vendaId, modalidadeId, mesCompetencia)` única garante que o `id` da linha não muda a cada recálculo (achado F4, `docs/DECISOES.md`) |
| `categoria_custo` | Categoria + tipo de incidência | `empreendimentoId` nulo = categoria reutilizável entre empreendimentos |
| `custo` | Uma linha de custo/despesa | `participaFluxoCaixa` decide se entra no fluxo — é o mecanismo do achado F/4.3; `valorRealizado`/`status` (Fase 1) só fazem sentido para custos de incidência fixa, que têm um mês de competência único |
| `cronograma_fisico_financeiro` | % de execução física por mês | Curva livre, sem formato pressuposto (não precisa ser "S") |
| `usuario` | Login e permissão (Fase 1) | `senhaHash` via `bcryptjs`; `papel` (`admin`/`usuario`) é a dimensão de permissão por ação — ver `empreendimento_usuario` para a dimensão de permissão por empreendimento |
| `sessao` | Token de sessão ativo (Fase 1) | Token opaco (não JWT), verificado a cada request; revogar é apagar a linha |
| `empreendimento_usuario` | Vínculo de acesso usuário×empreendimento (Fase 1, achado F5) | Só existe para `papel='usuario'` — `admin` nunca é restringido por ela; sem vínculo, um `usuario` não vê o empreendimento na listagem e recebe 404 (não 403) ao tentar acessá-lo direto |

## O que foi deliberadamente deixado de fora da Fase 0

Ver `docs/DECISOES.md` para a justificativa de cada item — nenhum foi esquecido, todos foram avaliados e adiados conscientemente:

- `RegistroAreaTerreno` (auditoria de múltiplas origens de área) — Fase 0 usa `Terreno.areaObservacao` (texto) para o mesmo fim
- `MovimentoCaixa` — **removida como tabela**, é serviço computado (achado F1)
- `FinanciamentoProducao`, `AlertaRisco`, `SimulacaoSensibilidade`, `VersaoCenario`, `EstruturaComissao`, `IndiceCorrecao`, `Distrato` — todas fora do MVP definido, sem impacto no motor financeiro

Itens desta lista original já foram implementados na Fase 1 (ver `docs/FASES.md`): `Permuta` (cadastro nominal, achado F3), a cascata de preço por andar (achado F2, sem tabela nova — ver `src/core/precificacaoAndar.ts`), `Usuario`/`Sessao` (login e permissão por ação) e `EmpreendimentoUsuario` (permissão por empreendimento, achado F5).
