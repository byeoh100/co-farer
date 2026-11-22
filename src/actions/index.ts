import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { coreActions } from './core'
import { datesActions } from './dates'
import { engineActions } from './engine'
import { travelActions } from './travel'
import { notesActions } from './notes'
import { foodActions } from './food'
import { testCleanupActions } from './test-cleanup'

/**
 * Server actions. Every trip write goes through here (PLAN.md §2).
 * Actions run RBAC-off: each must call requireMember/requireOrganizer from
 * ./trip-access before touching trip data.
 *
 * Later modules add their actions when they are built (PLAN.md §4).
 */
export const actions: Record<string, ActionHandler<Env>> = {
  ...coreActions, // Module 1: Core
  ...datesActions, // Module 2: Dates
  ...engineActions, // Module 3: Housing (the shared engine)
  ...travelActions, // Module 4: Transportation
  ...notesActions, // Module 5: Notes
  ...foodActions, // Additional (Modules 6–7): food preferences
  ...testCleanupActions, // local test accounts only (refused everywhere else)
}
