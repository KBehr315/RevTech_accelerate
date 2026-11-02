// Writing a training draft (db/migrations/00111): the shape Claude must answer
// in, the prompt, and the checks code makes on the answer before it is saved.
//
// One draft feeds both outputs. Each section carries the lesson's blocks and
// the PowerPoint's slides, written together so they teach the same thing.
// Claude cites passages by reference ("S2.4": source 2, passage 4). Code, not
// the model, decides each label: "source" when at least one citation points to
// a passage it was given, otherwise "ai_generated", for a reviewer to check.

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
export type Label = 'source' | 'ai_generated'

export type Item = { title: string; detail: string; x: number; y: number }
export type Block = {
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
export type Slide = { title: string; bullets: string[]; notes: string; media: string; citations: string[]; label?: Label }
export type Section = { heading: string; blocks: Block[]; slides: Slide[] }
export type Question = { question: string; choices: string[]; correct: number[]; explanation: string; citations: string[]; label?: Label }
export type Draft = {
  title: string
  audience: string
  duration_minutes: number
  summary: string
  objectives: string[]
  sections: Section[]
  quiz: Question[]
  review_notes: string[]
  /** Added by code: what each S<n> was. */
  sources?: { ref: string; asset_id: string; title: string }[]
  videos?: { ref: string; url: string; note: string }[]
}

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
      blocks: {
        type: 'array',
        items: object({
          type: { type: 'string', enum: BLOCK_TYPES },
          heading: str,
          body: str,
          items: { type: 'array', items: object({ title: str, detail: str, x: { type: 'integer' }, y: { type: 'integer' } }) },
          correct: ints,
          seconds: { type: 'integer' },
          media: str,
          citations: strings,
        }),
      },
      slides: {
        type: 'array',
        items: object({ title: str, bullets: strings, notes: str, media: str, citations: strings }),
      },
    }),
  },
  quiz: {
    type: 'array',
    items: object({ question: str, choices: strings, correct: ints, explanation: str, citations: strings }),
  },
  review_notes: strings,
})

export const SYSTEM_PROMPT = `You are an instructional designer at RevTech, writing training for SAP S/4HANA users at US government contractors.

You write one draft that becomes both an interactive lesson and a PowerPoint deck. The draft is reviewed and edited by people before anyone takes it, so flag anything you are unsure of in review_notes rather than guessing quietly.

Sources:
- When source passages are given, teach what they say first. They are the client's own procedures and references, and they win over general SAP knowledge. Never replace a client's own steps with generic SAP steps.
- Cite every block, slide and quiz question that uses a source, by passage reference exactly as given (for example "S2.4"). Cite only passages you were given.
- Where you add something the sources don't say, from general SAP or government-contracting knowledge, leave its citations empty. It will be shown to reviewers as AI-generated.
- If the sources disagree with each other, say so in review_notes, naming both passages.
- Never invent client names, figures, account numbers, approval limits or system settings. If the training needs one that isn't in the sources, write a placeholder like [approval limit] and add a review note.

Lesson (blocks): mix plain text blocks with the interactive pieces you are allowed, where each one genuinely helps someone learn. Keep text blocks short. Use "image" blocks to place attached pictures (media "image:S<n>") and "video" blocks to place videos (media "video:<n>"), each where it fits; use each at most once. Fields a block type doesn't use are empty strings, empty arrays, or 0.

Slides: a title slide's content is not needed (it is added automatically). Write 3 to 6 bullets per slide, short enough to read from the back of a room, and speaker notes on every slide that a trainer could read aloud. Pictures can go on slides too (media "image:S<n>").

Quiz: questions test the objectives, each with 2 to 5 choices, correct holding the right choice numbers counted from 0, and an explanation. If the material supports fewer questions than asked for, write fewer and add a review note, rather than padding.

Write in plain US English, second person, active voice.`

