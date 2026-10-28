// Accelerate: everything one environment owns, in its own resource group.
// Shared pieces (Container Apps environment, Postgres server, container
// registry) are referenced, not managed: in preview they belong to
// RevelationHub (rg-revhub-preview). Run through infra/deploy.sh, which also
// creates the random secrets and the database this template can't.
//
//   browser --> api (external; serves the SPA and /api)
//                 |  verifies Microsoft sign-in, signs a PostgREST JWT
//                 v
//               pgrst (internal only) --> Postgres <-- worker (no ingress)
//                                            ^
//                                         migrate job (before each deploy)

targetScope = 'resourceGroup'

@description('Short environment name, used in resource names: preview, staging, prod.')
param environmentName string

param location string = resourceGroup().location

@description('Resource group holding the shared Container Apps environment, Postgres server and registry.')
param sharedResourceGroup string
param containerAppsEnvironmentName string
param postgresServerName string
param registryName string

param keyVaultName string
param storageAccountName string

@description('Image for the API, worker and migrations job. deploy.sh passes the one currently running.')
param image string
param postgrestImage string = 'postgrest/postgrest:v12.2.3'

param tenantId string = subscription().tenantId
@description('Client id of the Entra app registration users sign in to.')
param entraClientId string

@description('GitHub OIDC subject trusted to deploy, e.g. repo:owner@id/name@id:ref:refs/heads/master.')
param githubOidcSubject string

@description('Custom hostname on the API app, and the managed certificate bound to it. Empty for none.')
param customDomainName string = ''
param customDomainCertificateId string = ''

@description('Subnet for a blob private endpoint, and the privatelink.blob DNS zone. Empty keeps public network access (Entra-only auth); production must set both.')
param storagePrivateEndpointSubnetId string = ''
param blobPrivateDnsZoneId string = ''

@description('False on the first pass, before deploy.sh has created the secrets the apps read.')
param deployApps bool = true

@description('Role assignments the retired infra/provision.sh already made in preview. Leave false there (re-creating them fails); true for new environments.')
param manageCoreRoleAssignments bool = true

var names = {
  identity: 'id-accelerate-${environmentName}'
  deployIdentity: 'id-accelerate-deploy${environmentName == 'preview' ? '' : '-${environmentName}'}'
  api: 'ca-accelerate-${environmentName}'
  pgrst: 'ca-accelerate-pgrst-${environmentName}'
  worker: 'ca-accelerate-worker-${environmentName}'
  migrate: 'caj-accelerate-migrate${environmentName == 'preview' ? '' : '-${environmentName}'}'
  database: 'accelerate'
}

var roles = {
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  containerRegistryTasksContributor: 'fb382eab-e894-4461-af04-94435c366c3f'
  containerAppsContributor: '358470bc-b998-42bd-ab17-a7e34c199c0a'
  containerAppsJobsContributor: 'b9a307c4-5aa3-4b52-ba60-2b17c136cd7b'
}

// ---------------------------------------------------------------------------
// Shared, referenced only
// ---------------------------------------------------------------------------
resource appsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
  scope: resourceGroup(sharedResourceGroup)
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
  scope: resourceGroup(sharedResourceGroup)
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' existing = {
  name: postgresServerName
  scope: resourceGroup(sharedResourceGroup)
}

// ---------------------------------------------------------------------------
// Identities and secrets
// ---------------------------------------------------------------------------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.identity
  location: location
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (manageCoreRoleAssignments) {
  name: guid(keyVault.id, identity.id, roles.keyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

module acrPull 'modules/registry-role.bicep' = if (manageCoreRoleAssignments) {
  name: 'acr-pull-${environmentName}'
  scope: resourceGroup(sharedResourceGroup)
  params: {
    registryName: registryName
    principalId: identity.properties.principalId
    roleDefinitionId: roles.acrPull
  }
}

// ---------------------------------------------------------------------------
// File storage: source files, rendered outputs, packages, screenshots.
// Entra-only (no shared keys, no anonymous access), versioned, soft-deleted.
// ---------------------------------------------------------------------------
var storagePrivate = !empty(storagePrivateEndpointSubnetId)

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: environmentName == 'prod' ? 'Standard_ZRS' : 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: storagePrivate ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: storagePrivate ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

// One container; paths are clients/{client_id}/… and global/…, and the API
// decides access from the database before touching a blob.
resource filesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'files'
  properties: { publicAccess: 'None' }
}

resource storageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, roles.storageBlobDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataContributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource blobEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (storagePrivate) {
  name: 'pe-${storageAccountName}-blob'
  location: location
  properties: {
    subnet: { id: storagePrivateEndpointSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: { privateLinkServiceId: storage.id, groupIds: ['blob'] }
      }
    ]
  }
}

resource blobEndpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (storagePrivate && !empty(blobPrivateDnsZoneId)) {
  parent: blobEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [{ name: 'blob', properties: { privateDnsZoneId: blobPrivateDnsZoneId } }]
  }
}

