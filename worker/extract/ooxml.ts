// Reading Office Open XML (DOCX, PPTX) parts: a zip of XML files.
//
// fast-xml-parser with preserveOrder keeps document order, which matters for
// headings and tables. Each node is { tagName: children[], ':@': attributes }.

import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

export type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> }

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
})

export async function openZip(buffer: Buffer) {
  try {
    return await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('The file is not a valid Office document (it could not be opened as a zip).')
  }
}

export async function readXml(zip: JSZip, path: string): Promise<XmlNode[] | null> {
  const file = zip.file(path)
  return file ? (parser.parse(await file.async('string')) as XmlNode[]) : null
}

/** The tag name of a node (its one key besides ':@'). */
export const tagOf = (node: XmlNode) => Object.keys(node).find((k) => k !== ':@') ?? ''

/** A node's children; text nodes ('#text') have none. */
export const childrenOf = (node: XmlNode): XmlNode[] => {
  const children = node[tagOf(node)]
  return Array.isArray(children) ? (children as XmlNode[]) : []
}

export const attr = (node: XmlNode, name: string) => node[':@']?.[name]

/** Depth-first search for the first descendant with this tag. */
export function find(nodes: XmlNode[], tag: string): XmlNode | undefined {
  for (const node of nodes) {
    if (tagOf(node) === tag) return node
    const hit = find(childrenOf(node), tag)
    if (hit) return hit
  }
  return undefined
}

/** Every descendant with this tag, in document order (not looking inside matches). */
export function findAll(nodes: XmlNode[], tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const node of nodes) {
    if (tagOf(node) === tag) out.push(node)
    else findAll(childrenOf(node), tag, out)
  }
  return out
}

/**
 * The visible text under some nodes: text runs (`textTag`, w:t or a:t), with
 * tabs and line breaks kept as whitespace.
 */
export function textOf(nodes: XmlNode[], textTag: string): string {
  let out = ''
  for (const node of nodes) {
    const tag = tagOf(node)
    if (tag === '#text') continue
    if (tag === textTag) out += childrenOf(node).map((t) => String(t['#text'] ?? '')).join('')
    else if (tag.endsWith(':tab')) out += '\t'
    else if (tag.endsWith(':br') || tag.endsWith(':cr')) out += '\n'
    else out += textOf(childrenOf(node), textTag)
  }
  return out
}
