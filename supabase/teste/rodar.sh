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
run "cd $RAIZ && $P -f supabase/teste/stub_supabase.sql && $P -f supabase/001_esquema.sql && $P -f supabase/001_esquema.sql && $P -f supabase/teste/cenarios.sql"
