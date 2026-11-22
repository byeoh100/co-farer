/**
 * Budget math. Pure functions so they can be unit-tested.
 *
 * Planned Changes Spec, Change 1: every budget that's set counts, public or
 * private, and nothing is hidden or rounded. Fit counts always show. Outputs
 * shown to the group (fit counts, the search's price) never name anyone or
 * repeat one person's private figure on its own row; private numbers stay in
 * the owner-only `budgets` table and are read only server-side.
 */

import type { BudgetCategory } from '../schemas/trip-schemas'
import { ESSENTIAL_CATEGORIES } from '../schemas/trip-schemas'

export interface CategoryFit {
  memberCount: number
  /** Active members who set a budget for this category (public or private). */
  respondedCount: number
  /** Responders whose budget is below the estimated price. */
  overBudgetCount: number
  /** Price unknown ("price not found"): fit not checked. */
  priceUnknown: boolean
}

/**
 * How one option's per-person price fits the group's budgets for one
 * category. `budgets` must already be filtered to active members; anyone
 * without a budget (null) is skipped.
 */
export function computeCategoryFit(
  budgets: Array<number | null | undefined>,
  memberCount: number,
  estPricePerPerson: number | null | undefined,
): CategoryFit {
  const set = budgets.filter((b): b is number => typeof b === 'number' && Number.isFinite(b))
  const priceUnknown = estPricePerPerson == null || !Number.isFinite(estPricePerPerson)
  const overBudgetCount = priceUnknown ? 0 : set.filter((b) => b < (estPricePerPerson as number)).length
  return { memberCount, respondedCount: set.length, overBudgetCount, priceUnknown }
}

export interface PriceBand {
  /** The average of every budget that's set, to the cent (no rounding to a step). */
  perPerson: number
}

/**
 * The price the AI searches around: the average of all set budgets, public
 * or private (people without one are skipped). The search scales it to the
 * group (per person × group size). Null when nobody has set one.
 */
export function groupPriceBand(budgets: Array<number | null | undefined>): PriceBand | null {
  const set = budgets.filter((b): b is number => typeof b === 'number' && Number.isFinite(b) && b >= 0)
  if (set.length === 0) return null
  return { perPerson: Math.round((set.reduce((s, b) => s + b, 0) / set.length) * 100) / 100 }
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
