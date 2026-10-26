#!/usr/bin/env bash
# Test tools only; no install, personal profile, remote service or publication.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/usr/lib/chatgpt/resources/cua_node/bin:$PATH"
export PLAYWRIGHT_MODULE="${PLAYWRIGHT_MODULE:-/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core/index.mjs}"
export BROWSER_EXECUTABLE="${BROWSER_EXECUTABLE:-/opt/brave.com/brave/brave}"
export DB_BROWSER_ARTIFACTS="$PWD/artifacts/design-v0.2"
mkdir -p "$DB_BROWSER_ARTIFACTS/server-root"
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    sock.bind(('127.0.0.1',8768))
PY
ln -sfn ../../../_site "$DB_BROWSER_ARTIFACTS/server-root/base-de-datos"
python3 -m http.server 8768 --bind 127.0.0.1 --directory "$DB_BROWSER_ARTIFACTS/server-root" > "$DB_BROWSER_ARTIFACTS/server.log" 2>&1 &
db_server_pid=$!
trap 'kill "$db_server_pid" 2>/dev/null || true; wait "$db_server_pid" 2>/dev/null || true' EXIT
python3 - <<'PY'
import time,urllib.request
for attempt in range(50):
    try:
        urllib.request.urlopen('http://127.0.0.1:8768/base-de-datos/',timeout=1).close()
        break
    except OSError:time.sleep(.1)
else:raise SystemExit('Local server did not start')
PY
export BPLUS_TEST_URL=http://127.0.0.1:8768/base-de-datos/indices/bplus.html
export HASHING_TEST_URL=http://127.0.0.1:8768/base-de-datos/indices/hashing.html
export QUERY_PLAN_TEST_URL=http://127.0.0.1:8768/base-de-datos/procesamiento/reescritura.html
export BUFFER_TEST_URL=http://127.0.0.1:8768/base-de-datos/almacenamiento/buffer-manager.html
case "${1:-all}" in
  design) node tests/design-browser.mjs > "$DB_BROWSER_ARTIFACTS/${DB_TEST_REPORT:-browser}.log" 2>&1 ;;
  print) node tests/print-browser.mjs > "$DB_BROWSER_ARTIFACTS/print.log" 2>&1 ;;
  details) node tests/capture_plan_details.mjs > "$DB_BROWSER_ARTIFACTS/plan-details.log" 2>&1 ;;
  all|regression)
    # Run sequentially to avoid resource contention in the exhaustive buffer suite.
    for db_theme in light dark; do
      for db_suite in bplus hashing query-plan buffer; do
        echo "Running $db_suite ($db_theme)"
        DB_TEST_THEME="$db_theme" node "tests/$db_suite-browser.mjs" > "$DB_BROWSER_ARTIFACTS/$db_suite-$db_theme.log" 2>&1
      done
    done
    python3 tests/summarize_browser.py
    if [[ "${1:-all}" == all ]]; then
      for db_width in 320 390 768 1440; do
        DB_TEST_WIDTHS="$db_width" DB_TEST_REPORT="browser-$db_width" node tests/design-browser.mjs > "$DB_BROWSER_ARTIFACTS/browser-$db_width.log" 2>&1
      done
      python3 tests/merge_browser.py
      node tests/print-browser.mjs > "$DB_BROWSER_ARTIFACTS/print.log" 2>&1
      node tests/capture_plan_details.mjs > "$DB_BROWSER_ARTIFACTS/plan-details.log" 2>&1
    fi
    ;;
  *) echo 'Usage: bash tests/run-design-browser.sh [all|design|regression|print|details]' >&2; exit 2 ;;
esac
echo 'Browser suites completed successfully; see artifacts/design-v0.2/'
