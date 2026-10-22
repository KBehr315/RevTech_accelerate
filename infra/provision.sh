#!/usr/bin/env bash
# One-time Azure setup for the Compliance LMS ("RevTech Accelerate"), in the
# Operations Applications subscription. Safe to re-run: each step checks for what
# already exists. Ongoing deploys are .github/workflows/deploy-azure.yml.
#
# Shares RevelationHub's Container Apps environment, Postgres server and container
# registry (all in rg-revhub-preview); everything Accelerate owns lives in
# rg-accelerate-preview.
#
#   browser --> ca-accelerate-preview (external, accelerate.revtech.consulting)
#                 |  verifies Microsoft sign-in, signs a PostgREST JWT
#                 v
#               ca-accelerate-pgrst-preview (internal only)
#                 v
#               psql-revhub-preview-ad4fad06 / database "accelerate"
#
# Prerequisites: az login as an Owner of the subscription, and the Entra app
# registration "RevTech Accelerate" (client id in web/.env.production).

set -euo pipefail

# The Windows build of the az CLI ends tsv lines with \r, which breaks every
# $(...) below when this runs from Git Bash.
az() { command az "$@" | tr -d '\r'; }
# Git Bash also rewrites arguments that start with / (resource ids) into Windows paths.
export MSYS_NO_PATHCONV=1
# The Windows az CLI crashes echoing non-ASCII build output (e.g. Vite's check marks).
export PYTHONIOENCODING=utf-8

SUB="Operations Applications"
LOCATION=westus3
RG=rg-accelerate-preview
SHARED_RG=rg-revhub-preview
ENV_NAME=cae-revhub-preview
PG_SERVER=psql-revhub-preview-ad4fad06
ACR=acrrevhubpreviewad4fad06
SHARED_KV=kv-revhub-ad4fad06          # holds postgres-admin-password
DB=accelerate
KV=kv-accelerate-0ae49a
APP=ca-accelerate-preview
PGRST_APP=ca-accelerate-pgrst-preview
JOB=caj-accelerate-migrate
IDENTITY=id-accelerate-preview
DEPLOY_IDENTITY=id-accelerate-deploy
GITHUB_REPO=KBehr315/RevTech_accelerate
IMAGE="$ACR.azurecr.io/accelerate:${IMAGE_TAG:-initial}"
TENANT_ID=c0fdfbc6-f518-47f4-9e98-5517a1259553
CLIENT_ID=$(grep VITE_AZURE_CLIENT_ID "$(dirname "$0")/../web/.env.production" | cut -d= -f2 | tr -d '\r')

az account set --subscription "$SUB"
SUB_ID=$(az account show --query id -o tsv)
ENV_ID=$(az containerapp env show -g "$SHARED_RG" -n "$ENV_NAME" --query id -o tsv)
ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
PG_FQDN=$(az postgres flexible-server show -g "$SHARED_RG" -n "$PG_SERVER" --query fullyQualifiedDomainName -o tsv)
PG_ADMIN=$(az postgres flexible-server show -g "$SHARED_RG" -n "$PG_SERVER" --query administratorLogin -o tsv)

assign() { # role, assignee principal id, scope, [principal type]
  if [ -z "$(az role assignment list --assignee "$2" --role "$1" --scope "$3" --query '[0].id' -o tsv)" ]; then
    az role assignment create --role "$1" --assignee-object-id "$2" --assignee-principal-type "${4:-ServicePrincipal}" --scope "$3" -o none
  fi
}
random_secret() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
kv_secret_missing() { [ -z "$(az keyvault secret list --vault-name "$KV" --query "[?name=='$1'].name" -o tsv)" ]; }

echo "== resource group, identity, key vault"
az group create -n "$RG" -l "$LOCATION" --tags app=accelerate env=preview -o none
az identity create -g "$RG" -n "$IDENTITY" -o none
IDENTITY_ID=$(az identity show -g "$RG" -n "$IDENTITY" --query id -o tsv)
IDENTITY_PRINCIPAL=$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)
if ! az keyvault show -n "$KV" -o none 2>/dev/null; then
  az keyvault create -g "$RG" -n "$KV" -l "$LOCATION" --enable-rbac-authorization true -o none
