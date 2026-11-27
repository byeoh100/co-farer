/**
 * "Your essentials" on the trip overview (co-farer-redesign/SPEC.md,
 * EssentialsCard): your housing and gas estimates against your own budget,
 * one bar per category, amber when over. Your budget row is only ever read
 * by you ('own' rule); "Only you see this" shows when your switch is off.
 */

import { Link } from 'react-router-dom'
import { ESSENTIAL_CATEGORIES } from '../../schemas/trip-schemas'
import { summarizeMyBudget } from '../../lib/budget-fit'
import { useHousingEstimate, useMyBudget, useMyGasEstimate, type Member, type Trip } from '../../lib/trip-data'
import { Bar, CardHeader, CardShell, money } from './cards'

const LABEL: Record<string, string> = { housing: 'Housing', gas: 'Gas', food: 'Food', activities: 'Activities' }

export function EssentialsCard({ trip, members, userId }: { trip: Trip; members: Member[]; userId: string }) {
  const { budget } = useMyBudget(trip.id, userId)
  const housing = useHousingEstimate(trip.id)
  const gas = useMyGasEstimate(trip, userId, members)
  const summary = summarizeMyBudget(budget ?? {}, { housing, gas }, ESSENTIAL_CATEGORIES)
  const hasBudget = summary.lines.some((l) => l.budget != null)
  const hasEstimate = summary.lines.some((l) => l.estimate != null)
  const isPrivate = !!budget && !budget.isPublic

  const total = !hasBudget ? (
    <span className="text-sm text-cf-muted">No budget set</span>
  ) : hasEstimate ? (
    <span className="font-display tabular text-[28px] normal-case">
      {money(summary.totalEstimate)} <span className="text-[18px] text-cf-muted">of {money(summary.totalBudget)}</span>
    </span>
  ) : (
    <span className="tabular text-sm">Budget {money(summary.totalBudget)} · no estimates yet</span>
  )

  return (
    <CardShell testId="my-essentials" className="gap-3">
      <CardHeader small title="Your essentials" action={total} />
      {hasBudget && (
        <div className="flex flex-col gap-1.5">
          {summary.lines.map((l) => {
            const pct = l.budget ? ((l.estimate ?? 0) / l.budget) * 100 : 0
            const words = l.budget == null ? 'no budget' : l.estimate == null ? `no estimate of ${money(l.budget)}` : `${money(l.estimate)} of ${money(l.budget)}`
            return (
              <div key={l.category} className="flex flex-col gap-1.5 [&+&]:mt-1">
                <div className="flex justify-between text-[13px]">
                  <span>{LABEL[l.category]}</span>
                  <span className={l.over ? 'tabular text-cf-warn' : 'tabular text-cf-muted'}>
                    {l.over && '▲ '}
                    {words}
                  </span>
                </div>
                <Bar value={pct} label={`${LABEL[l.category]}: ${words}${l.over ? ', over budget' : ''}`} color={l.over ? 'var(--cf-warn)' : 'var(--cf-accent)'} />
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="text-cf-muted">{isPrivate ? 'Only you see this' : ''}</span>
        <Link to={`/trip/${trip.id}/settings`} className="rounded text-cf-accent-ink hover:underline" data-testid="my-settings-link">
          My settings
        </Link>
      </div>
    </CardShell>
  )
}
