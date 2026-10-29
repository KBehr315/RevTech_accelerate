// Finding documents a new upload resembles (db/migrations/00108): the same name
// once version words are ignored, or mostly the same text. Text is compared as
// sets of five-word sequences, so moved paragraphs still match and a changed
// sentence only costs the sequences it touches.

/** What a suggestion records, per resembling document. */
export type Resemblance = { existing_asset_id: string; same_name: boolean; text_similarity: number }

export type Candidate = { asset_id: string; title: string; filename: string; text: string }

/** At or above this share of sequences in common, two texts are "mostly the same". */
export const SIMILAR_TEXT = 0.5
/** Words per compared sequence. */
const SHINGLE = 5
const MAX_WORDS = 60_000
const MAX_SUGGESTIONS = 3

// Words that mark a version or a copy rather than a different document.
const VERSION_WORDS = /\b(v|ver|version|rev|revision|r)\s*\d+(\.\d+)*\b|\b(final|draft|copy|updated|latest|new|old)\b|\(\d+\)|\b\d{4}[-_.]?\d{2}[-_.]?\d{2}\b|\b\d{1,2}[-_.]\d{1,2}[-_.]\d{2,4}\b/g

/** "Codan-R2R-03 Close Test Script v2 (1).docx" -> "codan r2r 03 close test script". */
export function normalizeName(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    // Underscores first: they are word characters, so "script_v2" has no word break before the v.
    // Hyphens and dots stay until after VERSION_WORDS, which matches dates written with them.
    .replace(/_+/g, ' ')
    .replace(VERSION_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function shingles(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g)?.slice(0, MAX_WORDS) ?? []
  const set = new Set<string>()
  if (words.length < SHINGLE) {
    if (words.length) set.add(words.join(' '))
    return set
  }
  for (let i = 0; i + SHINGLE <= words.length; i++) set.add(words.slice(i, i + SHINGLE).join(' '))
  return set
}

/** Jaccard similarity: sequences in both, over sequences in either. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  let shared = 0
  for (const s of small) if (large.has(s)) shared++
  return shared / (a.size + b.size - shared)
}

/** The documents most like the new one, best first, at most three. */
export function findResemblances(filename: string, text: string, candidates: Candidate[]): Resemblance[] {
  const name = normalizeName(filename)
  const mine = shingles(text)
  return candidates
    .map((c) => {
      const sameName = name !== '' && (normalizeName(c.filename) === name || normalizeName(c.title) === name)
      const score = similarity(mine, shingles(c.text))
      return { existing_asset_id: c.asset_id, same_name: sameName, text_similarity: Math.round(score * 100) / 100 }
    })
    .filter((r) => r.same_name || r.text_similarity >= SIMILAR_TEXT)
    .sort((a, b) => Number(b.same_name) - Number(a.same_name) || b.text_similarity - a.text_similarity)
    .slice(0, MAX_SUGGESTIONS)
}
