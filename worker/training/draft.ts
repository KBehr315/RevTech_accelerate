// Writing a training draft (db/migrations/00111): the shape Claude must answer
// in, the prompt, and the checks code makes on the answer before it is saved.
//
// One draft feeds both outputs. Each section carries the lesson's blocks and
// the PowerPoint's slides, written together so they teach the same thing.
// Claude cites passages by reference ("S2.4": source 2, passage 4). Code, not
// the model, decides each label: "source" when at least one citation points to
// a passage it was given, otherwise "ai_generated", for a reviewer to check.
// Each block, slide and question gets an id, so a reviewer can check or
// revise it (00112).
//
// Training names only its own client. Claude is told so, and lists the other
// companies its sources name; code then replaces any of those, and any other
// client of the platform, that still appear.

import { randomUUID } from 'node:crypto'

export const PIECES = {
  checklist: 'Checklist cards: items the learner ticks off (items: title).',
  stat: 'Stat card: one striking number (heading: the number, body: what it means).',
  reveal: 'Reveal card: a question or prompt, answer hidden until clicked (heading: prompt, body: answer).',
  hotspot: 'Hotspot diagram: points on one of the attached pictures (media: "image:S<n>", items: title, detail, x and y as percent from top left).',
  mistake_better: 'Mistake vs better toggle: common mistakes and the better way (items: title = mistake, detail = better way).',
  info_cards: 'Info cards: short cards side by side (items: title, detail).',
  timed_activity: 'Timed activity: a short task against the clock (heading, body: instructions, seconds).',
  flip_cards: 'Flip cards: front and back (items: title = front, detail = back).',
  expandable: 'Expandable items: headings that open to detail (items: title, detail).',
  drag_drop: 'Drag & drop: sort items into categories (items: title = item, detail = its correct category).',
  multiple_choice: 'Multiple choice question inside the lesson (heading: question, items: title = choice, detail = why; correct: right choice numbers from 0).',
  diagram: 'Diagram in RevTech colours: a process flow, in order (items: title = step, detail = short note).',
} as const

export type Piece = keyof typeof PIECES
export type BlockType = 'text' | 'image' | 'video' | Piece
/** "edited": a reviewer rewrote it by hand (00112). */
export type Label = 'source' | 'ai_generated' | 'edited'

export type Item = { title: string; detail: string; x: number; y: number }
export type Block = {
  id?: string
  type: BlockType
  heading: string
  body: string
  items: Item[]
  correct: number[]
  seconds: number
  /** "image:S<n>", "video:<n>", or empty. */
  media: string
  citations: string[]
  label?: Label
}
export type Slide = { id?: string; title: string; bullets: string[]; notes: string; media: string; citations: string[]; label?: Label }
export type Section = { heading: string; blocks: Block[]; slides: Slide[] }
export type Question = { id?: string; question: string; choices: string[]; correct: number[]; explanation: string; citations: string[]; label?: Label }
export type Draft = {
  title: string
  audience: string
  duration_minutes: number
  summary: string
  objectives: string[]
  sections: Section[]
  quiz: Question[]
  review_notes: string[]
  /** Companies other than the client that the sources name, as Claude listed them. */
  other_companies?: string[]
  /** Added by code: the names it replaces with the client's, kept for revisions. */
  renamed?: string[]
  /** Added by code: what each S<n> was. public_title has other companies' names replaced, for the deck. */
  sources?: { ref: string; asset_id: string; title: string; public_title: string }[]
  videos?: { ref: string; url: string; note: string }[]
}

/** Who the training is for, and the platform's other clients, whose names it must not contain. */
export type Client = { name: string; otherClients: string[] }

/** A ticked document as the requester can read it. */
export type Source = {
  asset_id: string
  title: string
  passages: string[]
  /** For a picture, its bytes, attached so Claude can see it. */
  image?: { mediaType: 'image/png' | 'image/jpeg'; data: Buffer }
}
export type Video = { url: string; note: string }

const BLOCK_TYPES: BlockType[] = ['text', 'image', 'video', ...(Object.keys(PIECES) as Piece[])]
/** Room left for the description, the instructions and the answer. */
const MAX_SOURCE_CHARS = 300_000

