/**
 * Budget math. This file is the privacy boundary of the app.
 *
 * Inputs may contain other people's private budgets. Outputs that are shown
 * to the group (fit counts, price band) must never contain user ids or
 * exact individual figures. Pure functions so they can be unit-tested.
 */

import type { BudgetCategory } from '../schemas/trip-schemas'
import { ESSENTIAL_CATEGORIES } from '../schemas/trip-schemas'

/** Below this many responses, counts could identify a person. */
export const SMALL_GROUP_THRESHOLD = 3

/**
 * Trips with this many members or fewer skip the threshold (the human's
 * decision): a solo traveler only sees their own budget, and two people
 * travelling together already know each other's. From 3 members on, the
 * threshold applies again.
 */
export const OPEN_GROUP_MAX_MEMBERS = 2

/** How many budgets must be set before counts (or a price band) are used. */
export function minResponses(memberCount: number): number {
  return memberCount <= OPEN_GROUP_MAX_MEMBERS ? 1 : SMALL_GROUP_THRESHOLD
}

/** Price bands are rounded to this step so no exact budget shows through. */
export const PRICE_BAND_STEP = 50

export interface CategoryFit {
  memberCount: number
  /** Active members who set a budget for this category. */
  respondedCount: number
  /** Responders whose budget is below the estimated price. */
  overBudgetCount: number
  /** Price unknown ("price not found"): fit not checked. */
  priceUnknown: boolean
  /** Fewer than minResponses(memberCount) responses: UI shows a softer message. */
  tooFewResponses: boolean
}

/**
 * How one option's per-person price fits the group's budgets for one
 * category. `budgets` must already be filtered to active members.
 */
export function computeCategoryFit(
  budgets: Array<number | null | undefined>,
  memberCount: number,
  estPricePerPerson: number | null | undefined,
): CategoryFit {
  const set = budgets.filter((b): b is number => typeof b === 'number' && Number.isFinite(b))
  const priceUnknown = estPricePerPerson == null || !Number.isFinite(estPricePerPerson)
  const overBudgetCount = priceUnknown ? 0 : set.filter((b) => b < (estPricePerPerson as number)).length
  return {
    memberCount,
    respondedCount: set.length,
    overBudgetCount,
    priceUnknown,
    tooFewResponses: set.length < minResponses(memberCount),
  }
}

export interface PriceBand {
  low: number
  high: number
}

/**
 * Rough group price band for AI search queries ("about $100–$200 per
 * person"), rounded outward to PRICE_BAND_STEP so no exact budget shows.
 *
 * - Everyone has set a budget: the middle half of the budgets.
 * - Only some have (the human's decision): centered on the average of the
 *   budgets set, so those budgets still count, and the people without one
 *   are assumed to be at that average. The search also gets the whole
 *   group's total (per person × group size), so it covers everyone.
 * - Null with no budgets, or with just one budget in a trip of 3+ members,
 *   since that would be one person's number. Trips of 1–2 members use any
 *   budget set (see OPEN_GROUP_MAX_MEMBERS).
 */
export function groupPriceBand(budgets: Array<number | null | undefined>, memberCount: number): PriceBand | null {
  const set = budgets
    .filter((b): b is number => typeof b === 'number' && Number.isFinite(b) && b >= 0)
    .sort((a, b) => a - b)
  if (set.length === 0) return null
  if (memberCount > OPEN_GROUP_MAX_MEMBERS && set.length < 2) return null
  let lowRaw: number
  let highRaw: number
  if (set.length < memberCount) {
    lowRaw = highRaw = set.reduce((sum, b) => sum + b, 0) / set.length
  } else {
    const q = (p: number) => {
      const i = (set.length - 1) * p
      const lo = Math.floor(i)
      const hi = Math.ceil(i)
      return set[lo] + (set[hi] - set[lo]) * (i - lo)
    }
    lowRaw = q(0.25)
    highRaw = q(0.75)
  }
  const low = Math.floor(lowRaw / PRICE_BAND_STEP) * PRICE_BAND_STEP
  let high = Math.ceil(highRaw / PRICE_BAND_STEP) * PRICE_BAND_STEP
  if (high <= low) high = low + PRICE_BAND_STEP
  return { low, high }
}

export interface CategoryLine {
  category: BudgetCategory
  budget: number | null
  /** Estimated cost from the trip so far (e.g. locked housing), or null. */
  estimate: number | null
  /** Flag only — going over is never blocked. */
  over: boolean
  essential: boolean
}

export interface BudgetSummary {
  lines: CategoryLine[]
  /** Sum of essential budgets (housing + gas) that are set. */
  totalBudget: number
  /** Sum of essential estimates that are known. */
  totalEstimate: number
  totalOver: boolean
}

/** The person's own page: their budgets vs. estimates. Never shown to others. */
export function summarizeMyBudget(
  budget: Partial<Record<BudgetCategory, number | null>>,
  estimates: Partial<Record<BudgetCategory, number | null>>,
  categories: readonly BudgetCategory[],
): BudgetSummary {
  const lines = categories.map((category): CategoryLine => {
    const b = budget[category] ?? null
    const e = estimates[category] ?? null
    return {
      category,
      budget: b,
      estimate: e,
      over: b != null && e != null && e > b,
      essential: ESSENTIAL_CATEGORIES.includes(category),
    }
  })
  const essentials = lines.filter((l) => l.essential)
  const totalBudget = essentials.reduce((s, l) => s + (l.budget ?? 0), 0)
  const totalEstimate = essentials.reduce((s, l) => s + (l.estimate ?? 0), 0)
  return { lines, totalBudget, totalEstimate, totalOver: totalEstimate > totalBudget && totalBudget > 0 }
}
