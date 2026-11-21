import { useState } from 'react'
import { getUserColor } from 'deepspace'
import { cn } from '@/lib/utils'
import { avatarInitial } from '../../lib/core-input'

/**
 * Google Docs-style avatar: the profile picture, or the first letter of the
 * first name on a color fixed per person (also if the picture fails to
 * load). Online is in color; offline is grayed.
 */
export function MemberAvatar({
  userId,
  name,
  imageUrl,
  online,
  size = 32,
  className,
}: {
  userId: string
  name: string
  imageUrl: string | null
  online: boolean
  size?: number
  className?: string
}) {
  // Remember which URL failed, so a new picture gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = !!imageUrl && failedUrl !== imageUrl
  return (
    <span
      className={cn(
        // Thin dark outline so white pictures stay visible; the white ring outside it
        // keeps overlapping circles apart.
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground/80 font-semibold text-white ring-2 ring-card transition-[filter,opacity] duration-300',
        !online && 'opacity-60 grayscale',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), backgroundColor: getUserColor(userId) }}
      title={`${name}${online ? ' · online' : ''}`}
      data-image={imageUrl ?? undefined}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <span aria-hidden>{avatarInitial(name)}</span>
      )}
      <span className="sr-only">{`${name}${online ? ', online' : ', offline'}`}</span>
    </span>
  )
}
