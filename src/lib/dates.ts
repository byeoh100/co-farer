/**
 * Date logic for Module 2. Dates are calendar days as YYYY-MM-DD strings,
 * computed in UTC so no time zone can shift a day. Pure functions, unit-tested,
 * shared by the worker (the real checks) and the UI.
 */

export const MAX_RANGE_DAYS = 60
export const MAX_RANGES_PER_PERSON = 20

export interface DateRange {
  start: string
  end: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** A real calendar day in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && fromUtc(toUtc(value)) === value
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * 86_400_000)
}

/** Number of days in [start, end], counting both ends. */
export function rangeLength(r: DateRange): number {
  return Math.round((toUtc(r.end) - toUtc(r.start)) / 86_400_000) + 1
}

export function eachDay(r: DateRange): string[] {
  const out: string[] = []
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Today's date where the code runs, as YYYY-MM-DD (local calendar day). */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export type Checked = { ok: true; range: DateRange } | { ok: false; error: string }

/**
 * Validates a range someone enters. `today` is the earliest allowed end;
 * the worker passes yesterday (UTC) so nobody west of UTC is refused today.
 */
export function checkRange(start: unknown, end: unknown, today: string): Checked {
  if (!isIsoDate(start) || !isIsoDate(end)) return { ok: false, error: 'Dates must be real days (YYYY-MM-DD).' }
  if (end < start) return { ok: false, error: 'The end date can’t be before the start date.' }
  if (end < today) return { ok: false, error: 'That range is already in the past.' }
  if (rangeLength({ start, end }) > MAX_RANGE_DAYS) return { ok: false, error: `A range can be at most ${MAX_RANGE_DAYS} days.` }
  return { ok: true, range: { start, end } }
}

/** Overlapping or touching (end + 1 day = next start). */
export function rangesTouch(a: DateRange, b: DateRange): boolean {
  return a.start <= addDays(b.end, 1) && b.start <= addDays(a.end, 1)
}

/**
 * Blends a new range into one person's existing ranges: every existing range
 * that overlaps or touches it (directly or through another) is absorbed.
 * Returns the merged range and which existing ranges it replaces.
 */
export function mergeRange<T extends DateRange>(existing: T[], added: DateRange): { merged: DateRange; absorbed: T[] } {
  let merged = { ...added }
  const absorbed: T[] = []
  let remaining = [...existing]
  let changed = true
  while (changed) {
    changed = false
    for (const r of remaining) {
      if (rangesTouch(merged, r)) {
        merged = { start: r.start < merged.start ? r.start : merged.start, end: r.end > merged.end ? r.end : merged.end }
        absorbed.push(r)
        remaining = remaining.filter((x) => x !== r)
        changed = true
        break
      }
    }
  }
  return { merged, absorbed }
}

export interface PersonRange extends DateRange {
  userId: string
}

/**
 * Who is free on each day. Only `activeUserIds` count, and a person counts
 * once per day however many of their ranges cover it.
 */
export function freeByDay(ranges: PersonRange[], activeUserIds: Iterable<string>): Map<string, Set<string>> {
  const active = new Set(activeUserIds)
  const out = new Map<string, Set<string>>()
  for (const r of ranges) {
    if (!active.has(r.userId) || !isIsoDate(r.start) || !isIsoDate(r.end) || r.end < r.start) continue
    for (const day of eachDay(r)) {
      const set = out.get(day) ?? new Set<string>()
      set.add(r.userId)
      out.set(day, set)
    }
  }
  return out
}

/** People free on every day of `span` (used for the locked dates). */
export function freeForWholeSpan(byDay: Map<string, Set<string>>, span: DateRange): Set<string> {
  const [first, ...rest] = eachDay(span)
  let common = new Set<string>(byDay.get(first) ?? [])
  for (const day of rest) {
    const free = byDay.get(day)
    common = new Set([...common].filter((u) => free?.has(u)))
    if (common.size === 0) break
  }
  return common
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mar 19 – 21", "Mar 30 – Apr 2", "Dec 30, 2026 – Jan 2, 2027". */
export function formatRange(r: DateRange): string {
  const [ys, ms, ds] = r.start.split('-').map(Number)
  const [ye, me, de] = r.end.split('-').map(Number)
  if (r.start === r.end) return `${MONTHS[ms - 1]} ${ds}`
  if (ys !== ye) return `${MONTHS[ms - 1]} ${ds}, ${ys} – ${MONTHS[me - 1]} ${de}, ${ye}`
  if (ms === me) return `${MONTHS[ms - 1]} ${ds} – ${de}`
  return `${MONTHS[ms - 1]} ${ds} – ${MONTHS[me - 1]} ${de}`
}

/** "2027-03" → weeks (Sunday first) of YYYY-MM-DD days, null for padding cells. */
export function monthGrid(month: string): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: lead }, () => null)
  for (let d = 0; d < days; d++) cells.push(addDays(first, d))
  while (cells.length % 7) cells.push(null)
  const weeks: Array<Array<string | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** "2027-03" ± n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${LONG_MONTHS[m - 1]} ${y}`
}
