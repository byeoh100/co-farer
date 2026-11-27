/**
 * Lets a page put things into the app header: the trip page adds its name to
 * the nav and its avatar stack + Invite on the right (SPEC.md, AppHeader).
 * A portal keeps the page's own context (trip presence) working.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type SlotName = 'nav' | 'end'
type Slots = Record<SlotName, HTMLElement | null>

const HeaderSlotContext = createContext<{ slots: Slots; setSlot: (k: SlotName, el: HTMLElement | null) => void } | null>(null)

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ nav: null, end: null })
  // Stable, and a no-op when nothing changed, so ref callbacks never loop.
  const setSlot = useCallback((k: SlotName, el: HTMLElement | null) => setSlots((s) => (s[k] === el ? s : { ...s, [k]: el })), [])
  const value = useMemo(() => ({ slots, setSlot }), [slots, setSlot])
  return <HeaderSlotContext.Provider value={value}>{children}</HeaderSlotContext.Provider>
}

/** For the header: a stable ref callback that registers a slot element. */
export function useHeaderSlotRef(k: SlotName) {
  const setSlot = useContext(HeaderSlotContext)?.setSlot
  return useCallback((el: HTMLElement | null) => setSlot?.(k, el), [setSlot, k])
}

/** For a page: render children into a header slot (nothing if there's no header). */
export function HeaderPortal({ slot, children }: { slot: SlotName; children: ReactNode }) {
  const el = useContext(HeaderSlotContext)?.slots[slot]
  return el ? createPortal(children, el) : null
}
