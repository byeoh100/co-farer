/**
 * Housing's compact card body (docs/LAYOUT.md; Planned Changes Spec,
 * Change 2). Before locking: each option with a small thumbnail beside its
 * name (the leading option on mobile, the top 3 on desktop). Once locked:
 * the chosen place's photo as the main image, then its name, the number of
 * nights, the price per person and the total. Layout lives in TripOverview.
 * Inside the section's button, so spans only.
 */

import { Lock, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { rangeLength } from '../../lib/dates'
import { fitText } from '../../lib/fit-text'
import { rankOptions, useBoard, useOptions, useVotes, type Member, type Trip } from '../../lib/trip-data'
import { Thumb } from '../trip/Thumb'

export function HousingSummary({ trip, members }: { trip: Trip; members: Member[] }) {
  const { board } = useBoard(trip.id, 'housing')
  const { options } = useOptions(trip.id, 'housing')
  const votes = useVotes(trip.id)

  if (board?.status === 'locked') {
    const winner = options.find((o) => o.id === board.winningOptionId)
    const name = winner?.title ?? 'Chosen place'
    const nights = trip.datesStart && trip.datesEnd ? Math.max(1, rangeLength({ start: trip.datesStart, end: trip.datesEnd }) - 1) : null
    return (
      <span className="block text-sm" data-testid="housing-summary">
        <Thumb src={winner?.imageUrl ?? null} name={name} className="h-24 w-full rounded-lg min-[900px]:h-32" />
        <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
          <Lock className="h-3 w-3" aria-hidden /> Locked
        </span>
        <span className="block truncate font-medium" data-testid="locked-name">{name}</span>
        <span className="block text-xs text-muted-foreground" data-testid="locked-details">
          {[
            nights != null && `${nights} ${nights === 1 ? 'night' : 'nights'}`,
            winner?.price != null && `$${winner.price.toLocaleString()} / person`,
            winner?.total != null && `$${winner.total.toLocaleString()} total`,
          ]
            .filter(Boolean)
            .join(' · ') || 'Price not found'}
        </span>
      </span>
    )
  }

  const ranked = rankOptions(options, votes)
  if (ranked.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground" data-testid="housing-summary">
        No places yet. Open to get suggestions.
      </span>
    )
  }
  return (
    <span className="block space-y-2" data-testid="housing-summary">
      {ranked.slice(0, 3).map(({ option, voters }, i) => {
        const fit = fitText(option.fit)
        return (
          <span key={option.id} className={cn('flex min-w-0 items-center gap-2 text-sm', i > 0 && 'hidden min-[900px]:flex')}>
            <Thumb src={option.imageUrl} name={option.title} className="h-10 w-10 rounded-md" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{option.title}</span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                  <ThumbsUp className="h-3 w-3" aria-hidden />
                  {voters.length}
                  <span className="min-[900px]:hidden"> of {members.length}</span>
                </span>
              </span>
              <span className="hidden truncate text-xs text-muted-foreground min-[900px]:block">
                {option.price != null ? `$${option.price} / person` : 'Price not found'}
                {fit && option.price != null && <span className={cn(fit.tone === 'over' && 'text-destructive')}> · {fit.text}</span>}
              </span>
            </span>
          </span>
        )
      })}
    </span>
  )
}
