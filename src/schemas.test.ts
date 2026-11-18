import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from './schemas'

describe('schemas', () => {
  it('pass the SDK schema linter (no silently unenforced rules)', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  it('keep constraints owner-only for every role', () => {
    const constraints = schemas.find((s) => s.name === 'constraints')!
    for (const [role, perms] of Object.entries(constraints.permissions)) {
      expect({ role, read: perms.read }).toEqual({ role, read: 'own' })
    }
  })

  it('block direct client writes to trip collections (writes go through actions)', () => {
    const tripCollections = ['trips', 'team_members', 'constraints', 'decisions', 'options', 'votes']
    for (const name of tripCollections) {
      const schema = schemas.find((s) => s.name === name)!
      for (const perms of Object.values(schema.permissions)) {
        expect({ name, create: perms.create, update: perms.update, delete: perms.delete }).toEqual({
          name,
          create: false,
          update: false,
          delete: false,
        })
      }
    }
  })
})
