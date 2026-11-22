/**
 * Module 4 (Transportation) server actions. Each starts with requireMember
 * and uses ctx.userId, never a userId from params.
 *
 * Pickup notes are owner-only rows; only the driver and the riders of that
 * car get them, through getCarPickups.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { claimsThatFit, parsePickupNote, parseTravelInput, parseTripGas } from '../lib/travel'
import { requireMember, requireOrganizer } from './trip-access'

type Handler = ActionHandler<Env>
type Row<T> = T & Record<string, unknown>

interface TravelRow {
  tripId: string
  userId: string
  mode?: string
  seats?: number | null
}
interface ClaimRow {
  tripId: string
  driverUserId: string
  riderUserId: string
  pickupVersion?: number
}

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })
const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

const EMPTY = { seats: null, mpg: null, startPoint: null, otherKind: null, details: null, fromDate: null, toDate: null }

async function findTravel(tools: ActionTools, tripId: string, userId: string) {
  const res = await tools.query<Row<TravelRow>>('travel', { where: { tripId, userId }, limit: 1 })
  return res.success ? (res.data.records[0] ?? null) : null
}

/** Creates or updates a person's travel row. */
async function saveTravel(tools: ActionTools, tripId: string, userId: string, fields: Record<string, unknown>) {
  const row = await findTravel(tools, tripId, userId)
  if (row) return tools.update('travel', row.recordId, fields)
  const created = await tools.create('travel', { tripId, userId, ...fields })
  // A concurrent first save may have created it (uniqueOn); update that one.
  if (created.success) return created
  const again = await findTravel(tools, tripId, userId)
  return again ? tools.update('travel', again.recordId, fields) : created
}

async function claimsForCar(tools: ActionTools, tripId: string, driverUserId: string) {
  const res = await tools.query<Row<ClaimRow>>('seat_claims', { where: { tripId, driverUserId }, limit: 100 })
  return res.success ? res.data.records : []
}

async function myClaim(tools: ActionTools, tripId: string, riderUserId: string) {
  const res = await tools.query<Row<ClaimRow>>('seat_claims', { where: { tripId, riderUserId }, limit: 1 })
  return res.success ? (res.data.records[0] ?? null) : null
}

/** Takes a rider out of their car: claim and pickup note gone, back to "not decided". */
async function releaseRider(tools: ActionTools, tripId: string, riderUserId: string, claimId?: string) {
  const claim = claimId ? { recordId: claimId } : await myClaim(tools, tripId, riderUserId)
  if (claim) await tools.remove('seat_claims', claim.recordId)
  await tools.deleteWhere('pickup_notes', { tripId, userId: riderUserId }, 10)
  const t = await findTravel(tools, tripId, riderUserId)
  if (t && t.data.mode === 'riding') await tools.update('travel', t.recordId, { mode: 'undecided', ...EMPTY })
}

/** A driver's car is gone (switched away, or left): every rider is released. */
export async function releaseCar(tools: ActionTools, tripId: string, driverUserId: string) {
  for (const c of await claimsForCar(tools, tripId, driverUserId)) await releaseRider(tools, tripId, c.data.riderUserId, c.recordId)
}

/** Driving (with seats), another way (with kind, details, dates), or not decided. */
const setMyTravel: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const input = parseTravelInput(params)
  if (!input.ok) return fail(input.error, 'bad_request')
  const v = input.value

  const current = await findTravel(tools, tripId, userId)
  const wasDriving = current?.data.mode === 'driving'
  if (v.mode === 'driving' && wasDriving) {
    const riders = (await claimsForCar(tools, tripId, userId)).length
    if (v.seats < riders) {
      return fail(`${riders} ${riders === 1 ? 'person is' : 'people are'} riding with you. Remove riders first, or keep at least ${riders} seats.`, 'seats_below_riders')
    }
  }
  if (wasDriving && v.mode !== 'driving') await releaseCar(tools, tripId, userId)
  // Switching to anything else gives up your seat in someone's car.
  const claim = await myClaim(tools, tripId, userId)
  if (claim) {
    await tools.remove('seat_claims', claim.recordId)
    await tools.deleteWhere('pickup_notes', { tripId, userId }, 10)
  }

  const res = await saveTravel(tools, tripId, userId, { ...EMPTY, ...v })
  if (!res.success) return fail('Could not save your travel.', 'save_failed')
  // Your own id (handy for the app and tests; it's only ever the caller's).
  return ok({ saved: true, userId })
}

/**
 * Tap a car to take a seat (switching cars if you had one). Two riders
 * grabbing the last seat at once: both insert, both re-count, and the later
 * claim is rolled back.
 */