fi
KV_ID=$(az keyvault show -n "$KV" --query id -o tsv)
assign "Key Vault Secrets Officer" "$(az ad signed-in-user show --query id -o tsv)" "$KV_ID" User
assign "Key Vault Secrets User" "$IDENTITY_PRINCIPAL" "$KV_ID"
assign "AcrPull" "$IDENTITY_PRINCIPAL" "$ACR_ID"

echo "== database"
az postgres flexible-server db create -g "$SHARED_RG" -s "$PG_SERVER" -n "$DB" -o none
# 00001 creates pgcrypto; Azure only allows extensions on this list.
EXTENSIONS=$(az postgres flexible-server parameter show -g "$SHARED_RG" -s "$PG_SERVER" -n azure.extensions --query value -o tsv)
if ! echo ",$EXTENSIONS," | grep -qi ",pgcrypto,"; then
  az postgres flexible-server parameter set -g "$SHARED_RG" -s "$PG_SERVER" -n azure.extensions \
    --value "$(echo "${EXTENSIONS:+$EXTENSIONS,}PGCRYPTO")" -o none
fi

echo "== secrets"
# A new role assignment takes a minute or two to reach Key Vault.
for _ in $(seq 30); do az keyvault secret list --vault-name "$KV" -o none 2>/dev/null && break; sleep 10; done
for name in pgrst-jwt-secret authenticator-password; do
  kv_secret_missing "$name" && az keyvault secret set --vault-name "$KV" -n "$name" --value "$(random_secret)" -o none
done
AUTH_PW=$(az keyvault secret show --vault-name "$KV" -n authenticator-password --query value -o tsv)
az keyvault secret set --vault-name "$KV" -n pgrst-db-uri -o none \
  --value "postgres://accelerate_authenticator:$AUTH_PW@$PG_FQDN:5432/$DB?sslmode=require"
ADMIN_PW=$(az keyvault secret show --vault-name "$SHARED_KV" -n postgres-admin-password --query value -o tsv)
ADMIN_PW_ENC=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$ADMIN_PW")
az keyvault secret set --vault-name "$KV" -n migrate-database-url -o none \
  --value "postgres://$PG_ADMIN:$ADMIN_PW_ENC@$PG_FQDN:5432/$DB"
kvref() { echo "keyvaultref:https://$KV.vault.azure.net/secrets/$1,identityref:$IDENTITY_ID"; }

echo "== image"
if [ -z "$(az acr repository show-tags -n "$ACR" --repository accelerate --query "[?@=='${IMAGE##*:}']" -o tsv 2>/dev/null)" ]; then
  az acr build -r "$ACR" -t "${IMAGE#*/}" "$(dirname "$0")/.." -o none
fi

echo "== migrations job"
if ! az containerapp job show -g "$RG" -n "$JOB" -o none 2>/dev/null; then
  az containerapp job create -g "$RG" -n "$JOB" --environment "$ENV_ID" \
    --trigger-type Manual --replica-timeout 600 --replica-retry-limit 0 --parallelism 1 --replica-completion-count 1 \
    --image "$IMAGE" --registry-server "$ACR.azurecr.io" --registry-identity "$IDENTITY_ID" \
    --mi-user-assigned "$IDENTITY_ID" --cpu 0.25 --memory 0.5Gi \
    --command node --args server/migrate.js \
    --secrets "database-url=$(kvref migrate-database-url)" "authenticator-password=$(kvref authenticator-password)" \
    --env-vars DATABASE_URL=secretref:database-url AUTHENTICATOR_PASSWORD=secretref:authenticator-password -o none
