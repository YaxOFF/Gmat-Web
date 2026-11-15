#!/bin/sh
# docs/docs.sh map    -> regenerates docs/SYMBOLS.tsv (symbol<TAB>file). Query it with Grep, never with Read.
# docs/docs.sh stale  -> lists the docs whose sources changed since their rev. No output = everything up to date.
# D = folder where this script lives (docs/, Docs/, documentacion/...), relative to the repo root
D=$(cd "$(dirname "$0")" && git rev-parse --show-prefix) || exit 1; D=${D%/}
cd "$(git rev-parse --show-toplevel)" || exit 1
case "$1" in
map)
  # No language list: recognizes declarations by keyword (function, func, fn, def, class,
  # struct, trait...), "public Type Name(" methods and SQL CREATE TABLE/FUNCTION/....
  # shortcut: does not see functions without a keyword (C, non-public Java/C#/Dart methods);
  # if the count comes out poor for the project's language, add its rule in the awk.
  git grep -I -i -E '(function|func|fn|fun|def|defmodule|class|interface|struct|enum|trait|type|record|module|object|protocol|export|public|create)[ *]' \
  | awk -v d="$D/" '{
      i = index($0, ":"); f = substr($0, 1, i - 1); s = substr($0, i + 1); n = ""
      if (f ~ /(^|\/)(tests?|__tests__|spec|vendor|node_modules|dist|build)\// || index(tolower(f), tolower(d)) == 1 ||
          f ~ /(_test|\.test|\.spec|\.min|\.d|Tests?)\.[A-Za-z]+$/ ||
          f ~ /(\.Designer|\.g|\.generated|_pb2?|\.pb|ModelSnapshot)\.[A-Za-z]+$|(^|\/)(Connected Services|generated|__generated__)\// ||   # generated code
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
        r = substr(s, RLENGTH + 1); sub(/^\([^)]*\) /, "", r)   # method receiver in Go
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
  echo "$D/SYMBOLS.tsv: $(wc -l < "$D/SYMBOLS.tsv") symbols" ;;
stale)
  grep -rl --include='*.md' '<!-- fuente:' "$D" | while IFS= read -r f; do
    sello=$(grep -m1 '<!-- fuente:' "$f")
    rev=$(printf '%s\n' "$sello" | sed -n 's/.*rev: *\([0-9a-f]*\).*/\1/p')
    src=$(printf '%s\n' "$sello" | sed -n 's/.*fuente: *\([^|]*\)|.*/\1/p' | sed 's/ *, */,/g; s/^ *//; s/ *$//')
    [ -n "$src" ] || { echo "NO SOURCE: $f"; continue; }
    # lost rev (rebase/squash) counts as old: it cannot be proven that it is still up to date
    git cat-file -e "$rev^{commit}" 2>/dev/null || { echo "STALE (rev $rev does not exist): $f"; continue; }
    old=$IFS; IFS=,; set -f; set -- $src; set +f; IFS=$old
    # diff against the working tree: includes uncommitted changes; ls-files: new untracked files
    if ! git diff --quiet "$rev" -- "$@" || [ -n "$(git ls-files --others --exclude-standard -- "$@")" ]; then
      echo "STALE: $f"
    fi
  done ;;
*) echo "usage: sh $0 map|stale"; exit 2 ;;
esac
