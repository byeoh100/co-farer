import { describe, expect, it } from 'vitest'
import { BUDGET_CATEGORIES } from '../schemas/trip-schemas'
import { PRICE_BAND_STEP, computeCategoryFit, groupPriceBand, summarizeMyBudget } from './budget-fit'

describe('computeCategoryFit', () => {
  it('counts responders over budget', () => {
    expect(computeCategoryFit([120, 300, 90, null], 6, 150)).toEqual({
      memberCount: 6,
      respondedCount: 3,
      overBudgetCount: 2,
      priceUnknown: false,
      tooFewResponses: false,
    })
  })

  it('does not check fit when the price was not found', () => {
    const fit = computeCategoryFit([100, 200, 300], 3, null)
    expect(fit.priceUnknown).toBe(true)
    expect(fit.overBudgetCount).toBe(0)
  })

  it('flags too few responses so the UI can soften the message', () => {
    expect(computeCategoryFit([100, 200], 6, 150).tooFewResponses).toBe(true)
  })

  it('outputs only counts, never the budgets themselves', () => {
    const budgets = [137, 263, 419]
    const out = JSON.stringify(computeCategoryFit(budgets, 3, 200))
    for (const b of budgets) expect(out).not.toContain(String(b))
  })
})

describe('groupPriceBand', () => {
  it('returns null with fewer than 3 budgets', () => {
    expect(groupPriceBand([200, 300])).toBeNull()
  })

  it('rounds outward to the band step', () => {
    const band = groupPriceBand([137, 263, 419, 180])!
    expect(band.low % PRICE_BAND_STEP).toBe(0)
    expect(band.high % PRICE_BAND_STEP).toBe(0)
    expect(band.low).toBeLessThan(band.high)
    for (const b of [137, 263, 419, 180]) {
      expect([band.low, band.high]).not.toContain(b)
    }
  })

  it('never returns an empty band', () => {
    expect(groupPriceBand([100, 100, 100])).toEqual({ low: 100, high: 150 })
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
