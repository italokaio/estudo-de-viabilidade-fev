# Snapshot dos empreendimentos

Prova que um refactor não mudou nenhum número oficial: gera o fluxo de caixa (JSON) e o texto do PDF de viabilidade de cada cenário e compara com uma referência, ignorando só os carimbos de hora.

```bash
SNAPSHOT_EMAIL=<admin> SNAPSHOT_SENHA=<senha> node scripts/snapshot/snapshot.mjs --saida <pasta> --referencia <pasta-da-referencia>
```

- A API precisa estar rodando (padrão `http://localhost:3333`; mude com `SNAPSHOT_API`).
- Sem `--referencia`, só gera a saída. Com ela, sai com código 1 se houver qualquer diferença.
- A referência vale só para o conteúdo do `dev.db` em que foi gerada. As referências `final6` e `final9` e a cópia do `dev.db` de 2026-10-05 ficam fora do repositório, em `Backups/erp-imobiliario/snapshots-2026-10-05/`.
- `manifesto-referencias.sha256` registra o SHA-256 de cada arquivo dessas referências, para conferir que a cópia guardada é a mesma.
- Credenciais só por variável de ambiente. Não as grave em arquivos.
