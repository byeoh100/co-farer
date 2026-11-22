/**
 * Test plumbing, not a feature: `cleanupMyTestTrips` deletes the trips the
 * caller organizes that are older than 15 minutes, with all of their rows.
 * Tests run in parallel and one account organizes trips in several of them,
 * so only old trips are removed: a trip a running test still uses is never
 * touched, and the number of test trips stays small instead of growing. Automated tests call it after each
 * test so test accounts don't pile up trips (past ~100 trips, DeepSpace's
 * team read rule exceeds SQLite's variable limit; PLAN.md §2).
 *
 * Refused unless isLocalTestAccount: a local server AND a @deepspace.test
 * caller. It can never run on the live site or for a real account.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isLocalTestAccount } from './local-test'

/** Every trip-scoped collection, with the column holding the trip id. */
const TRIP_ROWS: Array<[collection: string, tripField: string]> = [
  ['pickup_notes', 'tripId'],
  ['seat_claims', 'tripId'],
  ['travel', 'tripId'],
  ['votes', 'tripId'],
  ['options', 'tripId'],
  ['boards', 'tripId'],
  ['availability', 'tripId'],
  ['public_budgets', 'tripId'],
  ['budgets', 'tripId'],
  ['team_members', 'teamId'],
]

async function drain(tools: ActionTools, collection: string, where: Record<string, unknown>) {
  for (let i = 0; i < 50; i++) {
    const res = await tools.deleteWhere(collection, where, 500)
    if (!res.success || res.data.deleted < 500) return
  }
}

/** Longer than a whole test run, so no running test loses its trip. */
const MIN_AGE_MS = 15 * 60_000

const cleanupMyTestTrips: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (!(await isLocalTestAccount(env, tools, userId))) {
    return { success: false, error: 'Not available.', code: 'not_available' }
  }
  const mine = await tools.query('trips', { where: { organizerId: userId }, limit: 500 })
  if (!mine.success) return { success: false, error: mine.error, code: 'query_failed' }
  const cutoff = Date.now() - MIN_AGE_MS
  const old = mine.data.records.filter((t) => Date.parse(t.createdAt) < cutoff)
  for (const trip of old) {
    for (const [collection, field] of TRIP_ROWS) await drain(tools, collection, { [field]: trip.recordId })
    await tools.remove('trips', trip.recordId)
  }
  return { success: true, data: { deleted: old.length } }
}

export const testCleanupActions: Record<string, ActionHandler<Env>> = { cleanupMyTestTrips }
