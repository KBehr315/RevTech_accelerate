// Each reader against small files built here, so the expected text and
// locators are known exactly.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { splitLong } from './chunk.ts'
import { extract } from './index.ts'
import { columnLetters } from './xlsx.ts'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const row = (...cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`

async function docx(body: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const shape = (text: string, placeholder?: string) =>
  `<p:sp><p:nvSpPr><p:nvPr>${placeholder ? `<p:ph type="${placeholder}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
const rels = (items: [string, string, string][]) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`)
    .join('')}</Relationships>`

describe('docx', () => {
  it('keeps the heading path and repeats a table header on each chunk', async () => {
    const buffer = await docx(
      para('FI-GL-010 Post Journal Entry', 'Title') +
        para('Purpose', 'Heading1') +
        para('Post a manual journal entry in S/4HANA with app Post General Journal Entries (F0718).') +
        para('Test steps', 'Heading1') +
        `<w:tbl>${row('Step', 'Action', 'Expected result')}${row('1', 'Open Fiori app F0718', 'Entry screen opens')}${row('2', 'Enter company code 1000', 'Accepted')}</w:tbl>`,
    )
    const { status, chunks } = await extract(buffer, 'script.docx')
    expect(status).toBe('done')
    const purpose = chunks.find((c) => c.text.includes('Post a manual journal entry'))!
    expect(purpose.locator).toEqual({ heading: ['FI-GL-010 Post Journal Entry', 'Purpose'] })
    const steps = chunks.find((c) => c.locator.table === 1)!
    expect(steps.text).toBe('Step | Action | Expected result\n1 | Open Fiori app F0718 | Entry screen opens\n2 | Enter company code 1000 | Accepted')
    expect(steps.locator).toEqual({ heading: ['FI-GL-010 Post Journal Entry', 'Test steps'], table: 1, rows: '2-3' })
  })

  it('reports a file that is not a Word document', async () => {
    await expect(extract(Buffer.from('not a zip'), 'broken.docx')).rejects.toThrow(/not a valid Office document/)
  })
})

describe('pptx', () => {
  it('reads slides in presentation order, with titles and speaker notes', async () => {
    const zip = new JSZip()
    // Slide files are numbered against presentation order on purpose.
    zip.file('ppt/presentation.xml', `<p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`)
    zip.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slide', 'slides/slide2.xml']]))
    zip.file('ppt/slides/slide2.xml', `<p:sld ${P}><p:cSld><p:spTree>${shape('Cost center planning', 'title')}${shape('Plan costs per cost center in KP06')}</p:spTree></p:cSld></p:sld>`)
    zip.file('ppt/slides/slide1.xml', `<p:sld ${P}><p:cSld><p:spTree>${shape('Allocations', 'title')}${shape('Run assessment cycle KSU5')}</p:spTree></p:cSld></p:sld>`)
    zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', 'notesSlide', '../notesSlides/notesSlide1.xml']]))
    zip.file('ppt/notesSlides/notesSlide1.xml', `<p:notes ${P}><p:cSld><p:spTree>${shape('1', 'sldNum')}${shape('Mention the test cycle first.', 'body')}</p:spTree></p:cSld></p:notes>`)

    const { chunks } = await extract(await zip.generateAsync({ type: 'nodebuffer' }), 'deck.pptx')
    expect(chunks).toEqual([
      { text: 'Cost center planning\nPlan costs per cost center in KP06', locator: { slide: 1, title: 'Cost center planning' } },
      { text: 'Allocations\nRun assessment cycle KSU5\nNotes: Mention the test cycle first.', locator: { slide: 2, title: 'Allocations' } },
    ])
  })
})

describe('xlsx', () => {
  it('reads each sheet in row ranges with the header row repeated', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Steps')
    sheet.addRow(['Step', 'Transaction', 'Description'])
    sheet.addRow([1, 'FB50', 'Enter G/L account document'])
    sheet.addRow([2, 'FB03', 'Display document'])
    workbook.addWorksheet('Empty')
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const { chunks, detail } = await extract(buffer, 'steps.xlsx')
    // A short sheet is one chunk; the header row starts it, so it isn't repeated.
    expect(chunks).toEqual([
      {
        text: 'Step | Transaction | Description\n1 | FB50 | Enter G/L account document\n2 | FB03 | Display document',
        locator: { sheet: 'Steps', range: 'A1:C3' },
      },
    ])
    expect(detail).toBe('Read 1 sheet.')
  })

  it('repeats the header at the top of each later chunk of a long sheet', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('GL accounts')
    sheet.addRow(['Account', 'Name', 'Type'])
    for (let i = 0; i < 80; i++) sheet.addRow([400000 + i, `Expense account number ${i}`, 'P&L'])
    const { chunks } = await extract(Buffer.from(await workbook.xlsx.writeBuffer()), 'accounts.xlsx')

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.text.startsWith('Account | Name | Type\n')).toBe(true)
    expect(chunks[0].locator.range).toMatch(/^A1:C\d+$/)
    expect(chunks[chunks.length - 1].locator.range).toMatch(/^A\d+:C81$/)
  })

  it('names columns like Excel', () => {
    expect([1, 26, 27, 52, 703].map(columnLetters)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA'])
  })
})

describe('pdf', () => {
  async function pdf(pages: string[]): Promise<Buffer> {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (const text of pages) {
      const page = doc.addPage()
      if (text) page.drawText(text, { x: 50, y: 700, size: 12, font })
    }
    return Buffer.from(await doc.save())
  }

  it('reads page by page and notes pages without text', async () => {
    const buffer = await pdf(['Accruals are posted at period end with FBS1.', '', 'Reverse accruals with F.81 on day one.'])
    const { status, chunks, detail } = await extract(buffer, 'accruals.pdf')
    expect(status).toBe('done')
    expect(chunks.map((c) => c.locator)).toEqual([{ page: 1 }, { page: 3 }])
    expect(chunks[0].text).toContain('FBS1')
    expect(detail).toBe('Read 2 pages. 1 page had no text (scanned?): 2.')
  })

  it('asks for OCR when no page has text', async () => {
    const { status, chunks } = await extract(await pdf(['', '']), 'scan.pdf')
    expect(status).toBe('needs_ocr')
    expect(chunks).toEqual([])
  })
})

describe('text, csv and images', () => {
  it('reads text by paragraph with line numbers', async () => {
    const { chunks } = await extract(Buffer.from('﻿First paragraph\nstill first\n\nSecond one\r\n'), 'notes.txt')
    expect(chunks).toEqual([{ text: 'First paragraph\nstill first\nSecond one', locator: { lines: '1-4' } }])
  })

  it('reads csv rows with the header repeated', async () => {
    const { chunks } = await extract(Buffer.from('code,name\nFB50,Enter G/L document\nFB60,Enter vendor invoice\n'), 'codes.csv')
    expect(chunks).toEqual([{ text: 'code,name\nFB50,Enter G/L document\nFB60,Enter vendor invoice', locator: { rows: '2-3' } }])
  })

  it('sends images to OCR', async () => {
    expect((await extract(Buffer.from([0x89, 0x50]), 'screen.png')).status).toBe('needs_ocr')
  })
})

describe('chunking', () => {
  it('splits long text near the target size at sentence boundaries', () => {
    const sentence = 'This sentence is part of a long procedure description. '
    const parts = splitLong(sentence.repeat(100))
    expect(parts.length).toBeGreaterThan(2)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(2_000)
      expect(part.endsWith('.')).toBe(true)
    }
  })
})
