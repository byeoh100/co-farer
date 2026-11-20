import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from './schemas'

const TRIP_COLLECTIONS = ['trips', 'team_members', 'budgets', 'public_budgets']

describe('schemas', () => {
  it('pass the SDK schema linter (no silently unenforced rules)', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  it('keep budgets owner-only for every role', () => {
    const budgets = schemas.find((s) => s.name === 'budgets')!
    for (const [role, perms] of Object.entries(budgets.permissions)) {
      expect({ role, read: perms.read }).toEqual({ role, read: 'own' })
    }
  })

  it('block direct client writes to trip collections (writes go through actions)', () => {
    for (const name of TRIP_COLLECTIONS) {
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
