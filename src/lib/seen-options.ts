/**
 * "New to you" outlines on option cards. Each viewer's seen option ids are
 * kept in this browser only (a per-viewer convenience, never shared). An
 * option you haven't pointed at or tapped yet is new; it stops being new as
 * soon as you do. If storage is blocked, it falls back to this visit only.
 */

import { useCallback, useEffect, useState } from 'react'

const MAX_IDS = 500

function load(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function useSeenOptions(tripId: string, userId: string) {
  const key = `cofarer:seen-options:${userId}:${tripId}`
  const [seen, setSeen] = useState<Set<string>>(() => load(key))
  useEffect(() => setSeen(load(key)), [key])

  const markSeen = useCallback(
    (id: string) =>
      setSeen((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev).add(id)
        try {
          localStorage.setItem(key, JSON.stringify([...next].slice(-MAX_IDS)))
        } catch {
          // Storage blocked: remembered for this visit only.
        }
        return next
      }),
    [key],
  )
  return { isNew: (id: string) => !seen.has(id), markSeen }
}
