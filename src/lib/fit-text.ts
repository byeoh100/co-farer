/**
 * Wording for a housing option's budget fit (spec §1). Only counts reach
 * this, and they always show (Planned Changes Spec, Change 1: no hiding).
 */

import type { CategoryFit } from './budget-fit'

export type FitTone = 'ok' | 'over' | 'muted'

export function fitText(fit: CategoryFit | null): { text: string; tone: FitTone } | null {
  if (!fit) return null
  if (fit.priceUnknown) return { text: 'Price not found, so not checked against budgets', tone: 'muted' }
  if (fit.respondedCount === 0) return { text: 'No housing budgets set yet', tone: 'muted' }
  const over = fit.overBudgetCount > 0
  // A solo trip: the only budget is the viewer's own.
  if (fit.memberCount === 1) return over ? { text: 'Over your housing budget', tone: 'over' } : { text: 'Fits your housing budget', tone: 'ok' }
  if (!over) {
    const all = fit.respondedCount === 1 ? 'the 1 housing budget set' : fit.respondedCount === 2 ? 'both housing budgets set' : `all ${fit.respondedCount} housing budgets set`
    return { text: `Fits ${all}`, tone: 'ok' }
  }
  return { text: `Over the housing budget for ${fit.overBudgetCount} of ${fit.respondedCount}`, tone: 'over' }
}

/** The overview's short form (co-farer-redesign/SPEC.md): "fits everyone" / "over budget for 2". */
export function shortFit(fit: CategoryFit | null): { text: string; tone: 'ok' | 'over' } | null {
  if (!fit || fit.priceUnknown || fit.respondedCount === 0) return null
  return fit.overBudgetCount > 0 ? { text: `over budget for ${fit.overBudgetCount}`, tone: 'over' } : { text: 'fits everyone', tone: 'ok' }
}
