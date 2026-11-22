/**
 * What happens when the organizer unlocks the dates. Each module that
 * depends on the dates adds its own step here when it is built.
 * Module 3 (Housing): board → waiting_for_dates; its places and votes are
 * cleared (PLAN.md §4.2 edge cases).
 */

import type { ActionTools } from 'deepspace/worker'
import { resetHousingForDates } from './engine'

type UnlockStep = (tools: ActionTools, tripId: string) => Promise<void>

const steps: UnlockStep[] = [
  // Module 3: housing waits for new dates; places and votes cleared.
  resetHousingForDates,
]

export async function runDatesUnlockSteps(tools: ActionTools, tripId: string): Promise<void> {
  for (const step of steps) await step(tools, tripId)
}