const str = { type: 'string' }
const strings = { type: 'array', items: str }
const ints = { type: 'array', items: { type: 'integer' } }
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const BLOCK_SCHEMA = object({
  type: { type: 'string', enum: BLOCK_TYPES },
  heading: str,
  body: str,
  items: { type: 'array', items: object({ title: str, detail: str, x: { type: 'integer' }, y: { type: 'integer' } }) },
  correct: ints,
  seconds: { type: 'integer' },
  media: str,
  citations: strings,
})
const SLIDE_SCHEMA = object({ title: str, bullets: strings, notes: str, media: str, citations: strings })
const QUESTION_SCHEMA = object({ question: str, choices: strings, correct: ints, explanation: str, citations: strings })

/** The JSON Schema Claude's answer must follow (structured outputs). */
export const DRAFT_SCHEMA = object({
  title: str,
  audience: str,
  duration_minutes: { type: 'integer' },
  summary: str,
  objectives: strings,
  sections: {
    type: 'array',
    items: object({
      heading: str,
      blocks: { type: 'array', items: BLOCK_SCHEMA },
      slides: { type: 'array', items: SLIDE_SCHEMA },
    }),
  },
  quiz: { type: 'array', items: QUESTION_SCHEMA },
  review_notes: strings,
  other_companies: strings,
})

export type PartKind = 'block' | 'slide' | 'question'
const PART_SCHEMAS = { block: BLOCK_SCHEMA, slide: SLIDE_SCHEMA, question: QUESTION_SCHEMA }

/** The answer to a revision: the rewritten piece, notes for the reviewer, and other companies named. */
export const revisionSchema = (kind: PartKind) => object({ part: PART_SCHEMAS[kind], review_notes: strings, other_companies: strings })

export const SYSTEM_PROMPT = `You are an instructional designer at RevTech, writing training for SAP S/4HANA users at US government contractors.

You write one draft that becomes both an interactive lesson and a PowerPoint deck. The draft is reviewed and edited by people before anyone takes it, so flag anything you are unsure of in review_notes rather than guessing quietly.

Sources:
- When source passages are given, teach what they say first. They are the client's own procedures and references, and they win over general SAP knowledge. Never replace a client's own steps with generic SAP steps.
- Cite every block, slide and quiz question that uses a source, by passage reference exactly as given (for example "S2.4"). Cite only passages you were given.
- Where you add something the sources don't say, from general SAP or government-contracting knowledge, leave its citations empty. It will be shown to reviewers as AI-generated.
- If the sources disagree with each other, say so in review_notes, naming both passages.
- Never invent client names, figures, account numbers, approval limits or system settings. If the training needs one that isn't in the sources, write a placeholder like [approval limit] and add a review note.

The client:
- The training is for one client, named in the request. Sources may come from other companies: another client, a past project, a parent company or its subsidiaries. Write as if everything is the client's own: refer to the organization only by the client's name, and never name another company or its subsidiaries, business units or people, in any field, review notes included. Where a source names one, write the client's name instead, or describe it generically ("a second company code").
- List in other_companies every company or organization name, other than the client, that appears in the sources, including subsidiaries and short forms, so code can confirm none slipped through. Don't list software vendors (SAP, Microsoft), RevTech, or government bodies (DCAA, DoD); those may be named.

Lesson (blocks): mix plain text blocks with the interactive pieces you are allowed, where each one genuinely helps someone learn. Keep text blocks short. Use "image" blocks to place attached pictures (media "image:S<n>") and "video" blocks to place videos (media "video:<n>"), each where it fits; use each at most once. Fields a block type doesn't use are empty strings, empty arrays, or 0.

Slides: a title slide's content is not needed (it is added automatically). Write 3 to 6 bullets per slide, short enough to read from the back of a room, and speaker notes on every slide that a trainer could read aloud. Pictures can go on slides too (media "image:S<n>").

Quiz: questions test the objectives, each with 2 to 5 choices, correct holding the right choice numbers counted from 0, and an explanation. If the material supports fewer questions than asked for, write fewer and add a review note, rather than padding.

Write in plain US English, second person, active voice.`

