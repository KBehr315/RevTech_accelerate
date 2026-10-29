// Serves the built frontend (web/dist) and the API from one container, the same
// arrangement as RevelationHub's ca-revhub-api-preview.
//
//   GET  /api/me     the caller's profile, created on first sign-in
//   *    /api/db/*   forwarded to PostgREST as the caller (see server/auth.ts)
//   PUT  /api/upload, GET /api/files/:id   knowledge files (see server/files.ts)
//   GET  /healthz    liveness probe

import express, { type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callerProfile, missingEnv, postgrestToken, PGRST_URL, refuseWriteWhilePreviewing, viewAs, type HttpError } from './auth.ts';
import { download, upload } from './files.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'web', 'dist');

// Request and response headers postgrest-js relies on (counts, upserts, single-row reads).
const FORWARD_REQUEST_HEADERS = ['accept', 'content-type', 'prefer', 'range', 'range-unit'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'content-range', 'preference-applied', 'location'];

function sendError(res: Response, err: Partial<HttpError>) {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Unexpected server error.' });
}

const missing = missingEnv();
if (missing.length) {
  console.error(`Startup failed: missing ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.get('/api/me', async (req, res) => {
  try {
    res.json(await callerProfile(req.headers.authorization, { fresh: true }));
  } catch (err) {
    sendError(res, err as HttpError);
  }
});

app.use('/api/db', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  try {
    // The root path is PostgREST's schema description; the app never needs it.
    if (req.path === '/') return res.status(404).json({ message: 'Not found.' });

    const profile = await callerProfile(req.headers.authorization);
    const preview = viewAs(req.headers['x-view-as']);
    refuseWriteWhilePreviewing(req.method, preview);
    const headers: Record<string, string> = { Authorization: `Bearer ${await postgrestToken(profile, preview)}` };
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }

    const upstream = await fetch(`${PGRST_URL}${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) || !req.body?.length ? undefined : req.body,
    });

    res.status(upstream.status);
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.set(name, value);
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    sendError(res, err as HttpError);
  }
});

// No body parser: the file streams straight through to Blob Storage.
app.put('/api/upload', (req, res) => upload(req, res, sendError));
app.get('/api/files/:id', (req, res) => download(req, res, sendError));

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));

// Vite fingerprints everything under /assets, so those can be cached for good.
// index.html cannot: it is how a browser learns a new deploy exists.
app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(DIST, { index: false }));
app.use((req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(DIST, 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on ${port}`));
