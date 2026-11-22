/**
 * Travel's compact card body (docs/LAYOUT.md). Mobile: the number of cars and
 * flyers, and seats left. Desktop: each car's seats, plus flyers.
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { buildBoard } from '../../lib/travel'
import { useSeatClaims, useTravel, type Member } from '../../lib/trip-data'

export function TravelSummary({ tripId, members }: { tripId: string; members: Member[] }) {
  const entries = useTravel(tripId)
  const claims = useSeatClaims(tripId)
  const board = useMemo(() => buildBoard(members.map((m) => m.userId), entries, claims), [members, entries, claims])
  const names = new Map(members.map((m) => [m.userId, m.displayName]))
  const flying = board.others.filter((e) => e.otherKind === 'flight').length
  const otherWays = board.others.length - flying
  const cars = board.groups.flatMap((g) => g.cars)

  if (cars.length === 0 && board.others.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground" data-testid="travel-summary">
        Nobody has said how they’re getting there yet.
      </span>
    )
  }

  const counts = [
    `${board.carCount} ${board.carCount === 1 ? 'car' : 'cars'}`,
    flying > 0 && `${flying} flying`,
    otherWays > 0 && `${otherWays} another way`,
  ].filter(Boolean)

  return (
    <span className="block space-y-1.5 text-sm" data-testid="travel-summary">
      <span className="block text-xs text-muted-foreground">
        {counts.join(' · ')}
        {board.carCount > 0 && ` · ${board.seatsLeft} ${board.seatsLeft === 1 ? 'seat' : 'seats'} left`}
      </span>
      {/* Desktop: each car's seats. */}
      {cars.slice(0, 4).map((c) => (
        <span key={c.driverId} className="hidden items-center justify-between gap-2 min-[900px]:flex">
          <span className="truncate">{names.get(c.driverId) ?? 'Someone'}’s car</span>
          <span className="flex shrink-0 items-center gap-0.5" aria-label={`${c.riders.length} of ${c.seats} seats taken`}>
            {Array.from({ length: c.seats }, (_, i) => (
              <span
                key={i}
                className={cn('h-2.5 w-2.5 rounded-full border border-foreground/60', i < c.riders.length && 'bg-foreground/70')}
              />
            ))}
            {c.full && <span className="ml-1 text-[11px] text-muted-foreground">Full</span>}
          </span>
        </span>
      ))}
      {board.others.length > 0 && (
        <span className="hidden truncate text-xs text-muted-foreground min-[900px]:block">
          Another way: {board.others.map((e) => names.get(e.userId) ?? 'Someone').join(', ')}
        </span>
      )}
    </span>
  )
}
