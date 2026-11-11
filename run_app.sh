#!/usr/bin/env bash
# Start the FY2027 Budget Workbench local dev server.
#
# Usage: ./run_app.sh [port]
#   port  optional port for Vite (default: 5173)
#
# Dependencies are expected to be installed already (npm ci --prefix analysis/web).
# To refresh derived datasets after input changes, run:
#   npm run generate:data --prefix analysis/web
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm not found. Install Node.js 22 first." >&2
    exit 1
fi

# Install dependencies on first run (or after a clean).
if [ ! -x analysis/web/node_modules/.bin/vite ]; then
    echo "Dependencies missing: running npm ci --prefix analysis/web ..."
    npm ci --prefix analysis/web
fi

PORT="${1:-5173}"
echo "Starting Vite dev server on http://localhost:${PORT}/ ..."
exec npm run dev --prefix analysis/web -- --port "${PORT}" --strictPort
