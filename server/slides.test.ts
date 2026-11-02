// The PowerPoint built from a training draft: slide order, speaker notes with
// where each slide came from, the answer key in the notes, and pictures.

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { imageSize, renderSlides, type DeckContent } from './slides.ts';

/** A 4 x 2 PNG: signature, then an IHDR chunk holding width and height. */
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]),
  Buffer.from([0, 0, 0, 4, 0, 0, 0, 2, 8, 6, 0, 0, 0]),
]);

const content: DeckContent = {
  title: 'Post a General Journal Entry',
  audience: 'GL accountants',
  duration_minutes: 20,
  summary: 'How to post a journal entry in S/4HANA.',
  objectives: ['Post a journal entry', 'Fix a rejected entry'],
  sections: [
    {
      heading: 'Posting',
      slides: [
        { title: 'Open the app', bullets: ['Use Post General Journal Entries (FB50)'], notes: 'Show the app.', media: 'image:S1', citations: ['S1.1'], label: 'source' },
        { title: 'Why it matters', bullets: ['Accurate books'], notes: 'Explain.', media: '', citations: [], label: 'ai_generated' },
      ],
    },
    { heading: 'Lesson only', slides: [] },
  ],
  quiz: [{ question: 'Which app posts?', choices: ['FB50', 'ME21N'], correct: [0], explanation: 'FB50 posts entries.', citations: [], label: 'ai_generated' }],
  sources: [{ ref: 'S1', asset_id: 'a1', title: 'Meridian GL procedure' }],
};

async function render() {
  const deck = await renderSlides(content, {
    clientName: 'Meridian Aerostructures',
    classification: 'Client Confidential',
    pictures: new Map([['image:S1', { data: png, mediaType: 'image/png', width: 4, height: 2 }]]),
  });
  return JSZip.loadAsync(deck);
}

const xmlText = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' ');

describe('renderSlides', () => {
  it('builds cover, content slides, the knowledge check and a closing slide', async () => {
    const zip = await render();
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    // Cover, 2 content slides, a "Knowledge check" divider, 1 question, closing. No dividers for 1 section.
    expect(slides).toHaveLength(6);
    const text = async (n: number) => xmlText(await zip.file(`ppt/slides/slide${n}.xml`)!.async('string'));
    expect(await text(1)).toContain('Post a General Journal Entry');
    expect(await text(1)).toContain('Client Confidential');
    expect(await text(2)).toContain('Open the app');
    expect(await text(2)).toMatch(/Draft {2}· {2}Client Confidential/);
    expect(await text(2)).toContain('02');
    expect(await text(5)).toContain('A.  FB50');
    expect(await text(6)).toContain('Questions?');
  });

  it('puts the script and the source, or an AI-generated warning, in the speaker notes', async () => {
    const zip = await render();
    const notes = await Promise.all(
      Object.keys(zip.files)
        .filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()))
        .map(async (f) => xmlText(await zip.file(f)!.async('string'))),
    );
    expect(notes.join('|')).toContain('Show the app.');
    expect(notes.join('|')).toContain('Source: Meridian GL procedure (S1.1)');
    expect(notes.join('|')).toContain('AI-generated: no source document was cited');
    expect(notes.join('|')).toContain('Answer: A. FB50 posts entries.');
  });

  it('places the picture on its slide', async () => {
    const zip = await render();
    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
    // Two logos and the picture.
    expect(media.length).toBeGreaterThanOrEqual(3);
  });
});

describe('imageSize', () => {
  it('reads PNG dimensions and ignores other files', () => {
    expect(imageSize(png)).toEqual({ width: 4, height: 2 });
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });
});
