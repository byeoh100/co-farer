/**
 * Input checks for the Core actions. Pure functions, so they're unit-tested
 * and shared by the worker (the real check) and the UI (early feedback).
 */

import { BUDGET_CATEGORIES, type BudgetCategory } from '../schemas/trip-schemas'

/** Unambiguous characters: no 0/O or 1/l/I. 56 symbols. */
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export const INVITE_CODE_LENGTH = 12

/** Random invite code, about 70 bits of entropy. Rejection sampling avoids modulo bias. */
export function generateInviteCode(random: (n: number) => Uint8Array = defaultRandom): string {
  const limit = 256 - (256 % INVITE_ALPHABET.length)
  let out = ''
  while (out.length < INVITE_CODE_LENGTH) {
    for (const byte of random(INVITE_CODE_LENGTH * 2)) {
      if (byte < limit && out.length < INVITE_CODE_LENGTH) out += INVITE_ALPHABET[byte % INVITE_ALPHABET.length]
    }
  }
  return out
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function isInviteCodeShape(code: unknown): code is string {
  return typeof code === 'string' && code.length === INVITE_CODE_LENGTH && [...code].every((c) => INVITE_ALPHABET.includes(c))
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** Trims and collapses whitespace; required, 1..max characters. */
export function parseText(raw: unknown, label: string, max: number, required = true): Parsed<string | null> {
  if (raw == null || raw === '') return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text.` }
  const value = raw.replace(/\s+/g, ' ').trim()
  if (!value) return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null }
  if (value.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` }
  return { ok: true, value }
}

export const MAX_BUDGET = 100_000

/** `isPublic` null = not given (keep the current setting; new budgets are public). */
export type BudgetInput = Record<BudgetCategory, number | null> & { isPublic: boolean | null }

/**
 * Validates setMyBudgets params. Each category is blank (null) or a whole
 * number of dollars from 0 to MAX_BUDGET. `isPublic` is one switch for the
 * whole budget (true, false, or left out).
 */
export function parseBudgetInput(params: Record<string, unknown>): Parsed<BudgetInput> {
  const out = { isPublic: null } as BudgetInput
  for (const category of BUDGET_CATEGORIES) {
    const raw = params[category]
    if (raw == null || raw === '') {
      out[category] = null
      continue
    }
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(n) || n < 0 || n > MAX_BUDGET) {
      return { ok: false, error: `The ${category} budget must be a whole number from 0 to ${MAX_BUDGET}.` }
    }
    out[category] = n
  }
  if (params.isPublic != null && typeof params.isPublic !== 'boolean') return { ok: false, error: 'isPublic must be true or false.' }
  out.isPublic = typeof params.isPublic === 'boolean' ? params.isPublic : null
  return { ok: true, value: out }
}

/**
 * Is this stored budget row public? Rows saved since Change 1 carry
 * `isPublic`. Older rows (no `isPublic`) are public if any category was
 * public under the old switches, so nobody is shown without choosing it.
 */
export function readIsPublic(data: Record<string, unknown>): boolean {
  const v = data.isPublic
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  return readPublicCategories(data.publicCategories).length > 0
}

/** Legacy: the old per-category switches, stored as a JSON array. Unknown values are dropped. */
export function readPublicCategories(raw: unknown): BudgetCategory[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  return Array.isArray(list) ? list.filter((c): c is BudgetCategory => (BUDGET_CATEGORIES as readonly unknown[]).includes(c)) : []
}

/**
 * Profile pictures must come from this app's own public file storage
 * (`useR2Files({ scope: 'app' })` returns `<origin>/api/files/<key>?scope=app`;
 * the page stores the path part, see `toStoredImagePath`), so nobody can point their avatar at a tracking pixel or another site.
 */
export function parseImageUrl(raw: unknown): Parsed<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string' || raw.length > 500) return { ok: false, error: 'Invalid picture.' }
  if (!/^\/api\/files\/[A-Za-z0-9._~%/-]+\?scope=app$/.test(raw) || raw.includes('..')) {
    return { ok: false, error: 'Pictures must be uploaded to Co-farer.' }
  }
  return { ok: true, value: raw }
}

/** First letter of the first name, for the default avatar. */
export function avatarInitial(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  const ch = [...first][0]
  return ch ? ch.toUpperCase() : '?'
}

/** Turns an upload result URL into the origin-free path parseImageUrl accepts. */
export function toStoredImagePath(url: string): string | null {
  try {
    const u = new URL(url, 'http://local')
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}
