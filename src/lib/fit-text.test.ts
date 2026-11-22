import { describe, expect, it } from 'vitest'
import { computeCategoryFit } from './budget-fit'
import { fitText } from './fit-text'

describe('fitText', () => {
  it('always shows counts (no hiding below 3 budgets)', () => {
    expect(fitText(computeCategoryFit([100, 150, 40, 60], 6, 50))).toEqual({ text: 'Over the housing budget for 1 of 4', tone: 'over' })
    expect(fitText(computeCategoryFit([100, 150, 80], 6, 50))).toEqual({ text: 'Fits all 3 housing budgets set', tone: 'ok' })
    expect(fitText(computeCategoryFit([40, 300], 6, 50))).toEqual({ text: 'Over the housing budget for 1 of 2', tone: 'over' })
    expect(fitText(computeCategoryFit([200, null], 3, 150))).toEqual({ text: 'Fits the 1 housing budget set', tone: 'ok' })
    expect(fitText(computeCategoryFit([200, 300], 4, 150))).toEqual({ text: 'Fits both housing budgets set', tone: 'ok' })
  })
  it('speaks to a solo traveler directly', () => {
    expect(fitText(computeCategoryFit([100], 1, 150))).toEqual({ text: 'Over your housing budget', tone: 'over' })
    expect(fitText(computeCategoryFit([200], 1, 150))).toEqual({ text: 'Fits your housing budget', tone: 'ok' })
  })
  it('says when nobody has set one, and skips the check with no price', () => {
    expect(fitText(computeCategoryFit([], 2, 150))).toEqual({ text: 'No housing budgets set yet', tone: 'muted' })
    expect(fitText(computeCategoryFit([100, 150, 40], 6, null))!.tone).toBe('muted')
    expect(fitText(null)).toBeNull()
  })
})