/** The user message: the description, what to make, and the numbered sources. */
export function buildPrompt(draft: { brief: string; outputs: string[]; pieces: string[] }, sources: Source[], videos: Video[]) {
  const parts: string[] = []
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

  let budget = MAX_SOURCE_CHARS
  let cut = false
  if (sources.length) {
    const listed = sources.map((source, i) => {
      const ref = `S${i + 1}`
      const passages: string[] = []
      source.passages.forEach((text, j) => {
        if (budget <= 0) {
          cut = true
          return
        }
        const kept = text.slice(0, budget)
        budget -= kept.length
        passages.push(`[${ref}.${j + 1}] ${kept}`)
      })
      const picture = source.image ? ' (a picture, attached above)' : ''
      return `<source ref="${ref}" title="${source.title.replace(/"/g, "'")}"${picture}>\n${passages.join('\n\n') || '(no readable text)'}\n</source>`
    })
    parts.push(`Source documents, to teach from first:\n${listed.join('\n\n')}`)
  } else {
    parts.push('No source documents were chosen. Write from general SAP S/4HANA and government-contracting knowledge, leave all citations empty, and add review notes on anything a client\'s own process might change.')
  }
  if (cut) parts.push('The sources were too long to send in full; later passages were left out.')

  if (videos.length) {
    parts.push(
      `Videos to place (you can't watch them; place each by its note):\n${videos.map((v, i) => `- video:${i + 1}: ${v.note || 'no description given'}`).join('\n')}`,
    )
  }
  return { text: parts.join('\n\n'), truncated: cut }
}

/** Transaction codes and app IDs (FB50, F0718, ME21N): facts a cited passage should contain. */
const CODE = /\b[A-Z]{1,4}\d{2,4}[A-Z]?\b/g

/**
 * Checks Claude's answer against what it was given: drops citations and media
 * references to things it wasn't sent, labels every block, slide and question,
 * and adds a review note for each correction.
 */
export function finalize(answer: Draft, sources: Source[], videos: Video[], truncated: boolean): Draft {
  const notes = [...answer.review_notes]
  const passages = new Map<string, string>()
  sources.forEach((s, i) => s.passages.forEach((text, j) => passages.set(`S${i + 1}.${j + 1}`, text)))
  const pictures = new Set(sources.flatMap((s, i) => (s.image ? [`image:S${i + 1}`] : [])))
  const videoRefs = new Set(videos.map((_, i) => `video:${i + 1}`))
  let dropped = 0

  function check<T extends { citations: string[]; label?: Label }>(part: T, text: string, where: string): T {
    const kept = part.citations.filter((c) => passages.has(c))
    dropped += part.citations.length - kept.length
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

  const sections = answer.sections.map((section) => ({
    heading: section.heading,
    blocks: section.blocks
      .filter((b) => BLOCK_TYPES.includes(b.type))
      .map((b) => {
        const where = `"${section.heading}" (${b.type})`
        const text = [b.heading, b.body, ...b.items.flatMap((i) => [i.title, i.detail])].join(' ')
        return check({ ...b, media: media(b.media, where) }, text, where)
      }),
    slides: section.slides.map((s) => {
      const where = `Slide "${s.title}"`
      return check({ ...s, media: media(s.media, where) }, [s.title, ...s.bullets, s.notes].join(' '), where)
    }),
  }))
  const quiz = answer.quiz
    .filter((q) => q.choices.length >= 2 && q.correct.length > 0 && q.correct.every((c) => c >= 0 && c < q.choices.length))
    .map((q, i) => check(q, [q.question, ...q.choices, q.explanation].join(' '), `Quiz question ${i + 1}`))
  if (quiz.length < answer.quiz.length) notes.push(`${answer.quiz.length - quiz.length} quiz question(s) had no valid answer and were removed.`)
  if (dropped) notes.push(`${dropped} citation(s) pointed to passages Claude wasn't given and were removed.`)
  if (truncated) notes.push('Some source text was too long to send, so later passages were not used.')

  return {
    ...answer,
    sections,
    quiz,
    review_notes: notes,
    sources: sources.map((s, i) => ({ ref: `S${i + 1}`, asset_id: s.asset_id, title: s.title })),
    videos: videos.map((v, i) => ({ ref: `video:${i + 1}`, url: v.url, note: v.note })),
  }
}
