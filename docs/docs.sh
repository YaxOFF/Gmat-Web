#!/bin/sh
# docs/docs.sh map    -> regenera docs/SYMBOLS.tsv (simbolo<TAB>archivo). Se consulta con Grep, nunca con Read.
# docs/docs.sh stale  -> lista los docs cuyas fuentes cambiaron desde su rev. Sin salida = todo vigente.
# D = carpeta donde vive este script (docs/, Docs/, documentacion/...), relativa a la raiz del repo
D=$(cd "$(dirname "$0")" && git rev-parse --show-prefix) || exit 1; D=${D%/}
cd "$(git rev-parse --show-toplevel)" || exit 1
case "$1" in
map)
  # Sin lista de lenguajes: reconoce declaraciones por palabra clave (function, func, fn, def, class,
  # struct, trait...), metodos "public Tipo Nombre(" y CREATE TABLE/FUNCTION/... de SQL.
  # shortcut: no ve funciones sin palabra clave (C, metodos no publicos de Java/C#/Dart);
  # si el conteo sale pobre para el lenguaje del proyecto, agrega su regla en el awk.
  git grep -I -i -E '(function|func|fn|fun|def|defmodule|class|interface|struct|enum|trait|type|record|module|object|protocol|export|public|create)[ *]' \
  | awk -v d="$D/" '{
      i = index($0, ":"); f = substr($0, 1, i - 1); s = substr($0, i + 1); n = ""
      if (f ~ /(^|\/)(tests?|__tests__|spec|vendor|node_modules|dist|build)\// || index(tolower(f), tolower(d)) == 1 ||
          f ~ /(_test|\.test|\.spec|\.min|\.d|Tests?)\.[A-Za-z]+$/ ||
          f ~ /(\.Designer|\.g|\.generated|_pb2?|\.pb|ModelSnapshot)\.[A-Za-z]+$|(^|\/)(Connected Services|generated|__generated__)\// ||   # codigo generado
          f ~ /\.(md|txt|json|ya?ml|lock|html|css|scss|svg|csv|tsv|xml|toml|sh)$/) next
      sub(/\r$/, "", s); sub(/^[ \t]+/, "", s)
      if (s ~ /^(private|defp) /) next
      exported = 0; pub = 0
      while (match(s, /^(export|default|public|internal|protected|pub(\([a-z]+\))?|async|static|abstract|final|sealed|open|data|partial|suspend|override|virtual|inline|unsafe|declare|readonly) /)) {
        m = substr(s, 1, RLENGTH)
        if (m ~ /^export/) exported = 1
        if (m ~ /^public/) pub = 1
        s = substr(s, RLENGTH + 1)
      }
      low = tolower(s)
      if (match(s, /^(function\*?|func|fn|fun|def|defmodule|class|interface|struct|enum|trait|type|record|module|object|protocol) /) ||
          (exported && match(s, /^(const|let|var) /))) {
        r = substr(s, RLENGTH + 1); sub(/^\([^)]*\) /, "", r)   # receptor de metodo en Go
        if (match(r, /^[A-Za-z$][A-Za-z0-9_$.]*/)) n = substr(r, 1, RLENGTH)
      } else if (pub && match(s, /^[^=;(]* [A-Za-z][A-Za-z0-9_]*\(/)) {
        n = substr(s, 1, RLENGTH - 1); sub(/.* /, "", n)
      } else if (match(low, /^create (or replace )?(unique )?(materialized )?(table|view|function|procedure|trigger|index|type) (if not exists )?/)) {
        r = substr(s, RLENGTH + 1); gsub(/["`\[\]]/, "", r)
        if (match(r, /^[A-Za-z_][A-Za-z0-9_.]*/)) n = substr(r, 1, RLENGTH)
      }
      sub(/\.$/, "", n)
      if (n != "") print n "\t" f
    }' | sort -u > "$D/SYMBOLS.tsv"
  echo "$D/SYMBOLS.tsv: $(wc -l < "$D/SYMBOLS.tsv") simbolos" ;;
stale)
  grep -rl --include='*.md' '<!-- fuente:' "$D" | while IFS= read -r f; do
    sello=$(grep -m1 '<!-- fuente:' "$f")
    rev=$(printf '%s\n' "$sello" | sed -n 's/.*rev: *\([0-9a-f]*\).*/\1/p')
    src=$(printf '%s\n' "$sello" | sed -n 's/.*fuente: *\([^|]*\)|.*/\1/p' | sed 's/ *, */,/g; s/^ *//; s/ *$//')
    [ -n "$src" ] || { echo "SIN FUENTE: $f"; continue; }
    # rev perdido (rebase/squash) cuenta como viejo: no se puede probar que sigue vigente
    git cat-file -e "$rev^{commit}" 2>/dev/null || { echo "STALE (rev $rev no existe): $f"; continue; }
    old=$IFS; IFS=,; set -f; set -- $src; set +f; IFS=$old
    # diff contra el working tree: incluye cambios sin commit; ls-files: archivos nuevos sin trackear
    if ! git diff --quiet "$rev" -- "$@" || [ -n "$(git ls-files --others --exclude-standard -- "$@")" ]; then
      echo "STALE: $f"
    fi
  done ;;
*) echo "uso: sh $0 map|stale"; exit 2 ;;
esac
