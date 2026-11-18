/**
 * Group fit: turns private constraints into an aggregate that is safe to
 * show every trip member.
 *
 * This is the privacy boundary of the app. The input contains other people's
 * budgets; the output must contain only counts, never user ids, names, or
 * individual figures. Pure function so it can be unit-tested exhaustively.
 */

export interface PrivateConstraint {
  userId: string
  budgetMax?: number | null
  dietary?: string[] | null
}

export interface OptionFacts {
  /** Estimated per-person cost from research, in the trip currency. */
  estPricePerPerson?: number | null
  /** Dietary tags the option is known to accommodate (from research). */
  accommodates?: string[] | null
}

export interface GroupFit {
  memberCount: number
  /** Members who have saved constraints at all. */
  respondedCount: number
  /** Members whose ceiling is below the estimated price. */
  overBudgetCount: number
  /** Dietary needs (by tag) not known to be accommodated, with counts. */
  unmetDietary: Array<{ tag: string; count: number }>
  /** True when the price is unknown, so budget fit could not be checked. */
  priceUnknown: boolean
}

/**
 * Below this many responders, counts could identify a person ("1 of 2 is
 * over budget" in a two-person trip). We still return the count; the UI
 * shows a softer message. Exposed for the UI and tests.
 */
export const SMALL_GROUP_THRESHOLD = 3

export function computeGroupFit(
  constraints: PrivateConstraint[],
  memberCount: number,
  option: OptionFacts,
): GroupFit {
  const price = option.estPricePerPerson
  const priceUnknown = price == null || !Number.isFinite(price)

  let overBudgetCount = 0
  const dietaryCounts = new Map<string, number>()
  const accommodated = new Set((option.accommodates ?? []).map((t) => t.toLowerCase()))

  for (const c of constraints) {
    if (!priceUnknown && c.budgetMax != null && c.budgetMax < (price as number)) {
      overBudgetCount += 1
    }
    for (const tag of c.dietary ?? []) {
      const key = tag.toLowerCase()
      if (!accommodated.has(key)) dietaryCounts.set(key, (dietaryCounts.get(key) ?? 0) + 1)
    }
  }

  return {
    memberCount,
    respondedCount: constraints.length,
    overBudgetCount,
    unmetDietary: [...dietaryCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    priceUnknown,
  }
}
