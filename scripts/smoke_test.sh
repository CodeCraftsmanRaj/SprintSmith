#!/usr/bin/env bash
set -euo pipefail

api_url="${SPRINTSMITH_API_URL:-http://localhost:8000}"
tenant_id="00000000-0000-0000-0000-000000000001"

curl --fail --silent --show-error "$api_url/health" >/dev/null
curl --fail --silent --show-error "$api_url/ready" >/dev/null
curl --fail --silent --show-error "$api_url/metrics" >/dev/null

response=$(curl --fail --silent --show-error \
    -X POST \
    -H 'content-type: application/json' \
    -d '{"query":"retention policy","top_k":10}' \
    "$api_url/v1/search")

python -c 'import json, sys; payload=json.loads(sys.argv[1]); assert payload["mode"] == "lexical-ready-hybrid"' "$response"
echo "SprintSmith API smoke checks passed"