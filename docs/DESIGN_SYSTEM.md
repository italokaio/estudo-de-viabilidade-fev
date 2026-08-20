# Design System — "Painel de Comando"

> Referência visual completa (componentes com estados, telas compostas nos dois temas): [Diretrizes de Design](https://claude.ai/code/artifact/c79d06fa-45ec-4481-9bee-63b7b3d1b9c9).
> Tokens reutilizáveis (o que o código realmente consome): [`design/tokens.css`](../design/tokens.css).

## Princípio

Este produto é um instrumento de precisão para decisão financeira, não uma planilha bonita nem um sistema bancário datado. A direção escolhida — "Painel de Comando" — traduz isso como: alta densidade de informação tratada com hierarquia clara, números sempre em fonte monoespaçada (para nunca "dançar" ao alinhar), um único acento de marca (âmbar) usado com moderação para nunca competir com o dado, e um segundo acento (ciano) reservado para destaque secundário/dado em foco — nunca os dois brigando na mesma tela.

## Por que dois temas, não um

Sessões de análise financeira são longas — o modo escuro é o padrão de uso pretendido (menos fadiga em uso prolongado, e reforça o caráter de "painel de comando"). O modo claro existe porque nem todo contexto de uso é uma sala escura (apresentação para investidor, impressão, ambiente muito iluminado) — não é um tema secundário malfeito, é a mesma personalidade (âmbar + ciano + Manrope + JetBrains Mono) recalibrada para uma superfície clara, nunca uma inversão automática ingênua de cores.

## Tokens — regras de uso

Todo valor visual do produto vem de uma variável CSS por **papel** (`--accent`, `--ink-secondary`...), nunca de um hex direto em um componente. Isso é o que torna o sistema reutilizável de verdade: mudar de tema, ou ajustar uma cor no futuro, é uma edição em um único arquivo (`design/tokens.css`), não uma varredura pelo código.

| Categoria | Tokens | Regra |
|---|---|---|
| Superfície | `--bg`, `--surface`, `--surface-2`, `--surface-3` | `bg` é o fundo da página; `surface` é cartão/painel; `surface-2`/`3` são para hierarquia dentro de um painel (cabeçalho de tabela, linha em hover) — nunca usar `surface-3` como fundo de página |
| Texto | `--ink-primary`, `--ink-secondary`, `--ink-muted` | `primary` para conteúdo, `secondary` para rótulos/apoio, `muted` para texto verdadeiramente secundário (timestamps, placeholders) |
| Marca | `--accent` (âmbar), `--accent-2` (ciano) | `accent` é a cor de ação — botão primário, item de navegação ativo, link. `accent-2` é reservado para destaque de dado (ex.: uma série específica em um gráfico, um valor que pede atenção sem ser um alerta) — nunca os dois no mesmo elemento |
| Status | `--status-good/warning/critical` | Semânticos — nunca reaproveitados como cor decorativa. Sempre acompanhados de ícone + rótulo, nunca só a cor (`--status-warning` usa a família do âmbar mas é deliberadamente mais escuro/opaco que `--accent`, para não ser confundido com a marca) |
| Elevação | `--shadow-sm/md/lg` | Cartões usam `sm`; menus/dropdowns `md`; modais `lg`. No escuro, sombra vira mais preta/opaca em vez de mais espalhada — sombra difusa não lê bem sobre fundo já escuro |
| Espaçamento | `--space-1` (4px) até `--space-12` (48px) | Escala de 4px. Não usar valores fora da escala |
| Tipografia | `--text-*` | Manrope para interface, JetBrains Mono para todo número monetário/tabular — nunca um número em Manrope |

## Inventário de componentes (definidos, com todos os estados)

Botão (primário / secundário / terciário / perigo — cada um com hover, active, disabled, loading), campo de texto (default, focus, erro, disabled), selo de status (good/warning/critical/info), tabela de dados (cabeçalho, linha, linha em hover, linha selecionada), cartão de indicador (KPI), navegação superior com item ativo, abas, alerta/callout inline. Ver o canvas para a especificação visual de cada um nos dois temas.

## Decisões registradas

- **Âmbar como cor de status "warning" também**: mesma família de cor da marca, deliberadamente mais escura/opaca (`--status-warning` ≠ `--accent`) para não ser ambígua — sempre com ícone e rótulo, nunca cor isolada. Alternativa considerada (uma quarta cor só para warning) foi descartada por adicionar uma cor à paleta sem necessidade real.
- **Fundo do modo claro não é branco puro nem creme**: `--bg` é um cinza levemente frio (`#F5F6F7`), para manter o caráter "instrumento de precisão" da direção escolhida — um fundo creme puxaria para a direção B (Autoridade Discreta), descartada.
- **Todo valor monetário/numérico em fonte monoespaçada**: decisão deliberada para que colunas de números sempre alinhem verticalmente e para reforçar a sensação de precisão/instrumento — é a mesma convenção já usada no motor (`decimal.js`, nunca float) aplicada à interface.

## Aplicado

A tela de Fluxo de Caixa (`web/`) já consome `design/tokens.css` diretamente — nenhum token foi reinventado no código da tela. Próxima tela a construir segue o mesmo padrão: nenhum hex novo fora deste arquivo.
