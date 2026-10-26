#!/usr/bin/env bash
# Creates or updates one Accelerate environment from infra/main.bicep.
#
#   infra/deploy.sh preview
#
# Safe to re-run. It keeps the image that is running (code deploys are the
# GitHub Actions workflow's job) and keeps the custom domain binding. Steps:
#   1. Bicep without the apps: identities, key vault, storage, role assignments
#   2. what Bicep can't do: random secrets, connection strings, the database
#   3. Bicep with the apps: API, PostgREST, worker, migrations job
#   4. run the migrations, which also create the worker's database login
#
# Run it after the code that the running image holds can start the worker
# (worker/), i.e. after the first deploy that includes it.
#
# Prerequisites: az login as an Owner of the subscription; Bicep (az bicep install).
# A brand-new environment also needs the DNS records and infra/custom-domain.sh.

set -euo pipefail

# The Windows build of the az CLI ends tsv lines with \r, which breaks every
# $(...) below when this runs from Git Bash.
az() { command az "$@" | tr -d '\r'; }
# Git Bash also rewrites arguments that start with / (resource ids) into Windows paths.
export MSYS_NO_PATHCONV=1
# The Windows az CLI crashes echoing non-ASCII build output (e.g. Vite's check marks).
export PYTHONIOENCODING=utf-8

ENVIRONMENT=${1:?usage: infra/deploy.sh <environment>   e.g. preview}
HERE=$(cd "$(dirname "$0")" && pwd)
PARAMS="$HERE/env/$ENVIRONMENT.bicepparam"
# shellcheck source=env/preview.env
source "$HERE/env/$ENVIRONMENT.env"

param() { sed -n "s/^param $1 = '\(.*\)'.*/\1/p" "$PARAMS"; }
LOCATION=$(param location)
SHARED_RG=$(param sharedResourceGroup)
PG_SERVER=$(param postgresServerName)
ACR=$(param registryName)
KV=$(param keyVaultName)
RG="rg-accelerate-$ENVIRONMENT"
API="ca-accelerate-$ENVIRONMENT"
# Preview kept the names the retired infra/provision.sh gave it; other environments get a suffix (see main.bicep).
JOB="caj-accelerate-migrate$([ "$ENVIRONMENT" = preview ] || echo "-$ENVIRONMENT")"
DB=accelerate

az account set --subscription "$SUBSCRIPTION"
az group create -n "$RG" -l "$LOCATION" --tags app=accelerate env="$ENVIRONMENT" -o none

echo "== current image and custom domain"
IMAGE=$(az containerapp show -g "$RG" -n "$API" --query 'properties.template.containers[0].image' -o tsv 2>/dev/null || true)
if [ -z "$IMAGE" ]; then
  IMAGE="$ACR.azurecr.io/accelerate:initial"
  echo "   no app yet; building $IMAGE"
  az acr build -r "$ACR" -g "$SHARED_RG" -t "accelerate:initial" "$HERE/.." -o none
fi
DOMAIN=$(az containerapp hostname list -g "$RG" -n "$API" --query '[0].name' -o tsv 2>/dev/null || true)
CERT=$(az containerapp hostname list -g "$RG" -n "$API" --query '[0].certificateId' -o tsv 2>/dev/null || true)
echo "   image:  $IMAGE"
echo "   domain: ${DOMAIN:-none}"

deploy() { # name, extra parameters...
  local name=$1; shift
  az deployment group create -g "$RG" -n "$name" --template-file "$HERE/main.bicep" \
    --parameters "$PARAMS" --parameters image="$IMAGE" customDomainName="$DOMAIN" customDomainCertificateId="$CERT" "$@" \
    --query properties.outputs -o json
}

echo "== 1. base resources"
OUTPUTS=$(deploy "accelerate-base" deployApps=false)
output() { node -e "console.log(JSON.parse(process.argv[1])['$1'].value)" "$OUTPUTS"; }
PG_FQDN=$(output postgresFqdn)
PG_ADMIN=$(output postgresAdmin)

echo "== 2. secrets and database"
KV_ID=$(az keyvault show -n "$KV" --query id -o tsv)
ME=$(az ad signed-in-user show --query id -o tsv)
if [ -z "$(az role assignment list --assignee "$ME" --role "Key Vault Secrets Officer" --scope "$KV_ID" --query '[0].id' -o tsv)" ]; then
  az role assignment create --role "Key Vault Secrets Officer" --assignee-object-id "$ME" --assignee-principal-type User --scope "$KV_ID" -o none
fi
# A new role assignment takes a minute or two to reach Key Vault.
for _ in $(seq 30); do az keyvault secret list --vault-name "$KV" -o none 2>/dev/null && break; sleep 10; done

random_secret() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
secret_missing() { [ -z "$(az keyvault secret list --vault-name "$KV" --query "[?name=='$1'].name" -o tsv)" ]; }
secret() { az keyvault secret show --vault-name "$KV" -n "$1" --query value -o tsv; }
set_secret() { az keyvault secret set --vault-name "$KV" -n "$1" --value "$2" -o none; }

for name in pgrst-jwt-secret authenticator-password worker-password; do
  if secret_missing "$name"; then set_secret "$name" "$(random_secret)"; fi
done
set_secret pgrst-db-uri "postgres://accelerate_authenticator:$(secret authenticator-password)@$PG_FQDN:5432/$DB?sslmode=require"
set_secret worker-database-url "postgres://accelerate_worker:$(secret worker-password)@$PG_FQDN:5432/$DB?sslmode=require"
ADMIN_PW=$(az keyvault secret show --vault-name "$POSTGRES_ADMIN_PASSWORD_VAULT" -n "$POSTGRES_ADMIN_PASSWORD_SECRET" --query value -o tsv)
ADMIN_PW_ENC=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$ADMIN_PW")
set_secret migrate-database-url "postgres://$PG_ADMIN:$ADMIN_PW_ENC@$PG_FQDN:5432/$DB"

az postgres flexible-server db create -g "$SHARED_RG" -s "$PG_SERVER" -n "$DB" -o none

echo "== 3. apps"
OUTPUTS=$(deploy "accelerate-apps")

echo "== 4. migrations"
EXECUTION=$(az containerapp job start -g "$RG" -n "$JOB" --query name -o tsv)
for _ in $(seq 60); do
  STATUS=$(az containerapp job execution show -g "$RG" -n "$JOB" --job-execution-name "$EXECUTION" --query properties.status -o tsv)
  case "$STATUS" in Running|Processing|"") sleep 10 ;; *) break ;; esac
done
echo "   $STATUS"
[ "$STATUS" = Succeeded ] || { echo "Migrations failed; see the job's logs in Log Analytics."; exit 1; }

echo
echo "App:              https://$(output apiFqdn)"
echo "Deploy client id: $(output deployClientId)   (AZURE_CLIENT_ID in .github/workflows/deploy-azure.yml)"
echo "Blob storage:     $(output storageBlobUrl)"
echo "Check the worker: Platform administration > Overview > Run health check"