fi
EXECUTION=$(az containerapp job start -g "$RG" -n "$JOB" --query name -o tsv)
echo "   started $EXECUTION"
for _ in $(seq 60); do
  STATUS=$(az containerapp job execution show -g "$RG" -n "$JOB" --job-execution-name "$EXECUTION" --query properties.status -o tsv)
  [ "$STATUS" = Running ] || [ "$STATUS" = Processing ] || break
  sleep 10
done
echo "   $STATUS"
[ "$STATUS" = Succeeded ] || { echo "Migrations failed; see the job's logs in Log Analytics."; exit 1; }

echo "== PostgREST"
if ! az containerapp show -g "$RG" -n "$PGRST_APP" -o none 2>/dev/null; then
  az containerapp create -g "$RG" -n "$PGRST_APP" --environment "$ENV_ID" \
    --image postgrest/postgrest:v12.2.3 --ingress internal --target-port 3000 \
    --user-assigned "$IDENTITY_ID" --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 2 \
    --secrets "pgrst-db-uri=$(kvref pgrst-db-uri)" "pgrst-jwt-secret=$(kvref pgrst-jwt-secret)" \
    --env-vars PGRST_DB_URI=secretref:pgrst-db-uri PGRST_JWT_SECRET=secretref:pgrst-jwt-secret \
      PGRST_DB_SCHEMAS=public PGRST_SERVER_PORT=3000 -o none
fi

echo "== app"
if ! az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  az containerapp create -g "$RG" -n "$APP" --environment "$ENV_ID" \
    --image "$IMAGE" --registry-server "$ACR.azurecr.io" --registry-identity "$IDENTITY_ID" \
    --user-assigned "$IDENTITY_ID" --ingress external --target-port 8080 \
    --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 2 \
    --secrets "pgrst-jwt-secret=$(kvref pgrst-jwt-secret)" \
    --env-vars AZURE_TENANT_ID="$TENANT_ID" AZURE_CLIENT_ID="$CLIENT_ID" \
      PGRST_URL="http://$PGRST_APP" PGRST_JWT_SECRET=secretref:pgrst-jwt-secret -o none
fi
APP_FQDN=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)

echo "== GitHub Actions deploy identity (OIDC, no stored secret)"
az identity create -g "$RG" -n "$DEPLOY_IDENTITY" -o none
DEPLOY_PRINCIPAL=$(az identity show -g "$RG" -n "$DEPLOY_IDENTITY" --query principalId -o tsv)
if [ -z "$(az identity federated-credential list -g "$RG" --identity-name "$DEPLOY_IDENTITY" --query "[?name=='github-master'].name" -o tsv)" ]; then
  az identity federated-credential create -g "$RG" --identity-name "$DEPLOY_IDENTITY" -n github-master \
    --issuer https://token.actions.githubusercontent.com --audiences api://AzureADTokenExchange \
    --subject "repo:$GITHUB_REPO:ref:refs/heads/master" -o none
fi
assign "Container Registry Tasks Contributor" "$DEPLOY_PRINCIPAL" "$ACR_ID"
assign "Container Apps Contributor" "$DEPLOY_PRINCIPAL" "/subscriptions/$SUB_ID/resourceGroups/$RG"
assign "Container Apps Jobs Contributor" "$DEPLOY_PRINCIPAL" "/subscriptions/$SUB_ID/resourceGroups/$RG"
# Read and join only: there are no container apps under the environment's own scope.
assign "Container Apps Contributor" "$DEPLOY_PRINCIPAL" "$ENV_ID"

echo
echo "App:              https://$APP_FQDN"
echo "Deploy client id: $(az identity show -g "$RG" -n "$DEPLOY_IDENTITY" --query clientId -o tsv)"
echo "Custom domain:    add at GoDaddy, then run infra/custom-domain.sh"
echo "  CNAME accelerate        -> $APP_FQDN"
echo "  TXT   asuid.accelerate  -> $(az containerapp env show -g "$SHARED_RG" -n "$ENV_NAME" --query properties.customDomainConfiguration.customDomainVerificationId -o tsv)"
