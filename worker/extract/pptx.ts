// PowerPoint (.pptx): one chunk per slide (split if long), in presentation
// order, with the slide title and any speaker notes.

import { splitLong, type Chunk } from './chunk.ts'
import { attr, childrenOf, find, findAll, openZip, readXml, textOf, type XmlNode } from './ooxml.ts'

/** Relationship id -> target path, from a .rels part, resolved against `base`. */
async function relationships(zip: Awaited<ReturnType<typeof openZip>>, relsPath: string, base: string) {
  const rels = await readXml(zip, relsPath)
  const map = new Map<string, { target: string; type: string }>()
  for (const rel of rels ? findAll(rels, 'Relationship') : []) {
    const target = String(attr(rel, 'Target') ?? '')
    const resolved = new URL(target, `file:///${base}`).pathname.slice(1)
    map.set(String(attr(rel, 'Id')), { target: resolved, type: String(attr(rel, 'Type') ?? '') })
  }
  return map
}

const paragraphs = (nodes: XmlNode[]) =>
  findAll(nodes, 'a:p')
    .map((p) => textOf(childrenOf(p), 'a:t').trim())
    .filter(Boolean)

export async function extractPptx(buffer: Buffer): Promise<Chunk[]> {
  const zip = await openZip(buffer)
  const presentation = await readXml(zip, 'ppt/presentation.xml')
  if (!presentation) throw new Error('The file has no ppt/presentation.xml; it may not be a PowerPoint file.')
  const rels = await relationships(zip, 'ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml')
  const slidePaths = findAll(presentation, 'p:sldId')
    .map((id) => rels.get(String(attr(id, 'r:id')))?.target)
    .filter((path): path is string => !!path)

  const chunks: Chunk[] = []
  for (const [index, path] of slidePaths.entries()) {
    const slide = await readXml(zip, path)
    if (!slide) continue
    const shapes = findAll(slide, 'p:sp')
    const isTitle = (shape: XmlNode) => {
      const placeholder = find(childrenOf(shape), 'p:ph')
      return !!placeholder && ['title', 'ctrTitle'].includes(String(attr(placeholder, 'type') ?? ''))
    }
    const title = shapes.filter(isTitle).flatMap((s) => paragraphs(childrenOf(s))).join(' ')
    const body = shapes.filter((s) => !isTitle(s)).flatMap((s) => paragraphs(childrenOf(s)))
    // Tables on slides are graphic frames, not shapes.
    const tables = findAll(slide, 'a:tbl').flatMap((t) =>
      findAll(childrenOf(t), 'a:tr').map((row) =>
        findAll(childrenOf(row), 'a:tc').map((c) => textOf(childrenOf(c), 'a:t').trim()).join(' | '),
      ),
    )

    const slideRels = await relationships(zip, path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'), path)
    const notesPath = [...slideRels.values()].find((r) => r.type.endsWith('/notesSlide'))?.target
    const notesXml = notesPath ? await readXml(zip, notesPath) : null
    // The notes page repeats the slide image and number; keep only the notes body.
    const notes = notesXml
      ? findAll(notesXml, 'p:sp')
          .filter((s) => String(attr(find(childrenOf(s), 'p:ph') ?? {}, 'type') ?? '') === 'body')
          .flatMap((s) => paragraphs(childrenOf(s)))
      : []

    const text = [title, ...body, ...tables, notes.length ? `Notes: ${notes.join(' ')}` : '']
      .filter(Boolean)
      .join('\n')
    for (const part of splitLong(text)) {
      chunks.push({ text: part, locator: title ? { slide: index + 1, title } : { slide: index + 1 } })
    }
  }
  return chunks
}
