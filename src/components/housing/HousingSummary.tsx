/**
 * Housing's compact card body (docs/LAYOUT.md): the leading option on mobile,
 * the top 3 with price and fit on desktop. Layout lives in TripOverview.
 */

import { Lock, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fitText } from '../../lib/fit-text'
import { rankOptions, useBoard, useOptions, useVotes, type Member } from '../../lib/trip-data'

export function HousingSummary({ tripId, members }: { tripId: string; members: Member[] }) {
  const { board } = useBoard(tripId, 'housing')
  const { options } = useOptions(tripId, 'housing')
  const votes = useVotes(tripId)

  if (board?.status === 'locked') {
    const winner = options.find((o) => o.id === board.winningOptionId)
    return (
      <span className="block text-sm" data-testid="housing-summary">
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <Lock className="h-3 w-3" aria-hidden /> Locked
        </span>
        <span className="mt-0.5 block truncate font-medium">{winner?.title ?? 'Chosen option'}</span>
        {winner?.price != null && <span className="block text-xs text-muted-foreground">${winner.price} / person</span>}
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
          <span key={option.id} className={cn('block min-w-0 text-sm', i > 0 && 'hidden min-[900px]:block')}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{option.title}</span>
              <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                <ThumbsUp className="h-3 w-3" aria-hidden />
                {voters.length}
                <span className="min-[900px]:hidden"> of {members.length}</span>
              </span>
            </span>
            <span className="hidden text-xs text-muted-foreground min-[900px]:block">
              {option.price != null ? `$${option.price} / person` : 'Price not found'}
              {fit && option.price != null && (
                <span className={cn(fit.tone === 'over' && 'text-destructive')}> · {fit.text}</span>
              )}
            </span>
          </span>
        )
      })}
    </span>
  )
}
