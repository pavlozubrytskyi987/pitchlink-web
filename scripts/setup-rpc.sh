#!/usr/bin/env bash
# Interactive QuickNode RPC setup for Pitchlink.
# Prompts for the endpoint Base URL + auth token, writes both RPC env vars
# into .env (gitignored), and health-checks the endpoint. The token is never
# echoed or printed.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=".env"
touch "$ENV_FILE"

echo "Pitchlink — QuickNode RPC setup"
echo "Copy these from: QuickNode dashboard -> your endpoint -> API access URL (HTTPS tab)"
echo

read -r -p "Base URL (e.g. https://your-name.solana-devnet.quiknode.pro): " BASE
read -r -p "Auth token (visible so you can confirm the paste): " TOKEN

# Normalize: strip whitespace everywhere, trailing slash from base,
# any slashes from token.
BASE=$(echo "$BASE" | tr -d '[:space:]')
TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')
BASE="${BASE%/}"
TOKEN="${TOKEN#/}"
TOKEN="${TOKEN%/}"

echo "Read: base=$BASE  token=<${#TOKEN} chars>"

if [[ "$BASE" != https://* ]]; then
  echo "ERROR: Base URL must start with https://"
  exit 1
fi
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: token cannot be empty"
  exit 1
fi

FULL="$BASE/$TOKEN/"

set_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_var "SOLANA_RPC_URL" "$FULL"
set_var "NEXT_PUBLIC_QUICKNODE_DEVNET_URL" "$FULL"

echo "Testing the endpoint (getHealth)..."
RESP=$(curl -s --max-time 10 -X POST "$FULL" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' || true)

if echo "$RESP" | grep -q '"ok"'; then
  echo "Endpoint OK — devnet reports healthy."
else
  echo "ERROR: endpoint did not respond healthy. Response was:"
  echo "$RESP"
  echo "The vars were written anyway — fix the values in $ENV_FILE or rerun."
  exit 1
fi

echo
echo "Wrote to $ENV_FILE (token hidden):"
echo "  SOLANA_RPC_URL=$BASE/<hidden>/"
echo "  NEXT_PUBLIC_QUICKNODE_DEVNET_URL=$BASE/<hidden>/"
echo
echo "Next: tell the assistant 'done' — it will restart the dev server and verify."
