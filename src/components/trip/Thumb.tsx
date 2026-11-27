/**
 * A fixed-size photo for the overview cards. Uses the photo research already
 * stored on the option; with no photo, or if it fails to load, a flat tile
 * with a muted icon for the option's type (SPEC.md, Photo fallback). Never a
 * broken image. Always cropped to fit.
 */

import { useState, type ReactNode } from 'react'
import { Car, Mountain, Tent, Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ThumbKind = 'housing' | 'activities' | 'food' | 'travel'
const ICONS = { housing: Tent, activities: Mountain, food: Utensils, travel: Car } as const

export function Thumb({
  src, name, kind = 'housing', className, iconSize = 24, children,
}: {
  src: string | null
  /** The option's name (for the image's empty alt and tests). */
  name: string
  kind?: ThumbKind
  /** Size and shape (e.g. "h-11 w-15 rounded-[10px]"); the image is cropped to fill it. */
  className: string
  iconSize?: number
  /** Overlays (e.g. a warning triangle). */
  children?: ReactNode
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!src && failed !== src
  const Icon = ICONS[kind]
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-cf-surface-2 text-cf-muted', className)}
      data-testid="thumb"
      data-fallback={showImage ? undefined : 'true'}
      data-name={name}
    >
      {showImage ? (
        <img src={src!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} className="h-full w-full object-cover" />
      ) : (
        <Icon style={{ width: iconSize, height: iconSize }} aria-hidden strokeWidth={1.75} />
      )}
      {children}
    </span>
  )
}
