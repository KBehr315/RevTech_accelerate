// Uploading and downloading knowledge files (db/migrations/00103).
//
//   PUT /api/upload?filename=…&client_id=…   the raw file as the body, one file per request
//   GET /api/files/:id                        the file, if the caller may read it and it passed its scan
//
// The database decides who may do what; this server only moves bytes. It
// streams the body to Blob Storage while counting and hashing it, so the size
// and SHA-256 the database records are what was stored, not what the browser claimed.

import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import type { Request, Response } from 'express';
import { callerProfile, httpError, postgrestToken, rpc, serviceToken, type HttpError } from './auth.ts';
import { filesContainer } from './storage.ts';

type SourceFile = { id: string; blob_path: string; mime_type: string | null };

export async function upload(req: Request, res: Response, sendError: (res: Response, err: Partial<HttpError>) => void) {
  let file: SourceFile | undefined;
  try {
    const profile = await callerProfile(req.headers.authorization);
    const container = filesContainer();
    if (!container) throw httpError(503, 'File storage is not configured in this environment.');
    const declared = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(declared) || declared <= 0) throw httpError(411, 'The upload needs a Content-Length.');

    file = await rpc<SourceFile>(await postgrestToken(profile), 'start_upload', {
      p_client_id: req.query.client_id || null,
      p_filename: String(req.query.filename ?? ''),
      p_mime_type: req.headers['content-type'] ?? null,
      p_bytes: declared,
    });

    const hash = createHash('sha256');
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        if (received > declared) return done(httpError(400, 'The file is larger than its declared size.'));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    req.on('error', (err) => meter.destroy(err));
    await container.getBlockBlobClient(file.blob_path).uploadStream(req.pipe(meter), 4 * 1024 * 1024, 4, {
      blobHTTPHeaders: { blobContentType: file.mime_type || 'application/octet-stream' },
    });
    if (received !== declared) throw httpError(400, 'The upload was interrupted. Try again.');

    const asset = await rpc(await serviceToken(), 'complete_upload', {
      p_file_id: file.id,
      p_bytes: received,
      p_sha256: hash.digest('hex'),
    });
    res.status(201).json(asset);
  } catch (err) {
    if (file) {
      await rpc(await serviceToken(), 'fail_upload', { p_file_id: file.id }).catch(() => {});
      await filesContainer()?.getBlockBlobClient(file.blob_path).deleteIfExists().catch(() => {});
    }
    sendError(res, err as HttpError);
  }
}

export async function download(req: Request, res: Response, sendError: (res: Response, err: Partial<HttpError>) => void) {
  try {
    const profile = await callerProfile(req.headers.authorization);
    const container = filesContainer();
    if (!container) throw httpError(503, 'File storage is not configured in this environment.');
    const [file] = await rpc<{ blob_path: string; filename: string; mime_type: string | null }[]>(
      await postgrestToken(profile), 'file_for_download', { p_file_id: req.params.id },
    );

    const blob = await container.getBlobClient(file.blob_path).download();
    res.set({
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    if (blob.contentLength !== undefined) res.set('Content-Length', String(blob.contentLength));
    blob.readableStreamBody!.pipe(res);
  } catch (err) {
    sendError(res, err as HttpError);
  }
}
