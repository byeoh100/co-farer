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

  it('flags too few responses so the UI can soften the message (3+ members)', () => {
    expect(computeCategoryFit([100, 200], 6, 150).tooFewResponses).toBe(true)
    expect(computeCategoryFit([100, 200], 3, 150).tooFewResponses).toBe(true)
  })

  it('shows counts for trips of 1–2 members as soon as one budget is set', () => {
    expect(computeCategoryFit([100], 1, 150)).toMatchObject({ tooFewResponses: false, overBudgetCount: 1 })
    expect(computeCategoryFit([100, null], 2, 150)).toMatchObject({ tooFewResponses: false, respondedCount: 1 })
    expect(computeCategoryFit([100, 200], 2, 150)).toMatchObject({ tooFewResponses: false, overBudgetCount: 1 })
    expect(computeCategoryFit([], 2, 150).tooFewResponses).toBe(true)
  })

  it('outputs only counts, never the budgets themselves', () => {
    const budgets = [137, 263, 419]
    const out = JSON.stringify(computeCategoryFit(budgets, 3, 200))
    for (const b of budgets) expect(out).not.toContain(String(b))
  })
})

describe('groupPriceBand', () => {
  it('returns null with one budget in a group of 3+ (it would be that person’s number)', () => {
    expect(groupPriceBand([200], 3)).toBeNull()
    expect(groupPriceBand([200, null, null], 6)).toBeNull()
  })

  it('centers on the average of the budgets set when some people haven’t set one', () => {
    // 2 of 3 set: average 150 → $150–$200 per person; the third person is assumed at the average.
    expect(groupPriceBand([100, 200, null], 3)).toEqual({ low: 150, high: 200 })
    expect(groupPriceBand([120, 190], 5)).toEqual({ low: 150, high: 200 })
  })

  it('uses any budgets set in a trip of 1–2 members', () => {
    expect(groupPriceBand([137], 1)).toEqual({ low: 100, high: 150 })
    expect(groupPriceBand([200, 300], 2)).toEqual({ low: 200, high: 300 })
    expect(groupPriceBand([], 1)).toBeNull()
  })

  it('rounds outward to the band step', () => {
    const band = groupPriceBand([137, 263, 419, 180], 4)!
    expect(band.low % PRICE_BAND_STEP).toBe(0)
    expect(band.high % PRICE_BAND_STEP).toBe(0)
    expect(band.low).toBeLessThan(band.high)
    for (const b of [137, 263, 419, 180]) {
      expect([band.low, band.high]).not.toContain(b)
    }
  })

  it('never returns an empty band', () => {
    expect(groupPriceBand([100, 100, 100], 3)).toEqual({ low: 100, high: 150 })
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
