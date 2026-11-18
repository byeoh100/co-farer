/**
 * Membership checks for server actions.
 *
 * Actions run with per-record RBAC OFF (X-App-Action), so every action that
 * touches a trip must call one of these first. The caller id comes from the
 * verified JWT via ActionContext.userId — never from params.
 */

import type { ActionTools } from 'deepspace/worker'

export type TripRole = 'organizer' | 'member'

export interface Membership {
  recordId: string
  tripId: string
  userId: string
  tripRole: TripRole
}

export type MembershipCheck =
  | { ok: true; membership: Membership }
  | { ok: false; error: string; code: 'not_a_member' | 'not_organizer' | 'bad_request' }

export async function requireMember(
  tools: ActionTools,
  tripId: unknown,
  userId: string,
): Promise<MembershipCheck> {
  if (typeof tripId !== 'string' || tripId.length === 0) {
    return { ok: false, error: 'tripId is required.', code: 'bad_request' }
  }
  const res = await tools.query<{ teamId: string; userId: string; status?: string; tripRole?: TripRole }>(
    'team_members',
    { where: { teamId: tripId, userId }, limit: 1 },
  )
  const row = res.success ? res.data.records[0] : undefined
  if (!row || (row.data.status && row.data.status !== 'active')) {
    // Same message whether the trip exists or not: don't confirm trip ids.
    return { ok: false, error: 'You are not a member of this trip.', code: 'not_a_member' }
  }
  return {
    ok: true,
    membership: {
      recordId: row.recordId,
      tripId,
      userId,
      tripRole: row.data.tripRole ?? 'member',
    },
  }
}

export async function requireOrganizer(
  tools: ActionTools,
  tripId: unknown,
  userId: string,
): Promise<MembershipCheck> {
  const check = await requireMember(tools, tripId, userId)
  if (!check.ok) return check
  if (check.membership.tripRole !== 'organizer') {
    return { ok: false, error: 'Only the trip organizer can do this.', code: 'not_organizer' }
  }
  return check
}
