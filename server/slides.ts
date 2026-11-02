// A training draft's slides as a PowerPoint deck (db/migrations/00111), in the
// RevTech house style: white cover with the logo, cyan eyebrow and rule on
// each content slide, the two-part footer, navy section dividers and a navy
// closing slide. Geometry and palette follow the RevTech deck guide: 13.333 x
// 7.5 in, 0.62 in margins, nothing below 6.90 in except the footer.
//
// Speaker notes carry the trainer's script and where each slide came from, so
// a reviewer can see which slides were written without a source.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';

// The package's types describe a CommonJS default export; Node loads its ES
// build, whose default export is the class itself.
const PptxGenJS = pptxgen as unknown as typeof pptxgen.default;
type Slide = ReturnType<InstanceType<typeof PptxGenJS>['addSlide']>;

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const LOGO_DARK = `data:image/png;base64,${readFileSync(path.join(ASSETS, 'revtech-logo-dark.png')).toString('base64')}`;
const LOGO_LIGHT = `data:image/png;base64,${readFileSync(path.join(ASSETS, 'revtech-logo-light.png')).toString('base64')}`;
const LOGO_RATIO = 1047 / 2880;

const ACCENT = '0EA5C7';
const INK = '293241';
const BRAND = '33669A';
const BODY = '4A5568';
const MUTED = '64748B';
const ON_DARK = 'B6C7D8';
const WHITE = 'FFFFFF';
const HEADING = 'Plus Jakarta Sans';
const TEXT = 'DM Sans';
const LABEL = 'Oswald';

const W = 13.333;
const M = 0.62;
const CONTENT_W = W - 2 * M;
const FOOTER_Y = 6.99;

type Cited = { citations: string[]; label: 'source' | 'ai_generated' };
export type DeckContent = {
  title: string;
  audience: string;
  duration_minutes: number;
  summary: string;
  objectives: string[];
  sections: { heading: string; slides: ({ title: string; bullets: string[]; notes: string; media: string } & Cited)[] }[];
  quiz: ({ question: string; choices: string[]; correct: number[]; explanation: string } & Cited)[];
  sources: { ref: string; asset_id: string; title: string }[];
};
export type Picture = { data: Buffer; mediaType: string; width: number; height: number };

/** Width and height in pixels of a PNG or JPEG, or null for anything else. */
export function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      const length = data.readUInt16BE(i + 2);
      // Start-of-frame markers carry the size; C4, C8 and CC are other segments.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
      }
      i += 2 + length;
    }
  }
  return null;
}

