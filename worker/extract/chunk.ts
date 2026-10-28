// Turns the pieces a parser found (paragraphs, table rows, slides, pages…) into
// search-sized chunks. A chunk never spans two locations a citation must tell
// apart (two pages, two slides, two sections), so every chunk's locator says
// exactly where its text is.

export type Locator = Record<string, string | number | string[]>

export type Chunk = { text: string; locator: Locator }

/** Most chunks end up around this size; long passages are split near it. */
export const TARGET_CHARS = 1_200
const MAX_CHARS = 2_000

/** Splits text longer than MAX_CHARS at paragraph, sentence or word boundaries. */
export function splitLong(text: string): string[] {
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > MAX_CHARS) {
    const window = rest.slice(0, MAX_CHARS)
    const cut =
      [window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf(' ')].find(
        (i) => i > TARGET_CHARS / 2,
      ) ?? MAX_CHARS
    parts.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

/**
 * Joins consecutive pieces that share a location (same `groupKey`) until a
 * chunk reaches the target size. `locate` builds the locator for a run of
 * pieces, so it can describe a range (rows 4-19, lines 10-42).
 */
export function group<T extends { text: string }>(
  pieces: T[],
  groupKey: (piece: T) => string,
  locate: (run: T[]) => Locator,
  prefix: (run: T[]) => string = () => '',
): Chunk[] {
  const chunks: Chunk[] = []
  let run: T[] = []
  let size = 0
  const flush = () => {
    if (!run.length) return
    const body = run.map((p) => p.text).join('\n')
    for (const text of splitLong(prefix(run) + body)) chunks.push({ text, locator: locate(run) })
    run = []
    size = 0
  }
  for (const piece of pieces) {
    if (!piece.text.trim()) continue
    if (run.length && (groupKey(run[0]) !== groupKey(piece) || size + piece.text.length > TARGET_CHARS)) flush()
    run.push(piece)
    size += piece.text.length + 1
  }
  flush()
  return chunks
}
