/**
 * Module 1 (Core) server actions: trips, invites, membership, budgets, profile.
 *
 * Rules (PLAN.md §2, BUILD_GUIDE "Rules you never break"):
 *  - Actions run with record permissions OFF, so each trip action starts with
 *    requireMember / requireOrganizer. The caller is always ctx.userId.
 *  - Private budget figures never leave this file except back to their owner,
 *    and only the public projection (`public_budgets`) is written for others.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { BUDGET_CATEGORIES } from '../schemas/trip-schemas'
import {
  generateInviteCode, isInviteCodeShape, parseBudgetInput, parseImageUrl, parseText,
} from '../lib/core-input'
import { requireMember, requireOrganizer } from './trip-access'
import { runLeaveCleanup } from './leave-cleanup'

type Handler = ActionHandler<Env>

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })
const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

type MemberRow = {
  teamId: string
  userId: string
  status?: string
  tripRole?: string
  displayName?: string
  imageUrl?: string
} & Record<string, unknown>

/**
 * The caller's profile, read server-side (never trusted from params): their
 * Co-farer profile if set, else their sign-in name or email prefix.
 */
async function myProfile(tools: ActionTools, userId: string): Promise<{ displayName: string; imageUrl: string | null }> {
  const prof = await tools.query<{ displayName?: string; imageUrl?: string }>('profiles', { where: { userId }, limit: 1 })
  const p = prof.success ? prof.data.records[0]?.data : undefined
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  const u = res.success ? res.data.record.data : {}
  const fallback = (u.email ? u.email.split('@')[0] : 'Traveler').slice(0, 80)
  const signInName = parseText(u.name, 'Name', 80, false)
  const image = parseImageUrl(p?.imageUrl)
  return {
    displayName: p?.displayName || (signInName.ok && signInName.value) || fallback,
    imageUrl: image.ok ? image.value : null,
  }
}

async function findTripByCode(tools: ActionTools, inviteCode: unknown) {
  if (!isInviteCodeShape(inviteCode)) return null
  const res = await tools.query<{ name: string; inviteCode: string; organizerId: string }>('trips', {
    where: { inviteCode },
    limit: 1,
  })
  return res.success ? (res.data.records[0] ?? null) : null
}

async function findMembership(tools: ActionTools, tripId: string, userId: string) {
  const res = await tools.query<MemberRow>('team_members', { where: { teamId: tripId, userId }, limit: 1 })
  return res.success ? (res.data.records[0] ?? null) : null
}

const createTrip: Handler = async ({ userId, params, tools }) => {
  const name = parseText(params.name, 'Trip name', 120)
  if (!name.ok) return fail(name.error, 'bad_request')
  const destination = parseText(params.destination, 'Destination', 200, false)
  if (!destination.ok) return fail(destination.error, 'bad_request')

  const trip = await tools.create('trips', {
    name: name.value,
    destination: destination.value,
    organizerId: userId,
    inviteCode: generateInviteCode(),
  })
  if (!trip.success) return fail('Could not create the trip.', 'create_failed')
  const tripId = trip.data.recordId

  const profile = await myProfile(tools, userId)
  const member = await tools.create('team_members', {
    teamId: tripId,
    userId,
    status: 'active',
    tripRole: 'organizer',
    ...profile,
  })
  if (!member.success) {
    await tools.remove('trips', tripId)
    return fail('Could not create the trip.', 'create_failed')
  }
  return ok({ tripId })
}

/** Join-page preview. No membership needed; reveals only the trip name. */
const getInvite: Handler = async ({ userId, params, tools }) => {
  const trip = await findTripByCode(tools, params.inviteCode)
  if (!trip) return fail('This invite link is not valid. Ask the organizer for a new one.', 'invalid_invite')
  const membership = await findMembership(tools, trip.recordId, userId)
  return ok({
    tripName: trip.data.name,
    alreadyMember: membership?.data.status === 'active',
    // Only returned to existing members, who can already read the trip.
    tripId: membership?.data.status === 'active' ? trip.recordId : undefined,
  })
}

/** Safe to run twice; brings back a member who left. */
const joinTrip: Handler = async ({ userId, params, tools }) => {
  const trip = await findTripByCode(tools, params.inviteCode)
  if (!trip) return fail('This invite link is not valid. Ask the organizer for a new one.', 'invalid_invite')
  const tripId = trip.recordId
  const profile = await myProfile(tools, userId)

  const existing = await findMembership(tools, tripId, userId)
  if (existing) {
    if (existing.data.status !== 'active') {
      const res = await tools.update('team_members', existing.recordId, { status: 'active', ...profile })
      if (!res.success) return fail('Could not join the trip.', 'join_failed')
    }
    return ok({ tripId })
  }
  const created = await tools.create('team_members', {
    teamId: tripId,
    userId,
    status: 'active',
    tripRole: 'member',
    ...profile,
  })
  // A double click can race two creates; uniqueOn rejects the second.
  if (!created.success && !(await findMembership(tools, tripId, userId))) {
    return fail('Could not join the trip.', 'join_failed')
  }
  return ok({ tripId })
}

