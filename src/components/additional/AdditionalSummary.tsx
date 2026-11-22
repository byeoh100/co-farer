/**
 * Additional's compact card body (docs/LAYOUT.md; Planned Changes Spec,
 * Change 2): the top 3 activities and top 3 places to eat as thumbnails,
 * each labeled with its name. Food places that may not suit someone keep
 * their warning triangle on the thumbnail. Inside the section's button, so
 * spans only.
 */

import { AlertTriangle } from 'lucide-react'
import { rankOptions, useOptions, useVotes, type EngineOption, type Member } from '../../lib/trip-data'
import { Thumb } from '../trip/Thumb'
import { useFoodWarnings } from './RankedList'

export function AdditionalSummary({ tripId, members }: { tripId: string; members: Member[] }) {
  const votes = useVotes(tripId)
  const activities = rankOptions(useOptions(tripId, 'activities').options, votes).slice(0, 3)
  const food = rankOptions(useOptions(tripId, 'food').options, votes).slice(0, 3)
  const warningFor = useFoodWarnings(tripId, members)

  if (activities.length === 0 && food.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground" data-testid="additional-summary">
        No activities or places to eat yet. Open to get suggestions.
      </span>
    )
  }

  const row = (label: string, items: Array<{ option: EngineOption }>, warn: boolean, testId: string) => (
    <span className="block space-y-1" data-testid={testId}>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {items.length === 0 ? (
        <span className="block text-xs text-muted-foreground">None yet</span>
      ) : (
        <span className="grid grid-cols-3 gap-1.5">
          {items.map(({ option }) => {
            const warning = warn ? warningFor(option) : null
            return (
              <span key={option.id} className="block min-w-0" data-testid="summary-tile">
                <Thumb src={option.imageUrl} name={option.title} className="aspect-square w-full rounded-md">
                  {warning && (
                    <span className="absolute right-0.5 top-0.5 rounded-full bg-card/90 p-0.5" title={warning.text} data-testid="tile-warning">
                      <AlertTriangle className="h-3 w-3 text-warning" aria-label={warning.text} />
                    </span>
                  )}
                </Thumb>
                <span className="mt-0.5 block truncate text-[11px]">{option.title}</span>
              </span>
            )
          })}
        </span>
      )}
    </span>
  )

  return (
    <span className="block space-y-2" data-testid="additional-summary">
      {row('Activities', activities, false, 'summary-activities')}
      {row('Food', food, true, 'summary-food')}
    </span>
  )
}
