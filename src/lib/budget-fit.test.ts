import { describe, expect, it } from 'vitest'
import { BUDGET_CATEGORIES } from '../schemas/trip-schemas'
import { computeCategoryFit, groupPriceBand, summarizeMyBudget } from './budget-fit'

describe('computeCategoryFit', () => {
  it('counts every set budget (public or private) and skips the unset', () => {
    expect(computeCategoryFit([120, 300, 90, null], 6, 150)).toEqual({
      memberCount: 6,
      respondedCount: 3,
      overBudgetCount: 2,
      priceUnknown: false,
    })
  })

  it('always gives counts, however few budgets are set (no hiding)', () => {
    expect(computeCategoryFit([100], 6, 150)).toMatchObject({ respondedCount: 1, overBudgetCount: 1 })
    expect(computeCategoryFit([100, 200], 3, 150)).toMatchObject({ respondedCount: 2, overBudgetCount: 1 })
    expect(computeCategoryFit([], 3, 150)).toMatchObject({ respondedCount: 0, overBudgetCount: 0 })
  })

  it('does not check fit when the price was not found', () => {
    const fit = computeCategoryFit([100, 200, 300], 3, null)
    expect(fit.priceUnknown).toBe(true)
    expect(fit.overBudgetCount).toBe(0)
  })

  it('outputs only counts, never the budgets themselves', () => {
    const budgets = [137, 263, 419]
    const out = JSON.stringify(computeCategoryFit(budgets, 3, 200))
    for (const b of budgets) expect(out).not.toContain(String(b))
  })
})

describe('groupPriceBand', () => {
  it('is the plain average of every set budget, with no rounding to a step', () => {
    expect(groupPriceBand([100, 200, null])).toEqual({ perPerson: 150 })
    expect(groupPriceBand([137, 263, 419, 180])).toEqual({ perPerson: 249.75 })
    expect(groupPriceBand([100, 125, 126])).toEqual({ perPerson: 117 })
    expect(groupPriceBand([10, 10, 11])).toEqual({ perPerson: 10.33 })
  })

  it('uses a single budget too, and is null when nobody has set one', () => {
    expect(groupPriceBand([137])).toEqual({ perPerson: 137 })
    expect(groupPriceBand([null, null])).toBeNull()
    expect(groupPriceBand([])).toBeNull()
  })
})

describe('summarizeMyBudget', () => {
  it('totals essentials only (housing + gas) and flags, never blocks', () => {
    const s = summarizeMyBudget(
      { housing: 200, gas: 40, food: 150, activities: 100 },
      { housing: 230, gas: 25, food: 999 },
      BUDGET_CATEGORIES,
    )
    expect(s.totalBudget).toBe(240)
    expect(s.totalEstimate).toBe(255)
    expect(s.totalOver).toBe(true)
    expect(s.lines.find((l) => l.category === 'housing')!.over).toBe(true)
    expect(s.lines.find((l) => l.category === 'food')!.essential).toBe(false)
  })
})
