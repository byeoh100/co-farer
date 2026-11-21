/**
 * Module 2 (Dates) server actions. Each starts with requireMember or
 * requireOrganizer and uses ctx.userId, never a userId from params.
 */

import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { MAX_RANGES_PER_PERSON, MAX_RANGE_DAYS, addDays, checkRange, isIsoDate, mergeRange, rangeLength } from '../lib/dates'
import { requireMember, requireOrganizer } from './trip-access'
import { runDatesUnlockSteps } from './dates-unlock'

type Handler = ActionHandler<Env>
type RangeRow = { tripId: string; userId: string; start: string; end: string } & Record<string, unknown>

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })
const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

/** Yesterday in UTC: the earliest allowed range end, so no time zone is refused "today". */
function earliestEnd(): string {
  return addDays(new Date().toISOString().slice(0, 10), -1)
}

async function datesLocked(tools: Parameters<Handler>[0]['tools'], tripId: string): Promise<boolean> {
  const trip = await tools.get<{ datesStatus?: string }>('trips', tripId)
  return trip.success && trip.data.record.data.datesStatus === 'locked'
}

const LOCKED = 'The dates are locked. Ask the organizer to unlock them to change availability.'

/** Adds your own range, blending it with any of yours it overlaps or touches. */
const addAvailability: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const range = checkRange(params.start, params.end, earliestEnd())
  if (!range.ok) return fail(range.error, 'bad_request')
  if (await datesLocked(tools, tripId)) return fail(LOCKED, 'dates_locked')

  const mine = await tools.query<RangeRow>('availability', { where: { tripId, userId }, limit: 200 })
  if (!mine.success) return fail('Could not save your dates.', 'save_failed')
  const existing = mine.data.records.map((r) => ({ id: r.recordId, start: r.data.start, end: r.data.end }))
  const { merged, absorbed } = mergeRange(existing, range.range)
  if (existing.length - absorbed.length + 1 > MAX_RANGES_PER_PERSON) {
    return fail(`You can have at most ${MAX_RANGES_PER_PERSON} date ranges. Remove one first.`, 'too_many_ranges')
  }
  // Already fully covered by one of your ranges: nothing to change.
  if (absorbed.length === 1 && absorbed[0].start === merged.start && absorbed[0].end === merged.end) {
    return ok({ rangeId: absorbed[0].id, merged: false })
  }
  const created = await tools.create('availability', { tripId, userId, ...merged })
  if (!created.success) return fail('Could not save your dates.', 'save_failed')
  for (const r of absorbed) await tools.remove('availability', r.id)
  return ok({ rangeId: created.data.recordId, merged: absorbed.length > 0 })
}

/** Removes one of your own ranges. */
const removeAvailability: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  if (typeof params.rangeId !== 'string') return fail('rangeId is required.', 'bad_request')
  const row = await tools.get<RangeRow>('availability', params.rangeId)
  // Same answer for "not found" and "not yours", so ids can't be probed.
  if (!row.success || row.data.record.data.tripId !== tripId || row.data.record.data.userId !== userId) {
    return fail('That date range wasn’t found.', 'not_found')
  }
  if (await datesLocked(tools, tripId)) return fail(LOCKED, 'dates_locked')
  const res = await tools.remove('availability', params.rangeId)
  if (!res.success) return fail('Could not remove that range.', 'remove_failed')
  return ok({ removed: true })
}

const lockDates: Handler = async ({ userId, params, tools }) => {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const { start, end } = params
  if (!isIsoDate(start) || !isIsoDate(end)) return fail('Dates must be real days (YYYY-MM-DD).', 'bad_request')
  if (end < start) return fail('The end date can’t be before the start date.', 'bad_request')
  if (rangeLength({ start, end }) > MAX_RANGE_DAYS) return fail(`A trip can be at most ${MAX_RANGE_DAYS} days.`, 'bad_request')
  const res = await tools.update('trips', check.membership.tripId, { datesStatus: 'locked', datesStart: start, datesEnd: end })
  if (!res.success) return fail('Could not lock the dates.', 'lock_failed')
  return ok({ locked: true })
}

const unlockDates: Handler = async ({ userId, params, tools }) => {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  await runDatesUnlockSteps(tools, tripId)
  const res = await tools.update('trips', tripId, { datesStatus: 'open', datesStart: null, datesEnd: null })
  if (!res.success) return fail('Could not unlock the dates.', 'unlock_failed')
  return ok({ unlocked: true })
}

export const datesActions: Record<string, Handler> = { addAvailability, removeAvailability, lockDates, unlockDates }
