// The production image installs dependencies only (npm ci --omit=dev in the
// Dockerfile). A package that the server or worker imports outside tests but
// that is listed under devDependencies works locally and in CI, then crashes
// the deployed app on start. This catches that before it ships.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(rel)
    return /\.(ts|js)$/.test(entry.name) && !/\.test\.(ts|js)$/.test(entry.name) ? [rel] : []
  })
}

/** 'pdf-lib' from "pdf-lib", '@azure/identity' from "@azure/identity/foo". */
const packageOf = (specifier: string) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

describe('runtime packages', () => {
  it('lists everything the server and worker import under dependencies', () => {
    const imported = new Set<string>()
    for (const file of [...sourceFiles('server'), ...sourceFiles('worker')]) {
      const text = fs.readFileSync(path.join(root, file), 'utf8')
      for (const [, specifier] of text.matchAll(/(?:from|import)\s*\(?\s*'([^'.][^']*)'/g)) {
        if (!specifier.startsWith('node:')) imported.add(packageOf(specifier))
      }
    }
    const missing = [...imported].filter((name) => !(name in (pkg.dependencies ?? {}))).sort()
    expect(missing).toEqual([])
  })
})