/** The user message: the client, the description, what to make, and the numbered sources. */
export function buildPrompt(draft: { brief: string; outputs: string[]; pieces: string[] }, client: Client, sources: Source[], videos: Video[]) {
  const parts: string[] = []
  parts.push(`The training is for ${client.name}. Name no other company.`)
  parts.push(`What the training should cover, in the requester's words:\n<brief>\n${draft.brief}\n</brief>`)

  const making = [
    draft.outputs.includes('lesson') ? 'an interactive lesson (write blocks)' : 'no lesson (leave every section\'s blocks empty)',
    draft.outputs.includes('slides') ? 'a PowerPoint deck (write slides)' : 'no deck (leave every section\'s slides empty)',
  ]
  parts.push(`Make: ${making.join('; ')}. Always write the quiz unless the brief asks for none.`)

  if (draft.outputs.includes('lesson')) {
    const allowed = draft.pieces.filter((p): p is Piece => p in PIECES)
    parts.push(
      allowed.length
        ? `Interactive pieces you may use (pick where each fits; you don't have to use them all):\n${allowed.map((p) => `- ${p}: ${PIECES[p]}`).join('\n')}`
        : 'Use only text, image and video blocks: no interactive pieces were chosen.',
    )
  }

  const listed = listSources(sources, MAX_SOURCE_CHARS)
  if (sources.length) {
    parts.push(`Source documents, to teach from first:\n${listed.text}`)
  } else {
    parts.push('No source documents were chosen. Write from general SAP S/4HANA and government-contracting knowledge, leave all citations empty, and add review notes on anything a client\'s own process might change.')
  }
  if (listed.cut) parts.push('The sources were too long to send in full; later passages were left out.')

  if (videos.length) {
    parts.push(
      `Videos to place (you can't watch them; place each by its note):\n${videos.map((v, i) => `- video:${i + 1}: ${v.note || 'no description given'}`).join('\n')}`,
    )
  }
  return { text: parts.join('\n\n'), truncated: listed.cut }
}

/** The sources as numbered passages, up to `budget` characters of text. */
function listSources(sources: Source[], budget: number) {
  let cut = false
  const text = sources
    .map((source, i) => {
      const ref = `S${i + 1}`
      const passages: string[] = []
      source.passages.forEach((passage, j) => {
        if (budget <= 0) {
          cut = true
          return
        }
        const kept = passage.slice(0, budget)
        budget -= kept.length
        passages.push(`[${ref}.${j + 1}] ${kept}`)
      })
      const picture = source.image ? ' (a picture, attached above)' : ''
      return `<source ref="${ref}" title="${source.title.replace(/"/g, "'")}"${picture}>\n${passages.join('\n\n') || '(no readable text)'}\n</source>`
    })
    .join('\n\n')
  return { text, cut }
}

/** Transaction codes and app IDs (FB50, F0718, ME21N): facts a cited passage should contain. */
const CODE = /\b[A-Z]{1,4}\d{2,4}[A-Z]?\b/g

/**
 * The names to replace with the client's: what Claude listed and the
 * platform's other clients, longest first so "Codan US" goes before "Codan".
 * Names the client's own name contains, and very short ones, are left alone.
 */
export function namesToReplace(client: Client, listed: string[]): string[] {
  const own = client.name.toLowerCase()
  const names = [...listed, ...client.otherClients]
    .map((n) => n.trim())
    .filter((n) => n.length >= 3 && !own.includes(n.toLowerCase()))
  return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()].sort((a, b) => b.length - a.length)
}

/** Replaces each name with the client's, as a whole word, ignoring case. Returns the text and the names it found. */
export function replaceNames(text: string, names: string[], clientName: string) {
  const found = new Set<string>()
  let out = text
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu')
    out = out.replace(pattern, () => {
      found.add(name)
      return clientName
    })
  }
  return { text: out, found }
}

/** Replaces the names in every string inside a value, arrays and objects included. */
function replaceDeep<T>(value: T, names: string[], clientName: string, found: Set<string>): T {
  if (typeof value === 'string') {
    const result = replaceNames(value, names, clientName)
    result.found.forEach((n) => found.add(n))
    return result.text as T
  }
  if (Array.isArray(value)) return value.map((v) => replaceDeep(v, names, clientName, found)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceDeep(v, names, clientName, found)])) as T
  }
  return value
}

const renamedNote = (found: Set<string>, clientName: string) =>
  `Names of other companies (${[...found].join(', ')}) were replaced with ${clientName}. Check the wording still reads well.`

/**
 * Checks of single pieces against what Claude was given: citations to passages
 * it wasn't sent, codes the cited passages don't contain, and media it wasn't
 * sent. Corrections go into `notes`.
 */
