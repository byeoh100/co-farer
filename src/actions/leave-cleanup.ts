/**
 * What happens to a person's data when they leave a trip (PLAN.md §2).
 * Each module adds its own step here when it is built.
 *
 * Their `team_members` row is kept with status 'left' (by leaveTrip), so
 * later modules can gray out their notes. Their private `budgets` row is kept
 * too: only they can read it, and it's back if they rejoin.
 */

import type { ActionTools } from 'deepspace/worker'
import { cleanupTravelOnLeave } from './travel'

type CleanupStep = (tools: ActionTools, tripId: string, userId: string) => Promise<void>

/** Drain-delete every matching row (deleteWhere removes at most `limit` per call). */
async function deleteAll(tools: ActionTools, collection: string, where: Record<string, unknown>) {
  for (let i = 0; i < 50; i++) {
    const res = await tools.deleteWhere(collection, where, 500)
    if (!res.success || res.data.deleted < 500) return
  }
}

const steps: CleanupStep[] = [
  // Module 1: others stop seeing this person's public budgets.
  (tools, tripId, userId) => deleteAll(tools, 'public_budgets', { tripId, userId }),
  // Module 2: their availability stops counting (decided with the human).
  (tools, tripId, userId) => deleteAll(tools, 'availability', { tripId, userId }),
  // Module 3: their votes are removed (spec: edge cases).
  (tools, tripId, userId) => deleteAll(tools, 'votes', { tripId, userId }),
  // Module 4: their seat claim and travel go; if they drove, their riders are released.
  cleanupTravelOnLeave,
  // Module 5: nothing. Their notes stay on the board, grayed out (spec: edge cases).
]

export async function runLeaveCleanup(tools: ActionTools, tripId: string, userId: string): Promise<void> {
  for (const step of steps) await step(tools, tripId, userId)
}
