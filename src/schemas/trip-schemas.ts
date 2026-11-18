/**
 * Trip Quorum — collection schemas.
 *
 * Access model (see PLAN.md §3):
 *  - A trip is a "team". Membership lives in `team_members` (the SDK's
 *    'team' permission level reads exactly this collection: teamId, userId,
 *    status). Every trip-scoped collection sets `teamField: 'tripId'` and
 *    `read: 'team'`, so a member sees only rows of trips they belong to.
 *  - `constraints` are private: `read: 'own'` on `userId`. Nobody else —
 *    not other members, not the organizer, not the app admin — can read them.
 *    Only server actions (RBAC-off) read them, and they return aggregates.
 *  - Clients never write these collections directly (`create: false`,
 *    `update: false`). `create` is a plain boolean with no membership check,
 *    so a direct write could inject rows into a trip the caller is not in.
 *    All writes go through server actions in src/actions/, which check
 *    membership, lock state and one-vote-per-member.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const SIGNED_IN_ROLES = ['viewer', 'member', 'admin'] as const

/** Same rule for every role. Admins are deliberately NOT granted extra reads. */
function sameForAllRoles(rule: RolePermissions): Record<string, RolePermissions> {
  return Object.fromEntries(SIGNED_IN_ROLES.map((role) => [role, rule]))
}

const teamReadOnly: RolePermissions = { read: 'team', create: false, update: false, delete: false }

export const tripsSchema: CollectionSchema = {
  name: 'trips',
  // The trip row's own id is the team id.
  teamField: '_rowId',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 120 },
    { name: 'destinationHint', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'organizerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Random, unguessable join code. Rotatable by the organizer.
    { name: 'inviteCode', storage: 'text', interpretation: 'plain', required: true },
    { name: 'currency', storage: 'text', interpretation: 'plain', default: 'USD' },
    // Cap on paid research calls for this trip (cost control).
    { name: 'researchCallsUsed', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** Membership. Name and columns are fixed by the SDK's 'team' permission. */
export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  teamField: 'teamId',
  uniqueOn: ['teamId', 'userId'],
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'left'] }, default: 'active' },
    { name: 'tripRole', storage: 'text', interpretation: { kind: 'select', options: ['organizer', 'member'] }, default: 'member' },
    { name: 'displayName', storage: 'text', interpretation: 'plain', maxLength: 80 },
    // Whether this member has saved constraints (not what they are).
    { name: 'hasConstraints', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** Private per-member constraints. Owner-only reads. */
export const constraintsSchema: CollectionSchema = {
  name: 'constraints',
  ownerField: 'userId',
  uniqueOn: ['tripId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Per-person ceiling for the whole trip, in the trip's currency.
    { name: 'budgetMax', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    {
      name: 'dietary',
      storage: 'text',
      interpretation: { kind: 'multiselect', options: ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher', 'nut allergy'] },
    },
    { name: 'mobility', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'dealbreakers', storage: 'text', interpretation: 'plain', maxLength: 500 },
  ],
  permissions: sameForAllRoles({ read: 'own', create: false, update: false, delete: false }),
}

/** A question the group must settle: "Where do we stay?" */
export const decisionsSchema: CollectionSchema = {
  name: 'decisions',
  teamField: 'tripId',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 140 },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['lodging', 'activity', 'food', 'dates', 'other'] } },
    { name: 'deadline', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'locked'] }, default: 'open' },
    { name: 'winningOptionId', storage: 'text', interpretation: 'plain' },
    { name: 'lockedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'reminderSentAt', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** A candidate answer to a decision, plus its research + group-fit result. */
export const optionsSchema: CollectionSchema = {
  name: 'options',
  teamField: 'tripId',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'decisionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'url', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'note', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    {
      name: 'researchStatus',
      storage: 'text',
      interpretation: { kind: 'select', options: ['none', 'running', 'done', 'failed'] },
      default: 'none',
    },
    // { summary, estPricePerPerson, pros[], cons[], dietaryNotes, sources[{title,url}] }
    { name: 'research', storage: 'text', interpretation: { kind: 'json' } },
    // Aggregate only: { overBudgetCount, dietaryConflicts, memberCount, notes[] } — never names.
    { name: 'groupFit', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** Approval vote: one row per (option, member). */
export const votesSchema: CollectionSchema = {
  name: 'votes',
  teamField: 'tripId',
  uniqueOn: ['optionId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'decisionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'optionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const tripSchemas: CollectionSchema[] = [
  tripsSchema,
  teamMembersSchema,
  constraintsSchema,
  decisionsSchema,
  optionsSchema,
  votesSchema,
]
