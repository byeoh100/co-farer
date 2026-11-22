import { describe, expect, it } from 'vitest'
import { computeCategoryFit } from './budget-fit'
import { fitText } from './fit-text'

describe('fitText', () => {
  it('shows counts with 3+ budgets', () => {
    expect(fitText(computeCategoryFit([100, 150, 40, 60], 6, 50))).toEqual({ text: 'Over the housing budget for 1 of 4', tone: 'over' })
    expect(fitText(computeCategoryFit([100, 150, 80], 6, 50))).toEqual({ text: 'Fits all 3 housing budgets set', tone: 'ok' })
  })
  it('hides counts below 3 budgets', () => {
    const t = fitText(computeCategoryFit([40, 300], 6, 50))!
    expect(t.text).toBe('Not enough budgets set yet to check fit')
    expect(t.text).not.toMatch(/\d/)
  })
  it('shows counts in trips of 1–2 members', () => {
    expect(fitText(computeCategoryFit([100], 1, 150))).toEqual({ text: 'Over your housing budget', tone: 'over' })
    expect(fitText(computeCategoryFit([200], 1, 150))).toEqual({ text: 'Fits your housing budget', tone: 'ok' })
    expect(fitText(computeCategoryFit([100, 200], 2, 150))).toEqual({ text: 'Over the housing budget for 1 of 2', tone: 'over' })
    expect(fitText(computeCategoryFit([200, null], 2, 150))).toEqual({ text: 'Fits the 1 housing budget set', tone: 'ok' })
    expect(fitText(computeCategoryFit([200, 300], 2, 150))).toEqual({ text: 'Fits both housing budgets set', tone: 'ok' })
    expect(fitText(computeCategoryFit([], 2, 150))).toEqual({ text: 'No housing budgets set yet', tone: 'muted' })
  })
  it('skips the check with no price', () => {
    expect(fitText(computeCategoryFit([100, 150, 40], 6, null))!.tone).toBe('muted')
    expect(fitText(null)).toBeNull()
  })
})