// ---------------------------------------------------------------------------
// Container apps
// ---------------------------------------------------------------------------
var kvUrl = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets'
func kvSecret(name string, kvUrl string, identityId string) object => {
  name: name
  keyVaultUrl: '${kvUrl}/${name}'
  identity: identityId
}
var registryConfig = [{ server: registry.properties.loginServer, identity: identity.id }]
var userIdentity = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${identity.id}': {} }
}

resource pgrst 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: names.pgrst
  location: location
  identity: userIdentity
  properties: {
    managedEnvironmentId: appsEnvironment.id
    configuration: {
      ingress: { external: false, targetPort: 3000, transport: 'auto' }
      secrets: [
        kvSecret('pgrst-db-uri', kvUrl, identity.id)
        kvSecret('pgrst-jwt-secret', kvUrl, identity.id)
      ]
    }
    template: {
      containers: [
        {
          name: 'postgrest'
          image: postgrestImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'PGRST_DB_URI', secretRef: 'pgrst-db-uri' }
            { name: 'PGRST_JWT_SECRET', secretRef: 'pgrst-jwt-secret' }
            { name: 'PGRST_DB_SCHEMAS', value: 'public' }
            { name: 'PGRST_SERVER_PORT', value: '3000' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: names.api
  location: location
  identity: userIdentity
  properties: {
    managedEnvironmentId: appsEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        customDomains: empty(customDomainName) ? [] : [
          { name: customDomainName, certificateId: customDomainCertificateId, bindingType: 'SniEnabled' }
        ]
      }
      registries: registryConfig
      secrets: [kvSecret('pgrst-jwt-secret', kvUrl, identity.id)]
    }
    template: {
      containers: [
        {
          name: names.api
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'AZURE_TENANT_ID', value: tenantId }
            { name: 'AZURE_CLIENT_ID', value: entraClientId }
            { name: 'PGRST_URL', value: 'http://${names.pgrst}' }
            { name: 'PGRST_JWT_SECRET', secretRef: 'pgrst-jwt-secret' }
            // AZURE_CLIENT_ID above is the sign-in app, so the managed identity gets its own name.
            { name: 'MANAGED_IDENTITY_CLIENT_ID', value: identity.properties.clientId }
            { name: 'STORAGE_BLOB_URL', value: storage.properties.primaryEndpoints.blob }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: names.worker
  location: location
  identity: userIdentity
  properties: {
    managedEnvironmentId: appsEnvironment.id
    configuration: {
      registries: registryConfig
      secrets: [kvSecret('worker-database-url', kvUrl, identity.id)]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: image
          command: ['node', 'worker/index.ts']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'worker-database-url' }
            { name: 'MANAGED_IDENTITY_CLIENT_ID', value: identity.properties.clientId }
            { name: 'STORAGE_BLOB_URL', value: storage.properties.primaryEndpoints.blob }
          ]
        }
      ]
      // One replica until jobs need more; claiming with SKIP LOCKED already allows several.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource migrate 'Microsoft.App/jobs@2024-03-01' = if (deployApps) {
  name: names.migrate
  location: location
  identity: userIdentity
  properties: {
    environmentId: appsEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registryConfig
      secrets: [
        kvSecret('migrate-database-url', kvUrl, identity.id)
        kvSecret('authenticator-password', kvUrl, identity.id)
        kvSecret('worker-password', kvUrl, identity.id)
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          command: ['node', 'server/migrate.js']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'migrate-database-url' }
            { name: 'AUTHENTICATOR_PASSWORD', secretRef: 'authenticator-password' }
            { name: 'WORKER_PASSWORD', secretRef: 'worker-password' }
          ]
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// GitHub Actions deploy identity (OIDC, no stored secret)
// ---------------------------------------------------------------------------
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.deployIdentity
  location: location
}

resource githubCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-master'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    audiences: ['api://AzureADTokenExchange']
    subject: githubOidcSubject
  }
}

resource deployAppsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (manageCoreRoleAssignments) {
  name: guid(resourceGroup().id, deployIdentity.id, roles.containerAppsContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.containerAppsContributor)
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployJobsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (manageCoreRoleAssignments) {
  name: guid(resourceGroup().id, deployIdentity.id, roles.containerAppsJobsContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.containerAppsJobsContributor)
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

module deployRegistryRole 'modules/registry-role.bicep' = if (manageCoreRoleAssignments) {
  name: 'acr-tasks-${environmentName}'
  scope: resourceGroup(sharedResourceGroup)
  params: {
    registryName: registryName
    principalId: deployIdentity.properties.principalId
    roleDefinitionId: roles.containerRegistryTasksContributor
  }
}

module deployEnvironmentRole 'modules/environment-role.bicep' = if (manageCoreRoleAssignments) {
  name: 'cae-join-${environmentName}'
  scope: resourceGroup(sharedResourceGroup)
  params: {
    environmentName: containerAppsEnvironmentName
    principalId: deployIdentity.properties.principalId
    roleDefinitionId: roles.containerAppsContributor
  }
}

output apiFqdn string = deployApps ? api!.properties.configuration.ingress.fqdn : ''
output deployClientId string = deployIdentity.properties.clientId
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output postgresAdmin string = postgres.properties.administratorLogin
output databaseName string = names.database
output storageBlobUrl string = storage.properties.primaryEndpoints.blob
