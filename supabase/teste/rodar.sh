#!/usr/bin/env bash
# Testa o esquema num Postgres local descartável (requer binários do PostgreSQL 16).
set -euo pipefail
BIN=/usr/lib/postgresql/16/bin
DIR=$(mktemp -d)
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
chown postgres "$DIR" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/db -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/db -o '-k $DIR -p 54329 -c listen_addresses=' -l $DIR/log start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/db stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
sleep 1
P="psql -h $DIR -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
cd "$RAIZ"
run "cd $RAIZ && $P -f supabase/teste/stub_supabase.sql && $P -f supabase/001_esquema.sql && $P -f supabase/001_esquema.sql && $P -f supabase/004_epi.sql && $P -f supabase/005_equipamentos.sql && $P -f supabase/005_equipamentos.sql && $P -f supabase/teste/cenarios.sql && $P -f supabase/teste/cenarios_etapa2.sql && $P -f supabase/006_financeiro_cadastros.sql && $P -f supabase/006_financeiro_cadastros.sql && $P -f supabase/teste/cenarios_financeiro.sql && $P -f supabase/007_pedidos.sql && $P -f supabase/007_pedidos.sql && $P -f supabase/teste/cenarios_pedidos.sql && $P -f supabase/008_compras.sql && $P -f supabase/008_compras.sql && $P -f supabase/teste/cenarios_compras.sql && $P -f supabase/teste/cenarios_upsert.sql && $P -f supabase/teste/cenarios_massa.sql && $P -f supabase/010_pilares.sql && $P -f supabase/010_pilares.sql && $P -f supabase/teste/cenarios_pilares.sql && $P -f supabase/014_terceirizados.sql && $P -f supabase/014_terceirizados.sql && $P -f supabase/teste/cenarios_014.sql && $P -f supabase/teste/cenarios_011.sql && $P -f supabase/teste/cenarios_013.sql && node scripts/backup/restaurar.mjs sql supabase/teste/backup_exemplo | $P && $P -f supabase/teste/cenarios_restauracao.sql"
