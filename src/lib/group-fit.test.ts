import { describe, expect, it } from 'vitest'
import { computeGroupFit } from './group-fit'

const constraints = [
  { userId: 'user_alice', budgetMax: 400, dietary: ['vegetarian'] },
  { userId: 'user_bob', budgetMax: 900, dietary: [] },
  { userId: 'user_cara', budgetMax: 350, dietary: ['vegetarian', 'gluten-free'] },
]

describe('computeGroupFit', () => {
  it('counts members over budget and unmet dietary needs', () => {
    const fit = computeGroupFit(constraints, 5, { estPricePerPerson: 450, accommodates: ['gluten-free'] })
    expect(fit).toEqual({
      memberCount: 5,
      respondedCount: 3,
      overBudgetCount: 2,
      unmetDietary: [{ tag: 'vegetarian', count: 2 }],
      priceUnknown: false,
    })
  })

  it('does not guess budget fit when the price is unknown', () => {
    const fit = computeGroupFit(constraints, 3, { estPricePerPerson: null })
    expect(fit.priceUnknown).toBe(true)
    expect(fit.overBudgetCount).toBe(0)
  })

  it('never leaks user ids or individual budgets into the output', () => {
    const fit = computeGroupFit(constraints, 3, { estPricePerPerson: 450 })
    const serialized = JSON.stringify(fit)
    for (const c of constraints) {
      expect(serialized).not.toContain(c.userId)
      expect(serialized).not.toContain(String(c.budgetMax))
    }
  })
})
