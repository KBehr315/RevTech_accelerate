// Preview: accelerate.revtech.consulting, in the Operations Applications
// subscription, sharing RevelationHub's environment, Postgres and registry.
// Fictional data only (docs/platform/09-roadmap-risks-decisions.md, R5).
using '../main.bicep'

param environmentName = 'preview'
param location = 'westus3'

param sharedResourceGroup = 'rg-revhub-preview'
param containerAppsEnvironmentName = 'cae-revhub-preview'
param postgresServerName = 'psql-revhub-preview-ad4fad06'
param registryName = 'acrrevhubpreviewad4fad06'

param keyVaultName = 'kv-accelerate-0ae49a'
param storageAccountName = 'staccelerate0ae49a'

// Not secrets: the sign-in app registration "RevTech Accelerate" (also in web/.env.production).
param tenantId = 'c0fdfbc6-f518-47f4-9e98-5517a1259553'
param entraClientId = '3dc30934-8c49-4f0c-a39a-2d7a54d74e7e'

// GitHub puts the owner and repo ids in the subject, so a recreated repo with the same name isn't trusted.
param githubOidcSubject = 'repo:KBehr315@274071871/RevTech_accelerate@1302924751:ref:refs/heads/master'

// The retired infra/provision.sh made these role assignments when preview was first set up.
param manageCoreRoleAssignments = false

// image, customDomainName/customDomainCertificateId and deployApps come from deploy.sh.
param image = ''
