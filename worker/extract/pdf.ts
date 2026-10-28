// PDF: the text layer, page by page. Pages with (almost) no text are probably
// scanned images; they're counted so the caller can send them for OCR.

import { group, type Chunk } from './chunk.ts'

/** Below this many letters or digits, a page is treated as an image. */
const MIN_PAGE_TEXT = 20

export async function extractPdf(buffer: Buffer): Promise<{ chunks: Chunk[]; pages: number; imagePages: number[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
  let doc
  try {
    doc = await task.promise
  } catch {
    await task.destroy()
    throw new Error('The file could not be opened as a PDF.')
  }

  const pieces: { text: string; page: number }[] = []
  const imagePages: number[] = []
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (text.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_PAGE_TEXT) imagePages.push(page)
      else pieces.push({ text, page })
    }
    return {
      chunks: group(pieces, (p) => String(p.page), (run) => ({ page: run[0].page })),
      pages: doc.numPages,
      imagePages,
    }
  } finally {
    await task.destroy()
  }
}
