// Text extraction for knowledge files: file -> chunks with locators.
//
// Deterministic parsers only; nothing here calls an AI provider. Files with no
// text layer (images, scanned PDFs) come back as 'needs_ocr' for the OCR step.

import { group, type Chunk } from './chunk.ts'
import { extractDocx } from './docx.ts'
import { extractPdf } from './pdf.ts'
import { extractPptx } from './pptx.ts'
import { extractXlsx } from './xlsx.ts'

export type { Chunk, Locator } from './chunk.ts'

export type Extraction = {
  status: 'done' | 'needs_ocr'
  chunks: Chunk[]
  /** Shown next to the file: what was read, and anything a person should know. */
  detail: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function decodeText(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

function extractTxt(buffer: Buffer): Chunk[] {
  const lines = decodeText(buffer).split('\n')
  // Paragraphs (runs of non-blank lines) are the pieces; their line numbers the locator.
  const pieces: { text: string; first: number; last: number }[] = []
  let start = -1
  lines.forEach((line, i) => {
    if (line.trim() && start < 0) start = i
    if ((!line.trim() || i === lines.length - 1) && start >= 0) {
      const end = line.trim() ? i : i - 1
      pieces.push({ text: lines.slice(start, end + 1).join('\n'), first: start + 1, last: end + 1 })
      start = -1
    }
  })
  return group(pieces, () => '', (run) => ({ lines: `${run[0].first}-${run[run.length - 1].last}` }))
}

function extractCsv(buffer: Buffer): Chunk[] {
  const rows = decodeText(buffer).split('\n')
  const header = rows[0]?.trim() ?? ''
  const pieces = rows.slice(1).map((text, i) => ({ text, row: i + 2 }))
  return group(
    pieces,
    () => '',
    (run) => ({ rows: `${run[0].row}-${run[run.length - 1].row}` }),
    () => (header ? `${header}\n` : ''),
  )
}

export async function extract(buffer: Buffer, filename: string): Promise<Extraction> {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'docx': {
      const chunks = await extractDocx(buffer)
      return { status: 'done', chunks, detail: `Read ${plural(chunks.length, 'passage')}.` }
    }
    case 'pptx': {
      const chunks = await extractPptx(buffer)
      const slides = new Set(chunks.map((c) => c.locator.slide)).size
      return { status: 'done', chunks, detail: `Read ${plural(slides, 'slide')} with text.` }
    }
    case 'xlsx': {
      const chunks = await extractXlsx(buffer)
      const sheets = new Set(chunks.map((c) => c.locator.sheet)).size
      return { status: 'done', chunks, detail: `Read ${plural(sheets, 'sheet')}.` }
    }
    case 'pdf': {
      const { chunks, pages, imagePages } = await extractPdf(buffer)
      if (!chunks.length) {
        return { status: 'needs_ocr', chunks, detail: `None of the ${plural(pages, 'page')} has a text layer; it looks scanned.` }
      }
      const scanned = imagePages.length
        ? ` ${plural(imagePages.length, 'page')} had no text (scanned?): ${imagePages.slice(0, 10).join(', ')}${imagePages.length > 10 ? '…' : ''}.`
        : ''
      return { status: 'done', chunks, detail: `Read ${plural(pages - imagePages.length, 'page')}.${scanned}` }
    }
    case 'txt': {
      const chunks = extractTxt(buffer)
      return { status: 'done', chunks, detail: `Read ${plural(chunks.length, 'passage')}.` }
    }
    case 'csv': {
      const chunks = extractCsv(buffer)
      return { status: 'done', chunks, detail: `Read ${plural(chunks.length, 'passage')}.` }
    }
    case 'png':
    case 'jpg':
    case 'jpeg':
      return { status: 'needs_ocr', chunks: [], detail: 'An image: its text needs reading (OCR).' }
    default:
      throw new Error(`No reader for .${ext} files.`)
  }
}
