// Reading text from images and scanned PDF pages with an AI model, through
// the model gateway (so the classification and client checks apply).
//
// Transcription only: the model is asked for the text on the page, nothing
// else, at low effort. Scanned PDF pages go in batches, each batch a new PDF
// holding just those pages, so a long scan never needs one huge response.

import { PDFDocument } from 'pdf-lib'
import type { Completion, CompletionRequest } from '../ai/gateway.ts'
import { splitLong, type Chunk } from './chunk.ts'

export type Complete = (request: Omit<CompletionRequest, 'purpose' | 'classification' | 'clientId'>) => Promise<Completion>

const PAGES_PER_CALL = 10

const INSTRUCTIONS = `Transcribe all of the text in the attached file, exactly as written.
- Keep the reading order. Write tables as one row per line, with cells separated by " | ".
- Include text in screenshots, such as field labels, values, menu items and transaction codes.
- Do not describe images, summarize, translate, correct or comment. Output only the transcription.
- If there is no text, output nothing.`

const pageMarker = (n: number) => `=== Page ${n} ===`

/** Text of an image, as chunks. */
export async function ocrImage(complete: Complete, image: Buffer, mediaType: 'image/png' | 'image/jpeg'): Promise<Chunk[]> {
  const { text } = await complete({
    messages: [{ role: 'user', content: INSTRUCTIONS }],
    attachments: [{ mediaType, data: image }],
    effort: 'low',
  })
  return splitLong(text).map((part) => ({ text: part, locator: { ocr: 'image' } }))
}

/** Text of the given pages of a PDF (1-based), as chunks located by page. */
export async function ocrPdfPages(complete: Complete, pdf: Buffer, pages: number[]): Promise<Chunk[]> {
  const source = await PDFDocument.load(pdf, { ignoreEncryption: true })
  const chunks: Chunk[] = []
  for (let i = 0; i < pages.length; i += PAGES_PER_CALL) {
    const batch = pages.slice(i, i + PAGES_PER_CALL)
    const part = await PDFDocument.create()
    for (const page of await part.copyPages(source, batch.map((p) => p - 1))) part.addPage(page)

    const { text } = await complete({
      messages: [
        {
          role: 'user',
          content: `${INSTRUCTIONS}\n- The file has ${batch.length} page${batch.length === 1 ? '' : 's'}. Begin each page with a line "${pageMarker(1)}", "${pageMarker(2)}" and so on, even if the page has no text.`,
        },
      ],
      attachments: [{ mediaType: 'application/pdf', data: Buffer.from(await part.save()) }],
      effort: 'low',
    })
    chunks.push(...splitByPage(text, batch))
  }
  return chunks
}

/** Splits a transcription on its page markers, mapping batch page numbers back to the original pages. */
export function splitByPage(text: string, originalPages: number[]): Chunk[] {
  const chunks: Chunk[] = []
  const sections = text.split(/^=== Page (\d+) ===\s*$/m)
  // sections: [before first marker, n, text, n, text, ...]
  if (sections.length === 1) {
    // No markers: keep it all, attributed to the first page of the batch.
    for (const part of splitLong(text)) chunks.push({ text: part, locator: { page: originalPages[0], ocr: 'page' } })
    return chunks
  }
  for (let i = 1; i < sections.length; i += 2) {
    const page = originalPages[Number(sections[i]) - 1]
    if (page === undefined) continue
    for (const part of splitLong(sections[i + 1] ?? '')) chunks.push({ text: part, locator: { page, ocr: 'page' } })
  }
  return chunks
}
