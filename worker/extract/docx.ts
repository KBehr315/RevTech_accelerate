// Word (.docx): paragraphs grouped under their heading path, and tables row by
// row with the header row repeated at the top of each chunk, so a test-script
// step reads as "Step | Action | Expected result" even out of context.

import { group, type Chunk, type Locator } from './chunk.ts'
import { attr, childrenOf, find, findAll, openZip, readXml, tagOf, textOf, type XmlNode } from './ooxml.ts'

type Piece = { text: string; heading: string[]; table?: number; row?: number; header?: string }

function headingLevel(paragraph: XmlNode): number | null {
  const props = find(childrenOf(paragraph), 'w:pPr')
  if (!props) return null
  const style = find(childrenOf(props), 'w:pStyle')
  const name = style ? String(attr(style, 'w:val') ?? '') : ''
  // The document title sits above every heading.
  if (/^title$/i.test(name)) return 0
  const fromStyle = /heading\s*([1-9])/i.exec(name)
  if (fromStyle) return Number(fromStyle[1])
  const outline = find(childrenOf(props), 'w:outlineLvl')
  return outline ? Number(attr(outline, 'w:val')) + 1 : null
}

const rowText = (row: XmlNode) =>
  findAll(childrenOf(row), 'w:tc')
    .map((cell) => textOf(childrenOf(cell), 'w:t').replace(/\s+/g, ' ').trim())
    .join(' | ')

export async function extractDocx(buffer: Buffer): Promise<Chunk[]> {
  const zip = await openZip(buffer)
  const document = await readXml(zip, 'word/document.xml')
  if (!document) throw new Error('The file has no word/document.xml; it may not be a Word document.')
  const body = find(document, 'w:body')
  if (!body) return []

  const pieces: Piece[] = []
  const heading: string[] = []
  let tableNo = 0
  for (const node of childrenOf(body)) {
    const tag = tagOf(node)
    if (tag === 'w:p') {
      const text = textOf(childrenOf(node), 'w:t').trim()
      const level = headingLevel(node)
      if (level !== null && text) {
        heading.length = Math.min(heading.length, level)
        for (let i = 0; i < level; i++) heading[i] ??= ''
        heading[level] = text
      }
      pieces.push({ text, heading: heading.filter(Boolean) })
    } else if (tag === 'w:tbl') {
      tableNo++
      const rows = findAll(childrenOf(node), 'w:tr')
      const header = rows.length ? rowText(rows[0]) : ''
      rows.forEach((row, i) => {
        if (i === 0) return
        pieces.push({ text: rowText(row), heading: heading.filter(Boolean), table: tableNo, row: i + 1, header })
      })
      if (rows.length === 1) pieces.push({ text: header, heading: heading.filter(Boolean), table: tableNo, row: 1 })
    }
  }

  return group(
    pieces,
    (p) => `${p.heading.join('\u0000')}|${p.table ?? ''}`,
    (run) => {
      const locator: Locator = { heading: run[0].heading }
      if (run[0].table) {
        locator.table = run[0].table
        locator.rows = `${run[0].row}-${run[run.length - 1].row}`
      }
      return locator
    },
    (run) => (run[0].header ? `${run[0].header}\n` : ''),
  )
}
