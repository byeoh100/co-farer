/**
 * The one shared expand behavior for trip-page sections (docs/LAYOUT.md).
 * Modules never animate themselves; they hand this a summary and a full view.
 *
 *  - Grows from the card's own position and size to the full area, and
 *    shrinks back on close (FLIP: measure, then animate position and size).
 *    ~380 ms, cubic-bezier(.2,.8,.2,1); content fades in ~180 ms later.
 *  - Mobile (< 900px): fills the screen, back arrow closes. Desktop: fills
 *    the stage (the area under the trip header), minimize button closes.
 *  - `?section=<id>` reflects the open section: Back closes it, and a link
 *    can open a trip straight to a section.
 *  - The card is a plain panel (it holds its own buttons, e.g. "Claim seat").
 *    Its open button(s) get `open`, aria-expanded and aria-controls from
 *    the render prop; the grow starts from the clicked card
 *    (`data-section-card`). Focus moves in on open and back to the button
 *    on close; Escape closes. prefers-reduced-motion: instant.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const DURATION = 380
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DESKTOP = '(min-width: 900px)'

/** TripOverview provides the stage: the area under the header that a section fills on desktop. */
export const SectionStageContext = createContext<RefObject<HTMLElement | null> | null>(null)

type Rect = { top: number; left: number; width: number; height: number }
type Phase = 'closed' | 'opening' | 'open' | 'closing'

const toRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height })

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** What a card gets to open its section. */
export interface SectionControl {
  open: (e?: SyntheticEvent<HTMLElement>) => void
  expanded: boolean
  /** Spread onto every button that opens the section. */
  buttonProps: { 'aria-expanded': boolean; 'aria-controls': string }
}

export function ExpandableSection({
  id,
  label,
  full,
  children,
}: {
  id: string
  label: string
  full: ReactNode
  /** The card(s): plain panels marked `data-section-card`, with open buttons. */
  children: (control: SectionControl) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const stage = useContext(SectionStageContext)
  /** The card the section grows from, and the button to refocus on close. */
  const cardRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pushedRef = useRef(false)

  const wantOpen = params.get('section') === id
  const [phase, setPhase] = useState<Phase>(wantOpen ? 'open' : 'closed')
  const [rect, setRect] = useState<Rect | null>(null)
  /** The grow has started toward the full size (content may begin fading in). */
  const [grown, setGrown] = useState(wantOpen)

  const target = useCallback((): Rect => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!window.matchMedia(DESKTOP).matches || !stage?.current) return { top: 0, left: 0, width: vw, height: vh }
    const s = stage.current.getBoundingClientRect()
    const top = Math.max(s.top, 8)
    return { top, left: s.left, width: s.width, height: Math.max(240, vh - top - 16) }
  }, [stage])

  const cardRect = useCallback((): Rect | null => {
    const el = cardRef.current ?? document.querySelector<HTMLElement>(`[data-section-card="${id}"]`)
    return el ? toRect(el.getBoundingClientRect()) : null
  }, [id])
  const refocus = () => (returnFocusRef.current ?? document.querySelector<HTMLElement>(`[data-testid="section-${id}"]`))?.focus()

  // URL → phase. Opening/closing animations run from here so Back works too.
  useLayoutEffect(() => {
    if (wantOpen && (phase === 'closed' || phase === 'closing')) {
      const from = cardRect()
      if (!from || reducedMotion()) {
        setRect(target())
        setGrown(true)
        setPhase('open')
        return
      }
      setRect(from)
      setGrown(false)
      setPhase('opening')
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setRect(target())
          setGrown(true)
        }),
      )
      const t = setTimeout(() => setPhase('open'), DURATION)
      return () => clearTimeout(t)
    }
    if (!wantOpen && (phase === 'open' || phase === 'opening')) {
      const to = cardRect()
      if (!to || reducedMotion()) {
        setPhase('closed')
        refocus()
        return
      }
      setPhase('closing')
      setGrown(false)
      setRect(to)
      const t = setTimeout(() => {
        setPhase('closed')
        refocus()
      }, DURATION)
      return () => clearTimeout(t)
    }
  }, [wantOpen])

  // Opened straight from a link: size it once mounted.
  useLayoutEffect(() => {
    if (phase === 'open' && !rect) setRect(target())
  }, [phase, rect, target])

  // Keep the panel sized to the viewport/stage while open.
  useEffect(() => {
    if (phase !== 'open') return
    const onResize = () => setRect(target())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [phase, target])

  // Focus into the panel once it has grown.
  useEffect(() => {
    if (phase === 'open') panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [phase])

  const open = (e?: SyntheticEvent<HTMLElement>) => {
    const btn = e?.currentTarget ?? null
    returnFocusRef.current = btn
    cardRef.current = (btn?.closest('[data-section-card]') as HTMLElement | null) ?? btn
    pushedRef.current = true
    const next = new URLSearchParams(params)
    next.set('section', id)
    setParams(next)
  }
  const close = useCallback(() => {
    // If we pushed the entry, go back so Back/forward history stays clean.
    if (pushedRef.current && location.key !== 'default') {
      pushedRef.current = false
      navigate(-1)
    } else {
      const next = new URLSearchParams(params)
      next.delete('section')
      setParams(next, { replace: true })
    }
  }, [location.key, navigate, params, setParams])

  useEffect(() => {
    if (phase === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, close])

  const shown = phase !== 'closed'
  const animate = !reducedMotion()

  return (
    <>
      {children({ open, expanded: shown, buttonProps: { 'aria-expanded': shown, 'aria-controls': `section-panel-${id}` } })}

      {shown &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            id={`section-panel-${id}`}
            role="dialog"
            aria-modal="false"
            aria-label={label}
            data-testid={`section-panel-${id}`}
            className="fixed z-40 flex flex-col overflow-hidden bg-cf-surface min-[900px]:rounded-[20px] min-[900px]:border min-[900px]:border-cf-line"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: phase === 'open' ? undefined : 20,
              transition: animate ? `top ${DURATION}ms ${EASE}, left ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}` : undefined,
            }}
          >
            <div className="flex items-center gap-2 border-b border-cf-line px-4 py-3">
              <button
                type="button"
                data-autofocus
                onClick={close}
                aria-label={`Close ${label}`}
                data-testid={`section-close-${id}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-cf-muted hover:bg-cf-surface-2 hover:text-cf-text"
              >
                <ArrowLeft className="h-4 w-4 min-[900px]:hidden" aria-hidden />
                <Minimize2 className="hidden h-4 w-4 min-[900px]:block" aria-hidden />
              </button>
              <h2 className="font-display text-[24px]">{label}</h2>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{
                // Fades in ~180 ms after the grow starts, so text never looks squashed.
                opacity: grown && phase !== 'closing' ? 1 : 0,
                transition: animate ? `opacity 200ms ease ${phase === 'opening' ? 180 : 0}ms` : undefined,
              }}
            >
              {full}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
