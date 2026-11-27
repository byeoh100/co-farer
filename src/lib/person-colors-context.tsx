/**
 * The trip's person colours for every component under a trip page
 * (src/lib/personColor.ts decides them). Provided by the trip layout from
 * every member row, including people who left, so colours never shift.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DEPARTED, PALETTE, personColors, type ColorMember } from './personColor'

const PersonColorsContext = createContext<Map<string, string> | null>(null)

export function PersonColorsProvider({ members, children }: { members: ColorMember[]; children: ReactNode }) {
  const colors = useMemo(() => personColors(members), [members])
  return <PersonColorsContext.Provider value={colors}>{children}</PersonColorsContext.Provider>
}

/** A stable palette colour from an id, for places with no trip (e.g. your own avatar). */
export function fallbackColor(userId: string): string {
  let h = 0
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** userId → colour: the trip's colour inside a trip, else a stable fallback. */
export function usePersonColor(): (userId: string) => string {
  const colors = useContext(PersonColorsContext)
  return (userId: string) => colors?.get(userId) ?? (colors ? DEPARTED : fallbackColor(userId))
}