export async function renderSlides(
  content: DeckContent,
  { clientName, classification, pictures }: { clientName: string; classification: string; pictures: Map<string, Picture> },
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.company = 'Revelation Technologies';
  pptx.title = content.title;

  const sourceTitles = (citations: string[]) =>
    [...new Set(citations.map((c) => content.sources.find((s) => s.ref === c.split('.')[0])?.title ?? c))].join('; ');
  const provenance = (part: Cited) =>
    part.label === 'source'
      ? `Source: ${sourceTitles(part.citations)} (${part.citations.join(', ')})`
      : 'AI-generated: no source document was cited. Check it before presenting.';

  let page = 1;
  const footer = (slide: Slide) => {
    slide.addText(`Revelation Technologies  ·  Draft  ·  ${classification}`, {
      x: M, y: FOOTER_Y, w: 7, h: 0.3, fontFace: TEXT, fontSize: 8, color: MUTED, margin: 0,
    });
    slide.addText(
      [
        { text: `${clientName}   `, options: { color: MUTED } },
        { text: String(page).padStart(2, '0'), options: { color: ACCENT, bold: true } },
      ],
      { x: W - M - 5, y: FOOTER_Y, w: 5, h: 0.3, fontFace: TEXT, fontSize: 8, align: 'right', margin: 0 },
    );
  };
  const contentSlide = (eyebrow: string, title: string) => {
    page++;
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    slide.addText(eyebrow.toUpperCase(), {
      x: M, y: 0.42, w: CONTENT_W, h: 0.3, fontFace: LABEL, fontSize: 10, color: ACCENT, charSpacing: 3, margin: 0,
    });
    slide.addText(title, {
      x: M, y: 0.76, w: CONTENT_W, h: 0.6, fontFace: HEADING, fontSize: 25, bold: true, color: INK, margin: 0, fit: 'shrink',
    });
    slide.addShape(pptx.ShapeType.rect, { x: M, y: 1.45, w: 1.2, h: 0.04, fill: { color: ACCENT }, line: { color: ACCENT } });
    footer(slide);
    return slide;
  };
  const darkSlide = () => {
    const slide = pptx.addSlide();
    slide.background = { color: INK };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: ACCENT }, line: { color: ACCENT } });
    return slide;
  };
  const divider = (numeral: string, title: string) => {
    page++;
    const slide = darkSlide();
    slide.addText(numeral, { x: M + 0.2, y: 2.2, w: 3, h: 1, fontFace: LABEL, fontSize: 54, color: ACCENT, margin: 0 });
    slide.addText(title, {
      x: M + 0.2, y: 3.25, w: CONTENT_W - 0.4, h: 1.2, fontFace: HEADING, fontSize: 30, bold: true, color: WHITE, margin: 0, fit: 'shrink',
    });
  };
  const bullets = (slide: Slide, lines: string[], w: number, marked = true) =>
    slide.addText(
      lines.map((text) => ({ text, options: { bullet: marked ? { indent: 18 } : false, paraSpaceAfter: 10 } })),
      { x: M, y: 1.75, w, h: 5.0, fontFace: TEXT, fontSize: 20, color: BODY, valign: 'top', margin: 0, fit: 'shrink' },
    );

  // Cover
  const cover = pptx.addSlide();
  cover.background = { color: WHITE };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 2.4, h: 0.08, fill: { color: ACCENT }, line: { color: ACCENT } });
  cover.addShape(pptx.ShapeType.rect, { x: 2.4, y: 0, w: W - 2.4, h: 0.08, fill: { color: INK }, line: { color: INK } });
  cover.addImage({ data: LOGO_DARK, x: M, y: 0.42, w: 2.2, h: 2.2 * LOGO_RATIO });
  cover.addText(`TRAINING FOR ${clientName.toUpperCase()}  ·  DRAFT FOR REVIEW`, {
    x: M, y: 1.55, w: CONTENT_W, h: 0.3, fontFace: LABEL, fontSize: 10, color: ACCENT, charSpacing: 4, margin: 0,
  });
  cover.addText(content.title, {
    x: M, y: 1.85, w: CONTENT_W, h: 0.9, fontFace: HEADING, fontSize: 38, bold: true, color: INK, margin: 0, fit: 'shrink',
  });
  cover.addText(`For ${content.audience}  ·  About ${content.duration_minutes} minutes`, {
    x: M, y: 2.75, w: CONTENT_W, h: 0.4, fontFace: HEADING, fontSize: 16, bold: true, color: BRAND, margin: 0,
  });
  cover.addShape(pptx.ShapeType.rect, { x: M, y: 3.24, w: CONTENT_W, h: 0.03, fill: { color: ACCENT }, line: { color: ACCENT } });
  cover.addText(content.summary, {
    x: M, y: 3.45, w: 6.6, h: 3.2, fontFace: TEXT, fontSize: 14, color: BODY, valign: 'top', margin: 0, fit: 'shrink',
  });
  if (content.objectives.length) {
    cover.addText('LEARNING OBJECTIVES', { x: 7.75, y: 3.45, w: 4.96, h: 0.3, fontFace: LABEL, fontSize: 10, color: ACCENT, charSpacing: 3, margin: 0 });
    cover.addText(
      content.objectives.map((text) => ({ text, options: { bullet: { code: '25A0', indent: 14 }, paraSpaceAfter: 6 } })),
      { x: 7.75, y: 3.8, w: 4.96, h: 2.9, fontFace: TEXT, fontSize: 12, color: BODY, valign: 'top', margin: 0, fit: 'shrink' },
    );
  }
  cover.addText(`Revelation Technologies  ·  revtech.consulting  ·  ${classification}`, {
    x: M, y: FOOTER_Y, w: CONTENT_W, h: 0.3, fontFace: TEXT, fontSize: 8, color: MUTED, margin: 0,
  });
  cover.addNotes(`${content.summary}\n\nThis deck is a draft written with AI. Each slide's notes say which source it came from, or that it was AI-generated and needs checking.`);

  // Sections; dividers once there are four or more real sections.
  const withSlides = content.sections.filter((s) => s.slides.length);
  withSlides.forEach((section, i) => {
    if (withSlides.length >= 4) divider(String(i + 1).padStart(2, '0'), section.heading);
    for (const s of section.slides) {
      const slide = contentSlide(section.heading, s.title);
      const picture = s.media ? pictures.get(s.media) : undefined;
      if (picture) {
        bullets(slide, s.bullets, 6.9);
        const box = { x: 7.75, y: 1.75, w: W - M - 7.75, h: 5.0 };
        const scale = Math.min(box.w / picture.width, box.h / picture.height);
        const w = picture.width * scale;
        const h = picture.height * scale;
        slide.addImage({
          data: `data:${picture.mediaType};base64,${picture.data.toString('base64')}`,
          x: box.x + (box.w - w) / 2, y: box.y, w, h,
        });
      } else {
        bullets(slide, s.bullets, CONTENT_W);
      }
      slide.addNotes(`${s.notes}\n\n${provenance(s)}`);
    }
  });

  // Knowledge check: one question per slide, the answer in the notes.
  if (content.quiz.length) {
    divider('?', 'Knowledge check');
    content.quiz.forEach((q, i) => {
      const slide = contentSlide(`Knowledge check  ·  Question ${i + 1} of ${content.quiz.length}`, q.question);
      bullets(slide, q.choices.map((choice, j) => `${String.fromCharCode(65 + j)}.  ${choice}`), CONTENT_W, false);
      const answer = q.correct.map((c) => String.fromCharCode(65 + c)).join(', ');
      slide.addNotes(`Answer: ${answer}. ${q.explanation}\n\n${provenance(q)}`);
    });
  }

  // Closing
  const closing = darkSlide();
  closing.addImage({ data: LOGO_LIGHT, x: M + 0.2, y: 0.6, w: 2.2, h: 2.2 * LOGO_RATIO });
  closing.addText('THANK YOU', { x: M + 0.2, y: 2.3, w: 6, h: 0.3, fontFace: LABEL, fontSize: 10, color: ACCENT, charSpacing: 4, margin: 0 });
  closing.addText('Questions?', { x: M + 0.2, y: 2.65, w: CONTENT_W, h: 0.9, fontFace: HEADING, fontSize: 38, bold: true, color: WHITE, margin: 0 });
  closing.addShape(pptx.ShapeType.rect, { x: M + 0.2, y: 3.7, w: 1.2, h: 0.04, fill: { color: ACCENT }, line: { color: ACCENT } });
  closing.addText(content.objectives.length ? `You can now:\n${content.objectives.map((o) => `•  ${o}`).join('\n')}` : content.summary, {
    x: M + 0.2, y: 3.95, w: 8, h: 2.7, fontFace: TEXT, fontSize: 14, color: ON_DARK, valign: 'top', margin: 0, fit: 'shrink',
  });
  closing.addText('Revelation Technologies  ·  revtech.consulting', {
    x: M + 0.2, y: FOOTER_Y, w: CONTENT_W, h: 0.3, fontFace: TEXT, fontSize: 8, color: ON_DARK, margin: 0,
  });

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
