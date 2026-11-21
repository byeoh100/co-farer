/**
 * Co-farer — Module 1 (Core) schemas.
 *
 * Only the Core module's collections live here. Later modules add their own
 * schema files when they are built (see PLAN.md — one module at a time).
 *
 * Access model (PLAN.md §2):
 *  - A trip is a "team". Membership lives in `team_members` (the SDK's
 *    'team' permission reads exactly this collection: teamId, userId,
 *    status). Trip-scoped collections set `read: 'team'` + a `teamField`,
 *    so members see only rows of trips they belong to.
 *  - `budgets` holds every budget figure and is owner-only (`read: 'own'`).
 *    Nobody else — other members, the organizer, the app admin — can read it.
 *  - `public_budgets` is a projection: one row per category a person has
 *    switched to public. Server actions write it; members can read it.
 *  - Clients never write these collections directly. `create` has no
 *    membership check, so a direct write could inject rows into another
 *    trip. All writes go through server actions in src/actions/.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const SIGNED_IN_ROLES = ['viewer', 'member', 'admin'] as const

/** Same rule for every role. Admins are deliberately NOT granted extra reads. */
function sameForAllRoles(rule: RolePermissions): Record<string, RolePermissions> {
  return Object.fromEntries(SIGNED_IN_ROLES.map((role) => [role, rule]))
}

const teamReadOnly: RolePermissions = { read: 'team', create: false, update: false, delete: false }
const ownReadOnly: RolePermissions = { read: 'own', create: false, update: false, delete: false }

/** Budget categories. Essentials (housing, gas) make up the total. */
export const BUDGET_CATEGORIES = ['housing', 'gas', 'food', 'activities'] as const
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]
export const ESSENTIAL_CATEGORIES: readonly BudgetCategory[] = ['housing', 'gas']

export const tripsSchema: CollectionSchema = {
  name: 'trips',
  // The trip row's own id is the team id.
  teamField: '_rowId',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 120 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'organizerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Random, unguessable join code. Rotatable by the organizer.
    { name: 'inviteCode', storage: 'text', interpretation: 'plain', required: true },
    { name: 'currency', storage: 'text', interpretation: 'plain', default: 'USD' },
    // AI research calls used by this trip (cap: PLAN.md §6). Shared by
    // housing, activities and food.
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
    // 'left' keeps the row so the notes board can gray out that person's notes.
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'left'] }, default: 'active' },
    { name: 'tripRole', storage: 'text', interpretation: { kind: 'select', options: ['organizer', 'member'] }, default: 'member' },
    { name: 'displayName', storage: 'text', interpretation: 'plain', maxLength: 80 },
    // Has this person finished their settings? (Not what they entered.)
    { name: 'onboarded', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** Private budgets: one row per (trip, person), all four categories. */
export const budgetsSchema: CollectionSchema = {
  name: 'budgets',
  ownerField: 'userId',
  uniqueOn: ['tripId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Per-person amounts for the whole trip, in the trip currency. Null = not set.
    { name: 'housing', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    { name: 'gas', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    { name: 'food', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    { name: 'activities', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    // Categories this person chose to make public. Private by default.
    {
      name: 'publicCategories',
      storage: 'text',
      interpretation: { kind: 'multiselect', options: [...BUDGET_CATEGORIES] },
    },
  ],
  permissions: sameForAllRoles(ownReadOnly),
}

/**
 * Public projection of budgets. A row exists only while that person has
 * that category switched to public. Written only by `setMyBudgets`.
 */
export const publicBudgetsSchema: CollectionSchema = {
  name: 'public_budgets',
  teamField: 'tripId',
  uniqueOn: ['tripId', 'userId', 'category'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: [...BUDGET_CATEGORIES] }, required: true },
    { name: 'amount', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 }, required: true },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const coreSchemas: CollectionSchema[] = [
  tripsSchema,
  teamMembersSchema,
  budgetsSchema,
  publicBudgetsSchema,
]
