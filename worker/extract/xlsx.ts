// Excel (.xlsx): each sheet in runs of rows, with the sheet's first non-empty
// row (usually the headers) repeated at the top of each chunk, and a cell range
// as the locator.

import ExcelJS from 'exceljs'
import { group, type Chunk } from './chunk.ts'

type Piece = { text: string; sheet: string; row: number; header: string }

/** Column number (1-based) to letters: 1 -> A, 27 -> AA. */
export function columnLetters(n: number): string {
  let out = ''
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + ((i - 1) % 26)) + out
  return out
}

export async function extractXlsx(buffer: Buffer): Promise<Chunk[]> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  } catch {
    throw new Error('The file could not be opened as an Excel workbook.')
  }

  const pieces: Piece[] = []
  const lastColumn = new Map<string, number>()
  workbook.eachSheet((sheet) => {
    lastColumn.set(sheet.name, Math.max(sheet.columnCount, 1))
    let header = ''
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(String(cell.text ?? '').replace(/\s+/g, ' ').trim()))
      while (cells.length && !cells[cells.length - 1]) cells.pop()
      const text = cells.join(' | ')
      if (!text.replace(/[|\s]/g, '')) return
      if (!header) {
        header = text
        pieces.push({ text, sheet: sheet.name, row: rowNumber, header: '' })
      } else {
        pieces.push({ text, sheet: sheet.name, row: rowNumber, header })
      }
    })
  })

  return group(
    pieces,
    (p) => p.sheet,
    (run) => ({
      sheet: run[0].sheet,
      range: `A${run[0].row}:${columnLetters(lastColumn.get(run[0].sheet) ?? 1)}${run[run.length - 1].row}`,
    }),
    (run) => (run[0].header ? `${run[0].header}\n` : ''),
  )
}
