// Provider keys live in Key Vault, named by each provider's config.key_vault_secret.
// In Azure the worker reads them with its managed identity; locally, with your
// az login (DefaultAzureCredential), or from an environment variable of the
// same name in upper snake case (anthropic-api-key -> ANTHROPIC_API_KEY).
//
//   KEY_VAULT_URL               e.g. https://kv-accelerate-0ae49a.vault.azure.net
//   MANAGED_IDENTITY_CLIENT_ID  the user-assigned identity the apps run as

import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'

// Long enough to avoid a Key Vault round trip per call, short enough that a rotated key is picked up.
const TTL_MS = 10 * 60_000
const cache = new Map<string, { value: string; expires: number }>()
let client: SecretClient | undefined

export async function getSecret(name: string): Promise<string> {
  const hit = cache.get(name)
  if (hit && hit.expires > Date.now()) return hit.value

  const fromEnv = process.env[name.toUpperCase().replace(/-/g, '_')]
  let value: string | undefined
  if (fromEnv) {
    value = fromEnv
  } else if (process.env.KEY_VAULT_URL) {
    client ??= new SecretClient(
      process.env.KEY_VAULT_URL,
      new DefaultAzureCredential({ managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID }),
    )
    value = (await client.getSecret(name)).value
  }
  if (!value) throw new Error(`Secret "${name}" is not in Key Vault (or the environment).`)

  cache.set(name, { value, expires: Date.now() + TTL_MS })
  return value
}
