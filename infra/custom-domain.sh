#!/usr/bin/env bash
# Binds accelerate.revtech.consulting to the app with a free managed certificate.
# Run after the DNS records for the app exist at GoDaddy (CNAME to the app, TXT
# asuid.<host> with the environment's verification id) and
# have propagated (nslookup -type=TXT asuid.accelerate.revtech.consulting).

set -euo pipefail
az() { command az "$@" | tr -d '\r'; }
export MSYS_NO_PATHCONV=1   # keep Git Bash from rewriting resource ids as Windows paths

az account set --subscription "Operations Applications"
RG=rg-accelerate-preview
APP=ca-accelerate-preview
HOST=accelerate.revtech.consulting
ENV_ID=$(az containerapp env show -g rg-revhub-preview -n cae-revhub-preview --query id -o tsv)

if [ -z "$(az containerapp hostname list -g "$RG" -n "$APP" --query "[?name=='$HOST'].name" -o tsv)" ]; then
  az containerapp hostname add -g "$RG" -n "$APP" --hostname "$HOST" -o none
fi
az containerapp hostname bind -g "$RG" -n "$APP" --hostname "$HOST" \
  --environment "$ENV_ID" --validation-method CNAME -o none
echo "https://$HOST is bound. The certificate can take a few minutes to issue."
