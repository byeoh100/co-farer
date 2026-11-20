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
  /** Fewer than SMALL_GROUP_THRESHOLD responses: UI shows a softer message. */
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
    tooFewResponses: set.length < SMALL_GROUP_THRESHOLD,
  }
}

export interface PriceBand {
  low: number
  high: number
}

/**
 * Rough group price band for AI search queries ("about $100–$200 per
 * person"). Uses the middle of the group's budgets, rounded outward to
 * PRICE_BAND_STEP. Returns null with too few responses, so the AI searches
 * without a price instead of revealing one person's number.
 */
export function groupPriceBand(budgets: Array<number | null | undefined>): PriceBand | null {
  const set = budgets
    .filter((b): b is number => typeof b === 'number' && Number.isFinite(b) && b >= 0)
    .sort((a, b) => a - b)
  if (set.length < SMALL_GROUP_THRESHOLD) return null
  const q = (p: number) => {
    const i = (set.length - 1) * p
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return set[lo] + (set[hi] - set[lo]) * (i - lo)
  }
  const low = Math.floor(q(0.25) / PRICE_BAND_STEP) * PRICE_BAND_STEP
  let high = Math.ceil(q(0.75) / PRICE_BAND_STEP) * PRICE_BAND_STEP
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
