/**
 * A fixed-size photo for the overview cards (Planned Changes Spec, Change 2).
 * Uses the photo research already stored on the option; with no photo, or
 * if it fails to load, a plain tile with the first letter of the name, so
 * the layout never breaks. Always cropped to fit.
 */

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Thumb({
  src, name, className, children,
}: {
  src: string | null
  name: string
  /** Size and shape (e.g. "h-9 w-9 rounded-md"); the image is cropped to fill it. */
  className: string
  /** Overlays (e.g. a warning triangle). */
  children?: ReactNode
}) {
  // Remember which URL failed, so a new photo gets a fresh try.
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!src && failed !== src
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground', className)}
      data-testid="thumb"
      data-fallback={showImage ? undefined : 'true'}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-sm font-semibold" aria-hidden>{letter}</span>
      )}
      {children}
    </span>
  )
}
