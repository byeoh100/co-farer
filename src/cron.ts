/**
 * Scheduled tasks (DeepSpace cron). `budget-visibility` (hourly) moves older
 * budget rows to the single public/private switch. And:
 *
 * `housing-deadlines` (every 15 minutes): any open lockable board whose
 * deadline has passed locks its top-voted option; a tie keeps it open with
 * voting closed for the organizer to pick (PLAN.md §4.3). Votes after the
 * deadline settle it immediately too, so this is the backstop for boards
 * nobody touches.
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { createActionTools } from './server/action-routes'
import { settleDeadline, type BoardRow } from './actions/engine'
import { migrateBudgetVisibility } from './actions/core'

export const tasks: CronTask[] = [
  { name: 'housing-deadlines', intervalMinutes: 15 },
  // Planned Changes Spec, Change 1: older budget rows get the single switch. Idempotent.
  { name: 'budget-visibility', intervalMinutes: 60 },
]

export async function runTask(name: string, env: unknown): Promise<void> {
  const e = env as Env
  if (name === 'budget-visibility') {
    const n = await migrateBudgetVisibility(createActionTools(e, e.OWNER_USER_ID, ''))
    if (n > 0) console.info(`[cron] budget-visibility: migrated ${n} budget rows`)
    return
  }
  if (name !== 'housing-deadlines') return
  // System identity (the app owner); no caller JWT, and no integrations are used.
  const tools = createActionTools(e, e.OWNER_USER_ID, '')
  const res = await tools.query<BoardRow & Record<string, unknown>>('boards', { where: { status: 'open', lockable: 1 }, limit: 500 })
  if (!res.success) {
    console.error(`[cron] housing-deadlines: could not list boards: ${res.error}`)
    return
  }
  const now = Date.now()
  for (const b of res.data.records) {
    if (b.data.deadline && Date.parse(b.data.deadline) <= now) {
      const outcome = await settleDeadline(tools, b.recordId, b.data)
      console.info(`[cron] housing-deadlines: board ${b.recordId} → ${outcome}`)
    }
  }
}
