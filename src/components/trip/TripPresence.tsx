/**
 * Who is online in this trip right now. One presence room per trip
 * (`trip:<id>`); the worker lets only active members join it
 * (src/server/realtime-routes.ts), so names and online status stay in the trip.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePresenceRoom } from 'deepspace'

const OnlineContext = createContext<ReadonlySet<string>>(new Set())

export function TripPresence({ tripId, selfId, children }: { tripId: string; selfId: string; children: ReactNode }) {
  const { peers } = usePresenceRoom(`trip:${tripId}`)
  const online = useMemo(() => new Set([selfId, ...peers.map((p) => p.userId)]), [peers, selfId])
  return <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>
}

export function useOnlineUsers(): ReadonlySet<string> {
  return useContext(OnlineContext)
}
