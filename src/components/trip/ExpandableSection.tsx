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
 *  - Card is a button with aria-expanded; focus moves in on open and back to
 *    the card on close; Escape closes. prefers-reduced-motion: instant.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
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

export function ExpandableSection({
  id,
  label,
  summary,
  full,
  className,
}: {
  id: string
  label: string
  summary: ReactNode
  full: ReactNode
  className?: string
}) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const stage = useContext(SectionStageContext)
  const cardRef = useRef<HTMLButtonElement>(null)
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

  const cardRect = useCallback((): Rect | null => (cardRef.current ? toRect(cardRef.current.getBoundingClientRect()) : null), [])

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
        cardRef.current?.focus()
        return
      }
      setPhase('closing')
      setGrown(false)
      setRect(to)
      const t = setTimeout(() => {
        setPhase('closed')
        cardRef.current?.focus()
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

  const open = () => {
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
      <button
        ref={cardRef}
        type="button"
        aria-expanded={shown}
        aria-controls={`section-panel-${id}`}
        data-testid={`section-${id}`}
        onClick={open}
        className={cn(
          'group flex min-h-24 min-w-0 flex-col rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'min-[900px]:flex-1 min-[900px]:p-4',
          shown && 'invisible',
          className,
        )}
      >
        <span className="flex w-full items-center justify-between">
          <span className="text-sm font-semibold">{label}</span>
          <Maximize2 className="hidden h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground min-[900px]:block" aria-hidden />
        </span>
        <span className="mt-1.5 block w-full min-w-0 flex-1">{summary}</span>
      </button>

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
            className="fixed z-40 flex flex-col overflow-hidden border border-border bg-card shadow-xl min-[900px]:rounded-xl"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: phase === 'open' ? undefined : 12,
              transition: animate ? `top ${DURATION}ms ${EASE}, left ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}` : undefined,
            }}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <button
                type="button"
                data-autofocus
                onClick={close}
                aria-label={`Close ${label}`}
                data-testid={`section-close-${id}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-4 w-4 min-[900px]:hidden" aria-hidden />
                <Minimize2 className="hidden h-4 w-4 min-[900px]:block" aria-hidden />
              </button>
              <h2 className="text-base font-semibold">{label}</h2>
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
