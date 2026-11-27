import { describe, expect, it } from 'vitest'
import {
  addDays, checkRange, eachDay, formatRange, freeByDay, freeForWholeSpan, isIsoDate,
  localToday, mergeRange, rangeLength,
} from './dates'

describe('day math', () => {
  it('validates real days only', () => {
    expect(isIsoDate('2027-03-19')).toBe(true)
    for (const bad of ['2027-02-30', '2027-3-19', '19-03-2027', '', 5, null]) expect(isIsoDate(bad)).toBe(false)
  })
  it('adds days across months, years and leap days', () => {
    expect(addDays('2027-03-31', 1)).toBe('2027-04-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('counts both ends and isn’t shifted by daylight saving', () => {
    expect(rangeLength({ start: '2027-03-13', end: '2027-03-15' })).toBe(3) // US DST starts Mar 14
    expect(eachDay({ start: '2027-03-13', end: '2027-03-15' })).toEqual(['2027-03-13', '2027-03-14', '2027-03-15'])
  })
  it('reads the local calendar day', () => {
    expect(localToday(new Date(2027, 2, 5, 23, 30))).toBe('2027-03-05')
  })
})

describe('checkRange', () => {
  const today = '2027-01-10'
  it('accepts a single day and normal ranges', () => {
    expect(checkRange('2027-01-10', '2027-01-10', today).ok).toBe(true)
    expect(checkRange('2027-03-19', '2027-03-21', today)).toEqual({ ok: true, range: { start: '2027-03-19', end: '2027-03-21' } })
  })
  it('allows a range that started in the past but hasn’t ended', () => {
    expect(checkRange('2027-01-01', '2027-01-12', today).ok).toBe(true)
  })
  it('refuses reversed, past, too long and invalid ranges', () => {
    expect(checkRange('2027-03-21', '2027-03-19', today).ok).toBe(false)
    expect(checkRange('2027-01-01', '2027-01-09', today).ok).toBe(false)
    expect(checkRange('2027-03-01', addDays('2027-03-01', 60), today).ok).toBe(false) // 61 days
    expect(checkRange('2027-03-01', addDays('2027-03-01', 59), today).ok).toBe(true) // 60 days
    expect(checkRange('nope', '2027-03-01', today).ok).toBe(false)
  })
})

describe('mergeRange (blending your own ranges)', () => {
  const r = (start: string, end: string) => ({ start, end })
  it('blends an overlapping range', () => {
    const existing = [r('2027-03-01', '2027-03-05')]
    expect(mergeRange(existing, r('2027-03-04', '2027-03-08'))).toEqual({ merged: r('2027-03-01', '2027-03-08'), absorbed: existing })
  })
  it('blends a touching range (no gap day)', () => {
    expect(mergeRange([r('2027-03-01', '2027-03-03')], r('2027-03-04', '2027-03-06')).merged).toEqual(r('2027-03-01', '2027-03-06'))
  })
  it('keeps a range with a gap day separate', () => {
    expect(mergeRange([r('2027-03-01', '2027-03-03')], r('2027-03-05', '2027-03-06'))).toEqual({ merged: r('2027-03-05', '2027-03-06'), absorbed: [] })
  })
  it('bridges two ranges into one', () => {
    const existing = [r('2027-03-01', '2027-03-03'), r('2027-03-10', '2027-03-12'), r('2027-04-01', '2027-04-02')]
    const out = mergeRange(existing, r('2027-03-04', '2027-03-09'))
    expect(out.merged).toEqual(r('2027-03-01', '2027-03-12'))
    expect(out.absorbed).toHaveLength(2)
  })
  it('a range inside an existing one changes nothing but absorbs it', () => {
    expect(mergeRange([r('2027-03-01', '2027-03-10')], r('2027-03-03', '2027-03-04')).merged).toEqual(r('2027-03-01', '2027-03-10'))
  })
})

describe('freeByDay (overlap counts)', () => {
  const ranges = [
    { userId: 'a', start: '2027-03-01', end: '2027-03-03' },
    { userId: 'a', start: '2027-03-03', end: '2027-03-04' }, // a overlaps themself on the 3rd
    { userId: 'b', start: '2027-03-03', end: '2027-03-05' },
    { userId: 'gone', start: '2027-03-01', end: '2027-03-05' }, // left the trip
  ]
  const byDay = freeByDay(ranges, ['a', 'b', 'c'])
  it('counts each active person once per day', () => {
    expect(byDay.get('2027-03-03')).toEqual(new Set(['a', 'b']))
    expect(byDay.get('2027-03-01')).toEqual(new Set(['a']))
    expect(byDay.get('2027-03-05')).toEqual(new Set(['b']))
    expect(byDay.has('2027-03-06')).toBe(false)
  })
  it('ignores people who left', () => {
    expect([...byDay.values()].some((s) => s.has('gone'))).toBe(false)
  })
  it('finds who is free for a whole span', () => {
    expect(freeForWholeSpan(byDay, { start: '2027-03-03', end: '2027-03-04' })).toEqual(new Set(['a', 'b']))
    expect(freeForWholeSpan(byDay, { start: '2027-03-01', end: '2027-03-05' })).toEqual(new Set())
  })
})

describe('formatRange', () => {
  it('reads naturally', () => {
    expect(formatRange({ start: '2027-03-19', end: '2027-03-21' })).toBe('Mar 19 – 21')
    expect(formatRange({ start: '2027-03-30', end: '2027-04-02' })).toBe('Mar 30 – Apr 2')
    expect(formatRange({ start: '2027-03-19', end: '2027-03-19' })).toBe('Mar 19')
    expect(formatRange({ start: '2026-12-30', end: '2027-01-02' })).toBe('Dec 30, 2026 – Jan 2, 2027')
  })
})

describe('month grid', async () => {
  const { monthGrid, shiftMonth, monthLabel } = await import('./dates')
  it('starts on Sunday and pads to whole weeks', () => {
    const weeks = monthGrid('2027-03') // Mar 1 2027 is a Monday
    expect(weeks[0]).toEqual([null, '2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06'])
    expect(weeks.flat().filter(Boolean)).toHaveLength(31)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })
  it('handles leap Februaries and month shifts', () => {
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(monthLabel('2027-03')).toBe('March 2027')
  })
})

describe('bestWindows (stretch)', () => {
  // A: 10–14, B: 12–16, C: 13–13 (March 2027).
  const ranges = [
    { userId: 'a', start: '2027-03-10', end: '2027-03-14' },
    { userId: 'b', start: '2027-03-12', end: '2027-03-16' },
    { userId: 'c', start: '2027-03-13', end: '2027-03-13' },
  ]
  it('ranks by people free every day, then person-days, without overlaps', async () => {
    const { bestWindows, freeByDay } = await import('./dates')
    const byDay = freeByDay(ranges, ['a', 'b', 'c'])
    const w = bestWindows(byDay, 2, '2027-03-01')
    // 12–14: A and B free throughout (+ C on the 13th) beats everything else.
    expect(w[0]).toEqual({ start: '2027-03-12', end: '2027-03-14', freeAll: 2, personDays: 7 })
    expect(w.every((x, i) => w.slice(i + 1).every((y) => y.start > x.end || y.end < x.start))).toBe(true)
    expect(w.length).toBeLessThanOrEqual(3)
  })
  it('skips the past and windows nobody can make, and handles no data', async () => {
    const { bestWindows, freeByDay } = await import('./dates')
    const byDay = freeByDay(ranges, ['a', 'b', 'c'])
    expect(bestWindows(byDay, 2, '2027-03-14')).toEqual([{ start: '2027-03-14', end: '2027-03-16', freeAll: 1, personDays: 4 }])
    expect(bestWindows(byDay, 10, '2027-03-01')).toEqual([])
    expect(bestWindows(new Map(), 2, '2027-03-01')).toEqual([])
  })
})

import { overviewWindow, weekdayLetter } from './dates'

describe('overviewWindow', () => {
  it('centres 14 days on the locked dates', () => {
    const w = overviewWindow({ start: '2027-03-19', end: '2027-03-21' }, [], '2026-11-27')
    expect(w).toHaveLength(14)
    expect(w[0]).toBe('2027-03-13')
    expect(w).toContain('2027-03-21')
  })
  it('starts at the earliest availability still ahead, else today', () => {
    expect(overviewWindow(null, [{ start: '2027-01-05', end: '2027-01-08' }, { start: '2026-11-01', end: '2026-11-02' }], '2026-11-27')[0]).toBe('2027-01-05')
    expect(overviewWindow(null, [{ start: '2026-11-20', end: '2026-12-02' }], '2026-11-27')[0]).toBe('2026-11-27')
    expect(overviewWindow(null, [], '2026-11-27')[0]).toBe('2026-11-27')
  })
  it('names weekdays', () => {
    expect(weekdayLetter('2027-03-19')).toBe('F')
  })
})
