/**
 * The trip title block (co-farer-redesign/SPEC.md, TripHero): the member
 * count (trips have no occasion field), the name at 92px (56px on phones)
 * with an accent-ink period, and chips for the location, where cars leave
 * from, and the nights once the dates are locked. Missing data hides its chip.
 */

import { rangeLength } from '../../lib/dates'
import type { Member, Trip } from '../../lib/trip-data'
import { Pill } from './cards'

export function TripHero({ trip, members }: { trip: Trip; members: Member[] }) {
  const nights = trip.datesStart && trip.datesEnd ? Math.max(1, rangeLength({ start: trip.datesStart, end: trip.datesEnd }) - 1) : null
  return (
    <div className="flex min-w-0 flex-col justify-between gap-[18px] py-2 lg:flex-[1_1_0%]">
      <div className="min-w-0">
        <p className="mb-2.5 text-[13px] uppercase tracking-[1.5px] text-cf-muted">
          {members.length} {members.length === 1 ? 'traveler' : 'travelers'}
        </p>
        <h1 className="font-display break-words text-[56px] leading-[0.9] tracking-[-1px] sm:text-[92px]">
          <span data-testid="trip-name">{trip.name}</span>
          <span className="text-cf-accent-ink" aria-hidden>
            .
          </span>
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {trip.destination && (
          <Pill tone="surface" className="whitespace-normal px-3.5 py-2 text-[13px]">
            {trip.destination}
          </Pill>
        )}
        {trip.meetingPoint && (
          <Pill tone="surface" className="whitespace-normal px-3.5 py-2 text-[13px]">
            Leaving from {trip.meetingPoint}
          </Pill>
        )}
        {nights != null && (
          <Pill tone="accent" className="px-3.5 py-2 text-[13px]">
            {nights} {nights === 1 ? 'night' : 'nights'}
          </Pill>
        )}
      </div>
    </div>
  )
}
