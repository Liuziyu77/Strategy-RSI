#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -x .runtime/node_modules/node/bin/node ]; then
  export PATH="$PWD/.runtime/node_modules/node/bin:$PATH"
fi
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<13))process.exit(1)' 2>/dev/null; then
  echo '需要 Node.js >=22.13。可运行 npm install --prefix .runtime --cache /tmp/sanguosha-npm-cache node@22.20.0 后重试。'
  exit 1
fi
export npm_config_cache="${npm_config_cache:-/tmp/sanguosha-npm-cache}"
if [ ! -d node_modules ]; then npm ci; fi
npm run "${1:-dev}" -- "${@:2}"
