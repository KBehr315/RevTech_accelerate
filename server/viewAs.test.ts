// The API server's half of "View as" (db/migrations/00110): the header's shape,
// and previews refused anything but reads.

import { describe, expect, it } from 'vitest'
import { refuseWriteWhilePreviewing, viewAs } from './auth.ts'

const client = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('X-View-As', () => {
  it('reads a client id and a role', () => {
    expect(viewAs(undefined)).toBeNull()
    expect(viewAs(`${client}:learner`)).toEqual({ client_id: client, role: 'learner' })
  })

  it('refuses anything else', () => {
    for (const bad of ['', 'learner', `${client}`, `${client}:Learner`, `not-a-uuid:learner`, [`${client}:learner`]]) {
      expect(() => viewAs(bad)).toThrow('Invalid X-View-As header.')
    }
  })

  it('lets only reads through while previewing', () => {
    const preview = { client_id: client, role: 'learner' }
    for (const method of ['GET', 'HEAD']) expect(() => refuseWriteWhilePreviewing(method, preview)).not.toThrow()
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(() => refuseWriteWhilePreviewing(method, preview)).toThrow(/read-only/)
      expect(() => refuseWriteWhilePreviewing(method, null)).not.toThrow()
    }
  })
})
