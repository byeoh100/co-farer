import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from './schemas'

const TRIP_COLLECTIONS = ['trips', 'team_members', 'budgets', 'public_budgets', 'availability', 'boards', 'options', 'votes', 'travel', 'seat_claims', 'pickup_notes', 'notes', 'food_prefs']

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

  it('give non-admins no direct writes to users (so never to their role)', () => {
    const users = schemas.find((s) => s.name === 'users')!
    for (const role of ['viewer', 'member']) {
      expect(users.permissions[role]).toMatchObject({ read: 'own', create: false, update: false, delete: false })
    }
  })

  it('keep pickup notes owner-only (the car gets them through getCarPickups)', () => {
    const notes = schemas.find((s) => s.name === 'pickup_notes')!
    for (const p of Object.values(notes.permissions)) expect(p.read).toBe('own')
  })

  it('keep profiles owner-only and server-written', () => {
    const profiles = schemas.find((s) => s.name === 'profiles')!
    for (const p of Object.values(profiles.permissions)) {
      expect(p).toMatchObject({ read: 'own', create: false, update: false, delete: false })
    }
  })

  it('keep names and pictures out of the app-wide user list', () => {
    // Members see each other only through team_members (per trip).
    expect(schemas.find((s) => s.name === 'users')!.roster).toBe('read-policy')
  })
})
