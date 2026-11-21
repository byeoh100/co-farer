import { useOutletContext } from 'react-router-dom'
import type { Member, Trip } from './trip-data'

/** Provided by src/pages/(app)/(protected)/trip/[id]/_layout.tsx to every trip page. */
export interface TripContext {
  trip: Trip
  members: Member[]
  me: Member
}

export function useTripContext(): TripContext {
  return useOutletContext<TripContext>()
}
