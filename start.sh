#!/usr/bin/env bash
# Kasupport — arranca todo el sistema (PostgreSQL, backend, renderer, Electron)
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

# 1) PostgreSQL (si no está corriendo)
if ! pg_isready -q; then
  echo "→ Iniciando PostgreSQL..."
  pg_ctl -D /usr/local/var/postgresql@18 -l /tmp/postgres.log start
  sleep 2
fi

# 2) Backend (API + Socket.IO + widget) en http://localhost:4100
echo "→ Backend en http://localhost:4100"
(cd "$ROOT/server" && npm run dev) &
SERVER_PID=$!

# 3) Renderer (Vite) en http://localhost:7100
echo "→ Renderer en http://localhost:7100"
(cd "$ROOT/app/renderer" && npm run dev) &
VITE_PID=$!

cleanup() { kill "$SERVER_PID" "$VITE_PID" 2>/dev/null; }
trap cleanup EXIT

# 4) Electron (quita esta línea si solo quieres la versión web)
sleep 3
echo "→ Abriendo app de escritorio..."
(cd "$ROOT/app" && npm run dev)

# Al cerrar Electron, se detienen backend y renderer
