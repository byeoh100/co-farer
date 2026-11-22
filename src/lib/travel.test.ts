import { describe, expect, it } from 'vitest'
import { buildBoard, claimsThatFit, parsePickupNote, parseTravelInput, type TravelEntry } from './travel'

const entry = (userId: string, over: Partial<TravelEntry> = {}): TravelEntry => ({
  userId, mode: 'undecided', seats: null, startPoint: null, otherKind: null, details: null, fromDate: null, toDate: null, ...over,
})

describe('parseTravelInput', () => {
  it('accepts driving with 1–12 passenger seats and an optional start', () => {
    expect(parseTravelInput({ mode: 'driving', seats: '3', startPoint: '  Isla  Vista ' })).toEqual({
      ok: true, value: { mode: 'driving', seats: 3, startPoint: 'Isla Vista' },
    })
    for (const seats of [0, 13, 2.5, 'x', null]) expect(parseTravelInput({ mode: 'driving', seats }).ok).toBe(false)
  })
  it('refuses riding (you claim a seat instead) and unknown modes', () => {
    expect(parseTravelInput({ mode: 'riding' })).toEqual({ ok: false, error: 'Tap a car to claim a seat.' })
    expect(parseTravelInput({ mode: 'teleport' }).ok).toBe(false)
  })
  it('takes another way with a kind, details and from/to dates', () => {
    expect(parseTravelInput({ mode: 'other', otherKind: 'train', details: 'Surfliner', fromDate: '2027-03-19', toDate: '' })).toEqual({
      ok: true, value: { mode: 'other', otherKind: 'train', details: 'Surfliner', fromDate: '2027-03-19', toDate: null },
    })
    expect(parseTravelInput({ mode: 'other', otherKind: 'rocket' }).ok).toBe(false)
    expect(parseTravelInput({ mode: 'other', otherKind: 'flight', fromDate: '2027-03-21', toDate: '2027-03-19' }).ok).toBe(false)
    expect(parseTravelInput({ mode: 'other', otherKind: 'flight', fromDate: 'soon' }).ok).toBe(false)
    expect(parseTravelInput({ mode: 'other', otherKind: 'bus', details: 'x'.repeat(301) }).ok).toBe(false)
  })
})

describe('parsePickupNote', () => {
  it('trims, empties to null and caps length', () => {
    expect(parsePickupNote('  123 Main St ')).toEqual({ ok: true, value: '123 Main St' })
    expect(parsePickupNote('')).toEqual({ ok: true, value: null })
    expect(parsePickupNote('x'.repeat(201)).ok).toBe(false)
  })
})

describe('claimsThatFit', () => {
  it('keeps the earliest claims when two riders grab the last seat', () => {
    const claims = [
      { recordId: 'b', createdAt: '2027-01-01T00:00:02Z' },
      { recordId: 'a', createdAt: '2027-01-01T00:00:01Z' },
      { recordId: 'c', createdAt: '2027-01-01T00:00:02Z' },
    ]
    expect(claimsThatFit(claims, 2).map((c) => c.recordId)).toEqual(['a', 'b'])
    expect(claimsThatFit(claims, 0)).toEqual([])
  })
})

describe('buildBoard', () => {
  const members = ['d1', 'd2', 'r1', 'r2', 'f1', 'u1', 'orphan']
  const entries = [
    entry('d1', { mode: 'driving', seats: 2 }),
    entry('d2', { mode: 'driving', seats: 1, startPoint: 'LA' }),
    entry('r1', { mode: 'riding' }),
    entry('r2', { mode: 'riding' }),
    entry('f1', { mode: 'other', otherKind: 'flight' }),
    entry('orphan', { mode: 'riding' }),
    entry('gone', { mode: 'driving', seats: 4 }),
  ]
  const claims = [
    { driverUserId: 'd1', riderUserId: 'r1' },
    { driverUserId: 'd2', riderUserId: 'r2' },
    { driverUserId: 'gone', riderUserId: 'orphan' },
  ]
  const board = buildBoard(members, entries, claims)

  it('groups cars by start point, the meeting point first', () => {
    expect(board.groups.map((g) => g.startPoint)).toEqual([null, 'LA'])
    expect(board.groups[0].cars).toEqual([{ driverId: 'd1', seats: 2, riders: ['r1'], full: false }])
    expect(board.groups[1].cars[0]).toMatchObject({ driverId: 'd2', full: true })
  })
  it('counts seats left, lists other ways, and treats seatless riders as not decided', () => {
    expect(board.seatsLeft).toBe(1)
    expect(board.carCount).toBe(2)
    expect(board.others.map((e) => e.userId)).toEqual(['f1'])
    // u1 has no row; orphan's driver left the trip.
    expect(board.undecided).toEqual(['u1', 'orphan'])
  })
})
