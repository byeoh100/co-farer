/**
 * Wording for a housing option's budget fit (spec §1). Only counts ever reach
 * this. In a trip of 3+ members with fewer than 3 budgets set, a softer
 * message hides the counts so nobody can be identified; trips of 1–2 members
 * show counts as soon as one budget is set.
 */

import type { CategoryFit } from './budget-fit'

export type FitTone = 'ok' | 'over' | 'muted'

export function fitText(fit: CategoryFit | null): { text: string; tone: FitTone } | null {
  if (!fit) return null
  if (fit.priceUnknown) return { text: 'Price not found, so not checked against budgets', tone: 'muted' }
  if (fit.respondedCount === 0) return { text: 'No housing budgets set yet', tone: 'muted' }
  if (fit.tooFewResponses) return { text: 'Not enough budgets set yet to check fit', tone: 'muted' }
  const over = fit.overBudgetCount > 0
  // A solo trip: the only budget is the viewer's own.
  if (fit.memberCount === 1) return over ? { text: 'Over your housing budget', tone: 'over' } : { text: 'Fits your housing budget', tone: 'ok' }
  if (!over) {
    const all = fit.respondedCount === 1 ? 'the 1 housing budget set' : fit.respondedCount === 2 ? 'both housing budgets set' : `all ${fit.respondedCount} housing budgets set`
    return { text: `Fits ${all}`, tone: 'ok' }
  }
  return { text: `Over the housing budget for ${fit.overBudgetCount} of ${fit.respondedCount}`, tone: 'over' }
}
