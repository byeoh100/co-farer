import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

/**
 * Server actions. Every trip write goes through here (PLAN.md §2).
 * Actions run RBAC-off: each must call requireMember/requireOrganizer from
 * ./trip-access before touching trip data.
 *
 * Only Module 1 (Core) is stubbed. Later modules add their actions when
 * they are built — see PLAN.md §4 for each module's action list.
 */

const notImplemented =
  (name: string): ActionHandler<Env> =>
  async () => ({ success: false, error: `${name} is not implemented yet.`, code: 'not_implemented' })

export const actions: Record<string, ActionHandler<Env>> = {
  // Module 1 — Core
  createTrip: notImplemented('createTrip'), // { name, destination? } → { tripId, inviteCode }
  getInvite: notImplemented('getInvite'), // { inviteCode } → { tripName } (join page preview, no membership needed)
  joinTrip: notImplemented('joinTrip'), // { inviteCode } → { tripId }
  leaveTrip: notImplemented('leaveTrip'), // { tripId } — runs each built module's leave cleanup
  rotateInviteCode: notImplemented('rotateInviteCode'), // organizer
  setMyBudgets: notImplemented('setMyBudgets'), // { tripId, housing?, gas?, food?, activities?, publicCategories[] }
}
