import { createContext, useContext } from 'react'

/**
 * Join-refresh workaround (PLAN.md §2). DeepSpace's membership-change refresh
 * reads `record.data.UserId` (capital U) while the column is `userId`, so a
 * new member's live data doesn't refresh by itself after joinTrip. Calling
 * this remounts the RecordScope (new `key`), which reconnects and reloads the
 * caller's trip ids. Remove once the SDK bug is fixed.
 */
export const ScopeRefreshContext = createContext<() => void>(() => {})

export function useRefreshScope(): () => void {
  return useContext(ScopeRefreshContext)
}
