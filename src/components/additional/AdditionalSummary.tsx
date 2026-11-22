/**
 * Additional's compact card body (docs/LAYOUT.md). Mobile: the top activity.
 * Desktop: the top items of each list, with food warning triangles.
 */

import { AlertTriangle, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { rankOptions, useOptions, useVotes, type Member } from '../../lib/trip-data'
import { useFoodWarnings } from './RankedList'

export function AdditionalSummary({ tripId, members }: { tripId: string; members: Member[] }) {
  const votes = useVotes(tripId)
  const activities = rankOptions(useOptions(tripId, 'activities').options, votes)
  const food = rankOptions(useOptions(tripId, 'food').options, votes)
  const warningFor = useFoodWarnings(tripId, members)

  if (activities.length === 0 && food.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground" data-testid="additional-summary">
        No activities or places to eat yet. Open to get suggestions.
      </span>
    )
  }

  const row = (title: string, count: number, warn: boolean, key: string, desktopOnly: boolean) => (
    <span key={key} className={cn('flex items-center justify-between gap-2 text-sm', desktopOnly && 'hidden min-[900px]:flex')}>
      <span className="flex min-w-0 items-center gap-1">
        {warn && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-label="May not suit everyone" />}
        <span className="truncate">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
        <ThumbsUp className="h-3 w-3" aria-hidden />
        {count}
      </span>
    </span>
  )

  return (
    <span className="block space-y-2" data-testid="additional-summary">
      <span className="block space-y-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Activities</span>
        {activities.length === 0 && <span className="block text-xs text-muted-foreground">None yet</span>}
        {activities.slice(0, 3).map(({ option, voters }, i) => row(option.title, voters.length, false, option.id, i > 0))}
      </span>
      <span className="hidden space-y-1 min-[900px]:block">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Food</span>
        {food.length === 0 && <span className="block text-xs text-muted-foreground">None yet</span>}
        {food.slice(0, 3).map(({ option, voters }) => row(option.title, voters.length, !!warningFor(option), option.id, false))}
      </span>
    </span>
  )
}
