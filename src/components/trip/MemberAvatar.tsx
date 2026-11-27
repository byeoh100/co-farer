import { useState } from 'react'
import { cn } from '@/lib/utils'
import { initials } from '../../lib/personColor'
import { usePersonColor } from '../../lib/person-colors-context'

/**
 * A member's circle in their person colour (co-farer-redesign/SPEC.md):
 * initials in #111111, a 2px ring in the page colour so overlapping circles
 * stay apart. Profile pictures are on hold (migration 2c), but a stored one
 * still shows, and falls back to initials if it fails. Offline is grayed.
 */
export function MemberAvatar({
  userId,
  name,
  imageUrl,
  online,
  size = 34,
  className,
}: {
  userId: string
  name: string
  imageUrl: string | null
  online: boolean
  size?: number
  className?: string
}) {
  const colorOf = usePersonColor()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = !!imageUrl && failedUrl !== imageUrl
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-[#111111] ring-2 ring-cf-bg transition-[filter,opacity] duration-300',
        !online && 'opacity-60 grayscale',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.35)), backgroundColor: colorOf(userId) }}
      title={`${name}${online ? ' · online' : ''}`}
      data-image={imageUrl ?? undefined}
    >
      {showImage ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <span aria-hidden>{size < 24 ? initials(name)[0] : initials(name)}</span>
      )}
      <span className="sr-only">{`${name}${online ? ', online' : ', offline'}`}</span>
    </span>
  )
}
