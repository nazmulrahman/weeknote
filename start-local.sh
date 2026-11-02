#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
weeknote_node_dir="/home/arnab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if [ -x "$weeknote_node_dir/node" ]; then
  export PATH="$weeknote_node_dir:$PATH"
fi
exec npm run dev -- --port 5173
