/**
 * What happens when the organizer unlocks the dates. Each module that
 * depends on the dates adds its own step here when it is built.
 * Module 3 (Housing) will add: board → waiting_for_dates, clear votes,
 * mark options stale (PLAN.md §4.2 edge cases).
 */

import type { ActionTools } from 'deepspace/worker'

type UnlockStep = (tools: ActionTools, tripId: string) => Promise<void>

const steps: UnlockStep[] = []

export async function runDatesUnlockSteps(tools: ActionTools, tripId: string): Promise<void> {
  for (const step of steps) await step(tools, tripId)
}
