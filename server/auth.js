// Who is calling, and what PostgREST should treat them as.
//
// The browser signs in with MSAL and sends its Microsoft ID token on every
// request. We verify that token against the RevTech tenant's signing keys, map
// the email to a profile (creating it on first sign-in), and mint a short-lived
// JWT that PostgREST trusts: { role: 'authenticated', sub: <profile id> }. That
// is the same shape Supabase issued, so auth.uid() and every RLS policy in
// db/migrations work unchanged.

import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
// Internal-only Container Apps hostname: PostgREST is not reachable from outside
// the environment, so this server is the only way in.
export const PGRST_URL = process.env.PGRST_URL;
const JWT_SECRET = new TextEncoder().encode(process.env.PGRST_JWT_SECRET || '');

export function missingEnv() {
  return Object.entries({
    AZURE_TENANT_ID: TENANT_ID,
    AZURE_CLIENT_ID: CLIENT_ID,
    PGRST_URL,
    PGRST_JWT_SECRET: process.env.PGRST_JWT_SECRET,
  }).filter(([, value]) => !value).map(([name]) => name);
}

export const httpError = (status, message) => Object.assign(new Error(message), { status });

let _jwks = null;
function jwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));
  }
  return _jwks;
}

/* The caller's email, display name and guest status, from a verified Microsoft ID token.
   Client users are B2B guests in the RevTech tenant, so their tokens come from the
   same issuer as staff tokens; `idp` names their home tenant instead. */
async function verifyCaller(authHeader) {
  const token = /^Bearer\s+(.+)$/i.exec(authHeader || '')?.[1];
  if (!token) throw httpError(401, 'Missing bearer token.');

  let payload;
  try {
    // aud must be this app's client id and iss this tenant: a token minted for
    // another application, or another tenant, says nothing about this one.
    ({ payload } = await jwtVerify(token, jwks(), {
      audience: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    }));
  } catch {
    throw httpError(401, 'Sign-in could not be verified. Reload and try again.');
  }
  // A guest's preferred_username can be the tenant-local alias
  // (jane_client.com#EXT#@revtech.onmicrosoft.com); their real address is in email.
  const email = [payload.preferred_username, payload.email, payload.upn]
    .map(v => String(v || '').trim().toLowerCase())
    .find(v => v && !v.includes('#ext#'));
  if (!email) throw httpError(403, 'Your Microsoft token carries no email address.');
  const isGuest = Boolean(payload.idp) && payload.idp !== `https://sts.windows.net/${TENANT_ID}/`;
  return { email, name: String(payload.name || '').trim(), isGuest };
}

async function mintToken(claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(JWT_SECRET);
}

/* ensure_profile() is executable only by service_role (see 00100). */
async function ensureProfile({ email, name, isGuest }) {
  const res = await fetch(`${PGRST_URL}/rpc/ensure_profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await mintToken({ role: 'service_role' })}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_email: email, p_name: name, p_is_guest: isGuest }),
  });
  if (!res.ok) {
    throw httpError(502, `Could not load your profile. PostgREST said: ${await res.text()}`);
  }
  return res.json();
}

/* Profiles cached briefly so each database request doesn't cost an extra round
   trip. The database doesn't rely on it: its permission helpers read profiles
   and memberships themselves, so deactivation and role changes take effect there
   immediately; this cache only delays the friendlier "deactivated" message. */
const PROFILE_TTL_MS = 60_000;
const _profiles = new Map();

/* Verified caller -> their active profile. Throws with a `status`. */
export async function callerProfile(authHeader, { fresh = false } = {}) {
  const caller = await verifyCaller(authHeader);
  const cached = _profiles.get(caller.email);
  let profile = !fresh && cached && Date.now() - cached.at < PROFILE_TTL_MS ? cached.profile : null;
  if (!profile) {
    profile = await ensureProfile(caller);
    _profiles.set(caller.email, { profile, at: Date.now() });
  }
  if (!profile?.id) throw httpError(403, 'Your account could not be set up.');
  if (!profile.is_active) throw httpError(403, 'Your account has been deactivated. Contact an administrator.');
  return profile;
}

export function postgrestToken(profile) {
  return mintToken({ role: 'authenticated', sub: profile.id, email: profile.email });
}