function checker(sources: Source[], videos: Video[], notes: string[]) {
  const passages = new Map<string, string>()
  sources.forEach((s, i) => s.passages.forEach((text, j) => passages.set(`S${i + 1}.${j + 1}`, text)))
  const pictures = new Set(sources.flatMap((s, i) => (s.image ? [`image:S${i + 1}`] : [])))
  const videoRefs = new Set(videos.map((_, i) => `video:${i + 1}`))
  const state = { dropped: 0 }

  function cite<T extends { citations: string[]; label?: Label }>(part: T, text: string, where: string): T {
    const kept = part.citations.filter((c) => passages.has(c))
    state.dropped += part.citations.length - kept.length
    if (kept.length) {
      const cited = kept.map((c) => passages.get(c)!).join(' ')
      const missing = [...new Set(text.match(CODE) ?? [])].filter((code) => !cited.includes(code))
      if (missing.length) notes.push(`${where}: ${missing.join(', ')} is not in the passages it cites. Check it.`)
    }
    return { ...part, citations: kept, label: kept.length ? 'source' : 'ai_generated' }
  }
  const media = (value: string, where: string) => {
    if (!value || pictures.has(value) || videoRefs.has(value)) return value
    notes.push(`${where}: referred to a picture or video that wasn't provided; it was removed.`)
    return ''
  }

  const block = (b: Block, heading: string) => {
    const where = `"${heading}" (${b.type})`
    const text = [b.heading, b.body, ...b.items.flatMap((i) => [i.title, i.detail])].join(' ')
    return cite({ ...b, media: media(b.media, where) }, text, where)
  }
  const slide = (s: Slide) => {
    const where = `Slide "${s.title}"`
    return cite({ ...s, media: media(s.media, where) }, [s.title, ...s.bullets, s.notes].join(' '), where)
  }
  const question = (q: Question, where: string) => cite(q, [q.question, ...q.choices, q.explanation].join(' '), where)
  const answerable = (q: Question) => q.choices.length >= 2 && q.correct.length > 0 && q.correct.every((c) => c >= 0 && c < q.choices.length)

  return { block, slide, question, answerable, state }
}

/**
 * Checks Claude's answer against what it was given: drops citations and media
 * references to things it wasn't sent, labels every block, slide and question,
 * gives each an id, replaces other companies' names with the client's, and
 * adds a review note for each correction.
 */
export function finalize(answer: Draft, client: Client, sources: Source[], videos: Video[], truncated: boolean): Draft {
  const notes = [...answer.review_notes]
  const check = checker(sources, videos, notes)

  const sections = answer.sections.map((section) => ({
    heading: section.heading,
    blocks: section.blocks
      .filter((b) => BLOCK_TYPES.includes(b.type))
      .map((b) => ({ id: randomUUID(), ...check.block(b, section.heading) })),
    slides: section.slides.map((s) => ({ id: randomUUID(), ...check.slide(s) })),
  }))
  const quiz = answer.quiz
    .filter(check.answerable)
    .map((q, i) => ({ id: randomUUID(), ...check.question(q, `Quiz question ${i + 1}`) }))
  if (quiz.length < answer.quiz.length) notes.push(`${answer.quiz.length - quiz.length} quiz question(s) had no valid answer and were removed.`)
  if (check.state.dropped) notes.push(`${check.state.dropped} citation(s) pointed to passages Claude wasn't given and were removed.`)
  if (truncated) notes.push('Some source text was too long to send, so later passages were not used.')

  const { other_companies: listed = [], ...rest } = answer
  const names = namesToReplace(client, listed)
  const found = new Set<string>()
  const written = replaceDeep({ ...rest, sections, quiz, review_notes: notes }, names, client.name, found)
  if (found.size) written.review_notes.push(renamedNote(found, client.name))

  return {
    ...written,
    renamed: names,
    sources: sources.map((s, i) => ({
      ref: `S${i + 1}`,
      asset_id: s.asset_id,
      title: s.title,
      public_title: replaceNames(s.title, names, client.name).text,
    })),
    videos: videos.map((v, i) => ({ ref: `video:${i + 1}`, url: v.url, note: v.note })),
  }
}

export type Part = Block | Slide | Question
export type FoundPart = { kind: PartKind; part: Part; heading: string }

