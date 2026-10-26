// A role on the shared Container Apps environment (another resource group).
// The deploy identity needs it to place apps in the environment; there are no
// container apps under the environment's own scope, so it grants nothing else.

param environmentName string
param principalId string
param roleDefinitionId string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource assignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(environment.id, principalId, roleDefinitionId)
  scope: environment
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
