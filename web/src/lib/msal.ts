import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID

if (!clientId || !tenantId) {
  console.warn('Missing VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID. See web/.env.example.')
}

export const msal = new PublicClientApplication({
  auth: {
    clientId: clientId ?? '',
    authority: `https://login.microsoftonline.com/${tenantId ?? 'common'}`,
    redirectUri: `${window.location.origin}/`,
    postLogoutRedirectUri: `${window.location.origin}/login`,
  },
  cache: { cacheLocation: 'localStorage' },
})

const LOGIN_SCOPES = ['openid', 'profile', 'email']

// initialize() and handleRedirectPromise() must each run once per page load,
// and StrictMode mounts App twice in development.
let _ready: Promise<AccountInfo | null> | null = null
export function msalReady(): Promise<AccountInfo | null> {
  _ready ??= (async () => {
    await msal.initialize()
    const result = await msal.handleRedirectPromise()
    const account = result?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
    if (account) msal.setActiveAccount(account)
    return account
  })()
  return _ready
}

export function signIn(): Promise<void> {
  return msal.loginRedirect({ scopes: LOGIN_SCOPES, prompt: 'select_account' })
}

export function signOut(): Promise<void> {
  return msal.logoutRedirect({ account: msal.getActiveAccount() })
}

/** The Microsoft ID token the API server verifies (its audience is this app's client id). */
export async function getIdToken(): Promise<string> {
  await msalReady()
  const account = msal.getActiveAccount()
  if (!account) throw new Error('Not signed in')

  // An ID token outlives its usefulness after an hour; refresh it a little early.
  const exp = account.idTokenClaims?.exp ?? 0
  const forceRefresh = exp * 1000 < Date.now() + 5 * 60_000
  try {
    const result = await msal.acquireTokenSilent({ scopes: LOGIN_SCOPES, account, forceRefresh })
    return result.idToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: LOGIN_SCOPES, account })
    }
    throw err
  }
}