const claimSeat: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const driverUserId = params.driverUserId
  if (typeof driverUserId !== 'string' || !driverUserId) return fail('driverUserId is required.', 'bad_request')
  if (driverUserId === userId) return fail('That’s your own car.', 'bad_request')
  const note = parsePickupNote(params.pickupNote)
  if (!note.ok) return fail(note.error, 'bad_request')

  const driverMember = await requireMember(tools, tripId, driverUserId)
  const driver = driverMember.ok ? await findTravel(tools, tripId, driverUserId) : null
  if (!driver || driver.data.mode !== 'driving') return fail('That car isn’t available.', 'not_a_car')
  const seats = driver.data.seats ?? 0
  const mine = await findTravel(tools, tripId, userId)
  if (mine?.data.mode === 'driving') return fail('You’re driving. Change your own travel first.', 'you_are_driving')

  const existing = await myClaim(tools, tripId, userId)
  if (existing?.data.driverUserId === driverUserId) return ok({ claimed: true, userId })
  const taken = await claimsForCar(tools, tripId, driverUserId)
  if (taken.length >= seats) return fail('That car is full.', 'car_full')
  if (existing) await tools.remove('seat_claims', existing.recordId)

  const created = await tools.create('seat_claims', { tripId, driverUserId, riderUserId: userId, pickupVersion: 0 })
  if (!created.success) return fail('Could not claim that seat. Try again.', 'claim_failed')
  const kept = claimsThatFit(await claimsForCar(tools, tripId, driverUserId), seats)
  if (!kept.some((c) => c.recordId === created.data.recordId)) {
    await tools.remove('seat_claims', created.data.recordId)
    await releaseRider(tools, tripId, userId)
    return fail('Someone just took the last seat in that car.', 'car_full')
  }

  await saveTravel(tools, tripId, userId, { ...EMPTY, mode: 'riding' })
  await tools.deleteWhere('pickup_notes', { tripId, userId }, 10)
  if (note.value) await tools.create('pickup_notes', { tripId, userId, note: note.value })
  return ok({ claimed: true, userId })
}

/** A rider leaves their seat, or the driver takes a rider out of their car. */
const releaseSeat: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const riderUserId = typeof params.riderUserId === 'string' && params.riderUserId ? params.riderUserId : userId
  const claim = await myClaim(tools, tripId, riderUserId)
  // Same answer for "no such claim" and "not your car".
  if (!claim || (riderUserId !== userId && claim.data.driverUserId !== userId)) {
    return fail('That seat wasn’t found.', 'not_found')
  }
  await releaseRider(tools, tripId, riderUserId, claim.recordId)
  return ok({ released: true })
}

/** Your pickup note, shown only to your car. Empty removes it. */
const setPickupNote: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const note = parsePickupNote(params.note)
  if (!note.ok) return fail(note.error, 'bad_request')
  const claim = await myClaim(tools, tripId, userId)
  if (!claim) return fail('Claim a seat first.', 'no_seat')
  await tools.deleteWhere('pickup_notes', { tripId, userId }, 10)
  if (note.value) await tools.create('pickup_notes', { tripId, userId, note: note.value })
  // Tell the car to refetch (a counter only; the note isn't in this row).
  await tools.update('seat_claims', claim.recordId, { pickupVersion: (claim.data.pickupVersion ?? 0) + 1 })
  return ok({ saved: true })
}

/** The pickup notes of one car, for its driver and riders only. */
const getCarPickups: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const driverUserId = params.driverUserId
  if (typeof driverUserId !== 'string' || !driverUserId) return fail('driverUserId is required.', 'bad_request')
  const claims = await claimsForCar(tools, tripId, driverUserId)
  const inCar = driverUserId === userId || claims.some((c) => c.data.riderUserId === userId)
  if (!inCar) return fail('Only the people in this car can see its pickup notes.', 'not_in_car')
  const notes: Array<{ riderUserId: string; note: string }> = []
  for (const c of claims) {
    const res = await tools.query<Row<{ note?: string }>>('pickup_notes', { where: { tripId, userId: c.data.riderUserId }, limit: 1 })
    const n = res.success ? res.data.records[0]?.data.note : undefined
    if (n) notes.push({ riderUserId: c.data.riderUserId, note: n })
  }
  return ok({ notes })
}

/** Stretch (gas): the organizer sets the one-way miles and the gas price (null = the default). */
const setTripGas: Handler = async ({ userId, params, tools }) => {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const input = parseTripGas(params)
  if (!input.ok) return fail(input.error, 'bad_request')
  const res = await tools.update('trips', check.membership.tripId, { tripMiles: input.miles, gasPrice: input.price })
  if (!res.success) return fail('Could not save the gas settings.', 'save_failed')
  return ok({ saved: true })
}

export const travelActions: Record<string, Handler> = {
  setMyTravel, claimSeat, releaseSeat, setPickupNote, getCarPickups, setTripGas,
}

/** Leave cleanup: your seat and note go; if you drove, your riders are released; your travel row goes. */
export async function cleanupTravelOnLeave(tools: ActionTools, tripId: string, userId: string): Promise<void> {
  await releaseCar(tools, tripId, userId)
  await releaseRider(tools, tripId, userId)
  await tools.deleteWhere('travel', { tripId, userId }, 10)
}
