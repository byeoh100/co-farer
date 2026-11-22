/**
 * Module 4 (Transportation): pure logic shared by the server actions and the
 * carpool board. No network here, so all of it is unit-tested.
 */

import { OTHER_KINDS, type OtherKind, type TravelMode } from '../schemas/travel-schemas'
import { isIsoDate } from './dates'

export const MAX_SEATS = 12
export const MAX_START_POINT = 120
export const MAX_DETAILS = 300
export const MAX_PICKUP_NOTE = 200

export const OTHER_KIND_LABELS: Record<OtherKind, string> = {
  flight: 'Flight',
  train: 'Train',
  bus: 'Bus',
  dropoff: 'Drop-off',
  other: 'Other',
}

/** What setMyTravel stores (riding is set only by claiming a seat). */
export type TravelInput =
  | { mode: 'undecided' }
  | { mode: 'driving'; seats: number; startPoint: string | null }
  | { mode: 'other'; otherKind: OtherKind; details: string | null; fromDate: string | null; toDate: string | null }

const text = (v: unknown, max: number): string | null | false => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') return false
  const t = v.replace(/\s+/g, ' ').trim()
  if (t.length > max) return false
  return t || null
}

/** Checks setMyTravel's params. Riding is refused here: you claim a seat instead. */
export function parseTravelInput(p: Record<string, unknown>): { ok: true; value: TravelInput } | { ok: false; error: string } {
  const mode = p.mode
  if (mode === 'undecided') return { ok: true, value: { mode } }
  if (mode === 'riding') return { ok: false, error: 'Tap a car to claim a seat.' }
  if (mode === 'driving') {
    const seats = Number(p.seats)
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
      return { ok: false, error: `Seats must be a whole number from 1 to ${MAX_SEATS} (not counting you).` }
    }
    const startPoint = text(p.startPoint, MAX_START_POINT)
    if (startPoint === false) return { ok: false, error: `The starting point can be at most ${MAX_START_POINT} characters.` }
    return { ok: true, value: { mode, seats, startPoint } }
  }
  if (mode === 'other') {
    if (!(OTHER_KINDS as readonly unknown[]).includes(p.otherKind)) return { ok: false, error: 'Pick how you’re getting there.' }
    const details = text(p.details, MAX_DETAILS)
    if (details === false) return { ok: false, error: `Details can be at most ${MAX_DETAILS} characters.` }
    const fromDate = p.fromDate == null || p.fromDate === '' ? null : p.fromDate
    const toDate = p.toDate == null || p.toDate === '' ? null : p.toDate
    if ((fromDate != null && !isIsoDate(fromDate)) || (toDate != null && !isIsoDate(toDate))) {
      return { ok: false, error: 'Dates must be real days.' }
    }
    if (fromDate && toDate && toDate < fromDate) return { ok: false, error: 'The “to” date can’t be before the “from” date.' }
    return { ok: true, value: { mode, otherKind: p.otherKind as OtherKind, details, fromDate, toDate } }
  }
  return { ok: false, error: 'Pick how you’re getting there.' }
}

/** The pickup note: trimmed, at most MAX_PICKUP_NOTE, empty → null. */
export function parsePickupNote(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = text(v, MAX_PICKUP_NOTE)
  if (t === false) return { ok: false, error: `The pickup note can be at most ${MAX_PICKUP_NOTE} characters.` }
  return { ok: true, value: t }
}

interface ClaimLike {
  recordId: string
  createdAt?: string
}

/**
 * Who keeps a seat when a car is over capacity: the earliest claims (by
 * creation time, then id). Two riders grabbing the last seat at once both
 * insert, both re-count, and only the earlier one stays.
 */
export function claimsThatFit<T extends ClaimLike>(claims: T[], seats: number): T[] {
  return [...claims]
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.recordId.localeCompare(b.recordId))
    .slice(0, Math.max(0, seats))
}

// ── The carpool board ────────────────────────────────────────────────────

export interface TravelEntry {
  userId: string
  mode: TravelMode
  seats: number | null
  startPoint: string | null
  otherKind: OtherKind | null
  details: string | null
  fromDate: string | null
  toDate: string | null
}

export interface Car {
  driverId: string
  seats: number
  riders: string[]
  full: boolean
}

export interface CarGroup {
  /** The starting point's label; null = the trip's meeting point (or none set). */
  startPoint: string | null
  cars: Car[]
}

export interface Board {
  groups: CarGroup[]
  others: TravelEntry[]
  undecided: string[]
  seatsLeft: number
  carCount: number
}

const sameStart = (a: string | null, b: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/**
 * Lays out the board for the active members: cars grouped by the driver's
 * starting point (the meeting point first), then "another way", then not
 * decided. Riders without a seat (their car was removed) count as undecided.
 */
export function buildBoard(
  memberIds: string[],
  entries: TravelEntry[],
  claims: Array<{ driverUserId: string; riderUserId: string }>,
): Board {
  const active = new Set(memberIds)
  const byUser = new Map(entries.filter((e) => active.has(e.userId)).map((e) => [e.userId, e]))
  const drivers = memberIds.filter((u) => byUser.get(u)?.mode === 'driving')
  const driverSet = new Set(drivers)
  const ridersOf = new Map<string, string[]>()
  const seated = new Set<string>()
  for (const c of claims) {
    if (!driverSet.has(c.driverUserId) || !active.has(c.riderUserId)) continue
    ridersOf.set(c.driverUserId, [...(ridersOf.get(c.driverUserId) ?? []), c.riderUserId])
    seated.add(c.riderUserId)
  }

  const groups: CarGroup[] = []
  for (const d of drivers) {
    const e = byUser.get(d)!
    const seats = e.seats ?? 0
    const riders = ridersOf.get(d) ?? []
    const car: Car = { driverId: d, seats, riders, full: riders.length >= seats }
    const group = groups.find((g) => sameStart(g.startPoint, e.startPoint))
    if (group) group.cars.push(car)
    else groups.push({ startPoint: e.startPoint, cars: [car] })
  }
  groups.sort((a, b) => (a.startPoint == null ? -1 : b.startPoint == null ? 1 : a.startPoint.localeCompare(b.startPoint)))

  const others = memberIds.map((u) => byUser.get(u)).filter((e): e is TravelEntry => e?.mode === 'other')
  const undecided = memberIds.filter((u) => {
    const mode = byUser.get(u)?.mode ?? 'undecided'
    return mode === 'undecided' || (mode === 'riding' && !seated.has(u))
  })
  const cars = groups.flatMap((g) => g.cars)
  return {
    groups,
    others,
    undecided,
    seatsLeft: cars.reduce((n, c) => n + Math.max(0, c.seats - c.riders.length), 0),
    carCount: cars.length,
  }
}