/** A piece of a draft, found by its id. */
export function findPart(draft: Draft, id: string): FoundPart | null {
  for (const section of draft.sections) {
    const block = section.blocks.find((b) => b.id === id)
    if (block) return { kind: 'block', part: block, heading: section.heading }
    const slide = section.slides.find((s) => s.id === id)
    if (slide) return { kind: 'slide', part: slide, heading: section.heading }
  }
  const question = draft.quiz.find((q) => q.id === id)
  return question ? { kind: 'question', part: question, heading: 'Quiz' } : null
}

const KIND_NAMES = { block: 'lesson piece', slide: 'slide', question: 'quiz question' }
/** Less source text than for a whole draft: a revision is one piece. */
const MAX_REVISION_SOURCE_CHARS = 150_000

/** The user message for rewriting one piece: the draft's outline, the piece, the reviewer's instruction, the sources. */
export function buildRevisionPrompt(
  draft: Draft,
  found: FoundPart,
  instruction: string,
  context: { brief: string; pieces: string[] },
  client: Client,
  sources: Source[],
) {
  // The piece as Claude wrote it: no id or label, which code adds.
  const piece = JSON.stringify(found.part, (key, value) => (key === 'id' || key === 'label' ? undefined : value), 2)
  const parts: string[] = []
  parts.push(`The training is for ${client.name}. Name no other company.`)
  parts.push(
    `A reviewer wants one ${KIND_NAMES[found.kind]} of this training rewritten. Rewrite only that piece, following the same rules as the rest of the training, and answer with the whole rewritten piece.`,
  )
  parts.push(`The training: "${draft.title}", for ${draft.audience}.\nOriginal description:\n<brief>\n${context.brief}\n</brief>`)
  parts.push(`Its sections: ${draft.sections.map((s, i) => `${i + 1}. ${s.heading}`).join('; ')}. This piece is in "${found.heading}".`)
  parts.push(`The piece now:\n${piece}`)
  parts.push(`What the reviewer wants changed:\n<instruction>\n${instruction}\n</instruction>`)
  if (found.kind === 'block') {
    const allowed = context.pieces.filter((p): p is Piece => p in PIECES)
    parts.push(
      `Keep its type ("${(found.part as Block).type}") unless the reviewer asks for another. Types allowed: text, image, video${allowed.length ? `, ${allowed.join(', ')}` : ''}.${allowed.map((p) => `\n- ${p}: ${PIECES[p]}`).join('')}`,
    )
  }
  if (sources.length) {
    const listed = listSources(sources, MAX_REVISION_SOURCE_CHARS)
    parts.push(`Source documents, to teach from first:\n${listed.text}`)
    if (listed.cut) parts.push('The sources were too long to send in full; later passages were left out.')
  } else {
    parts.push('No source documents were chosen for this training. Write from general knowledge and leave citations empty.')
  }
  parts.push('Put anything a reviewer should check about your rewrite in review_notes, or leave it empty.')
  return parts.join('\n\n')
}

/** Checks a rewritten piece as finalize checks a draft's. Returns the piece and notes for the reviewer, or why it can't be used. */
export function finalizeRevision(
  answer: { part: Part; review_notes: string[]; other_companies: string[] },
  found: FoundPart,
  draft: Draft,
  client: Client,
  sources: Source[],
  videos: Video[],
): { part: Part; notes: string[] } | { error: string } {
  const notes: string[] = []
  const check = checker(sources, videos, notes)
  let part: Part
  if (found.kind === 'block') {
    const block = answer.part as Block
    if (!BLOCK_TYPES.includes(block.type)) return { error: `Claude answered with an unknown piece type, "${block.type}".` }
    part = check.block(block, found.heading)
  } else if (found.kind === 'slide') {
    part = check.slide(answer.part as Slide)
  } else {
    const question = answer.part as Question
    if (!check.answerable(question)) return { error: "Claude's rewritten question had no valid answer. Try again with a clearer instruction." }
    part = check.question(question, 'Rewritten quiz question')
  }
  if (check.state.dropped) notes.push(`${check.state.dropped} citation(s) pointed to passages Claude wasn't given and were removed.`)

  const names = namesToReplace(client, [...(draft.renamed ?? []), ...answer.other_companies])
  const replaced = new Set<string>()
  part = replaceDeep(part, names, client.name, replaced)
  const all = replaceDeep([...answer.review_notes, ...notes], names, client.name, replaced)
  if (replaced.size) all.push(renamedNote(replaced, client.name))
  return { part, notes: all.map((n) => `Revision of "${found.heading}": ${n}`) }
}