const leaveTrip: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  if (check.membership.tripRole === 'organizer') {
    return fail('The organizer can’t leave the trip.', 'organizer_cannot_leave')
  }
  await runLeaveCleanup(tools, check.membership.tripId, userId)
  const res = await tools.update('team_members', check.membership.recordId, { status: 'left' })
  if (!res.success) return fail('Could not leave the trip.', 'leave_failed')
  return ok({ left: true })
}

const rotateInviteCode: Handler = async ({ userId, params, tools }) => {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const inviteCode = generateInviteCode()
  const res = await tools.update('trips', check.membership.tripId, { inviteCode })
  if (!res.success) return fail('Could not make a new invite link.', 'rotate_failed')
  return ok({ inviteCode })
}

/**
 * Saves the caller's private budgets and syncs the public projection: a
 * `public_budgets` row exists exactly for categories that are public AND set.
 */
const setMyBudgets: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const parsed = parseBudgetInput(params)
  if (!parsed.ok) return fail(parsed.error, 'bad_request')
  const input = parsed.value

  const row = {
    housing: input.housing,
    gas: input.gas,
    food: input.food,
    activities: input.activities,
    publicCategories: JSON.stringify(input.publicCategories),
  }
  const existing = await tools.query('budgets', { where: { tripId, userId }, limit: 1 })
  if (!existing.success) return fail('Could not save your budgets.', 'save_failed')
  const current = existing.data.records[0]
  const saved = current
    ? await tools.update('budgets', current.recordId, row)
    : await tools.create('budgets', { tripId, userId, ...row })
  if (!saved.success) return fail('Could not save your budgets.', 'save_failed')

  const pub = await tools.query<{ category: string; amount: number }>('public_budgets', {
    where: { tripId, userId },
    limit: 10,
  })
  if (!pub.success) return fail('Saved, but could not update public budgets.', 'sync_failed')
  const byCategory = new Map(pub.data.records.map((r) => [r.data.category, r]))
  for (const category of BUDGET_CATEGORIES) {
    const amount = input[category]
    const shouldShow = input.publicCategories.includes(category) && amount != null
    const shown = byCategory.get(category)
    if (shouldShow && !shown) await tools.create('public_budgets', { tripId, userId, category, amount })
    else if (shouldShow && shown && shown.data.amount !== amount) await tools.update('public_budgets', shown.recordId, { amount })
    else if (!shouldShow && shown) await tools.remove('public_budgets', shown.recordId)
  }
  return ok({ saved: true })
}

/**
 * The one action that isn't about a single trip (approved exception): saves
 * the caller's own name and picture to `profiles`, then copies them into each
 * of the caller's memberships so tripmates see them. Touches only the
 * caller's rows.
 */
const updateMyProfile: Handler = async ({ userId, params, tools }) => {
  const name = parseText(params.name, 'Name', 80)
  if (!name.ok) return fail(name.error, 'bad_request')
  const image = parseImageUrl(params.imageUrl)
  if (!image.ok) return fail(image.error, 'bad_request')

  const profile = { displayName: name.value, imageUrl: image.value }
  const existing = await tools.query('profiles', { where: { userId }, limit: 1 })
  const current = existing.success ? existing.data.records[0] : undefined
  const saved = current
    ? await tools.update('profiles', current.recordId, profile)
    : await tools.create('profiles', { userId, ...profile })
  if (!saved.success) {
    console.error(`[updateMyProfile] profiles write failed: ${saved.error}`)
    return fail('Could not save your profile.', 'save_failed')
  }

  const rows = await tools.query<MemberRow>('team_members', { where: { userId }, limit: 500 })
  if (!rows.success) return fail('Saved, but could not update your trips.', 'sync_failed')
  for (const r of rows.data.records) {
    await tools.update('team_members', r.recordId, { displayName: name.value, imageUrl: image.value })
  }
  return ok({ saved: true })
}

export const coreActions: Record<string, Handler> = {
  createTrip,
  getInvite,
  joinTrip,
  leaveTrip,
  rotateInviteCode,
  setMyBudgets,
  updateMyProfile,
}
