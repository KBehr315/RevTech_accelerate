// Downloading a training draft (db/migrations/00111).
//
//   GET /api/training/:id/slides.pptx   the draft's slides as a PowerPoint deck
//
// Everything is read through PostgREST as the caller, so RLS decides whether
// they may see the draft, its documents and their pictures.

import type { Request, Response } from 'express';
import { callerProfile, httpError, PGRST_URL, postgrestToken, rpc, viewAs, type HttpError } from './auth.ts';
import { imageSize, renderSlides, type DeckContent, type Picture } from './slides.ts';
import { filesContainer } from './storage.ts';

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'client_confidential', 'controlled', 'export_controlled'];
const CLASSIFICATION_LABELS: Record<string, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  client_confidential: 'Client Confidential',
  controlled: 'Controlled',
  export_controlled: 'Export Controlled',
};

type DraftRow = {
  title: string;
  status: string;
  outputs: string[];
  asset_ids: string[];
  content: DeckContent | null;
  client: { name: string; max_classification: string };
};
type AssetRow = {
  id: string;
  security_classification: string;
  current: { file: { id: string; filename: string; mime_type: string | null } | null } | null;
};

async function select<T>(token: string, query: string): Promise<T[]> {
  const res = await fetch(`${PGRST_URL}/${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw httpError(502, `Reading ${query.split('?')[0]} failed (${res.status}).`);
  return res.json() as Promise<T[]>;
}

export async function downloadSlides(req: Request, res: Response, sendError: (res: Response, err: Partial<HttpError>) => void) {
  try {
    const profile = await callerProfile(req.headers.authorization);
    const token = await postgrestToken(profile, viewAs(req.headers['x-view-as']));
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw httpError(404, 'No such draft.');

    const [draft] = await select<DraftRow>(
      token,
      `training_drafts?id=eq.${id}&select=title,status,outputs,asset_ids,content,client:clients(name,max_classification)`,
    );
    if (!draft) throw httpError(404, "This draft doesn't exist, or you can't see it.");
    if (draft.status !== 'ready' || !draft.content) throw httpError(409, "The draft isn't finished yet.");
    if (!draft.outputs.includes('slides')) throw httpError(409, "This draft wasn't made with a PowerPoint deck.");

    const assets = draft.asset_ids.length
      ? await select<AssetRow>(
          token,
          `knowledge_assets?id=in.(${draft.asset_ids.join(',')})&select=id,security_classification,` +
            'current:knowledge_asset_versions!knowledge_assets_current_version_id_fkey(file:source_files!knowledge_asset_versions_source_file_id_fkey(id,filename,mime_type))',
        )
      : [];

    // The highest of what was typed in this client and the documents used (as 00111 sends to the model).
    const rank = (c: string) => CLASSIFICATIONS.indexOf(c);
    const typed = rank(draft.client.max_classification) < rank('client_confidential') ? draft.client.max_classification : 'client_confidential';
    const classification = [typed, ...assets.map((a) => a.security_classification)].sort((a, b) => rank(b) - rank(a))[0];

    const pictures = new Map<string, Picture>();
    const used = new Set(draft.content.sections.flatMap((s) => s.slides.map((slide) => slide.media)).filter((m) => m.startsWith('image:')));
    const container = filesContainer();
    for (const media of used) {
      const ref = media.slice('image:'.length);
      const assetId = draft.content.sources.find((s) => s.ref === ref)?.asset_id;
      const file = assets.find((a) => a.id === assetId)?.current?.file;
      if (!file || !container) continue;
      try {
        const [stored] = await rpc<{ blob_path: string; mime_type: string | null }[]>(token, 'file_for_download', { p_file_id: file.id });
        const data = await container.getBlobClient(stored.blob_path).downloadToBuffer();
        const size = imageSize(data);
        if (size) pictures.set(media, { data, mediaType: data[0] === 0xff ? 'image/jpeg' : 'image/png', ...size });
      } catch {
        // A picture that can't be read is left off its slide; the rest of the deck still downloads.
      }
    }

    const deck = await renderSlides(draft.content, {
      clientName: draft.client.name,
      classification: CLASSIFICATION_LABELS[classification] ?? classification,
      pictures,
    });
    const filename = `${draft.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Training'}.pptx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(deck.length),
      'Cache-Control': 'private, no-store',
    });
    res.send(deck);
  } catch (err) {
    sendError(res, err as HttpError);
  }
}
