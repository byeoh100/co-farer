import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

/**
 * Server actions. Every trip write goes through here (see PLAN.md §3–4).
 * Actions run RBAC-off: each one must call requireMember/requireOrganizer
 * from ./trip-access before touching trip data.
 *
 * Stubs below are the planned surface; each is implemented on the day
 * listed in PLAN.md §8.
 */

const notImplemented =
  (name: string): ActionHandler<Env> =>
  async () => ({ success: false, error: `${name} is not implemented yet.`, code: 'not_implemented' })

export const actions: Record<string, ActionHandler<Env>> = {
  // Day 1 — trips & membership
  createTrip: notImplemented('createTrip'), // { name, destinationHint? } → { tripId }
  joinTrip: notImplemented('joinTrip'), // { inviteCode } → { tripId }
  leaveTrip: notImplemented('leaveTrip'), // { tripId }
  rotateInviteCode: notImplemented('rotateInviteCode'), // organizer

  // Day 2 — decisions, options, voting
  createDecision: notImplemented('createDecision'), // { tripId, title, kind, deadline? }
  addOption: notImplemented('addOption'), // { decisionId, title, url?, note? }
  toggleVote: notImplemented('toggleVote'), // { optionId } — refuses when locked
  lockDecision: notImplemented('lockDecision'), // organizer; { decisionId, optionId? } → picks top if omitted

  // Day 3 — private constraints, research, group fit
  setMyConstraints: notImplemented('setMyConstraints'), // { tripId, budgetMax?, dietary?, mobility?, dealbreakers? }
  researchOption: notImplemented('researchOption'), // { optionId } — Exa + Anthropic, capped per trip
  refreshGroupFit: notImplemented('refreshGroupFit'), // { decisionId } — recompute aggregates
}
