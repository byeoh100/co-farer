/**
 * Notes' compact card body (docs/LAYOUT.md). Mobile: the note count and the
 * latest note. Desktop: the latest 3 sticky notes.
 */

import { cn } from '@/lib/utils'
import { useMembers, useNotes } from '../../lib/trip-data'

export function NotesSummary({ tripId }: { tripId: string }) {
  const notes = useNotes(tripId)
  const { members } = useMembers(tripId, { includeLeft: true })
  const people = new Map(members.map((m) => [m.userId, m]))

  if (notes.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground" data-testid="notes-summary">
        No notes yet. Open to add one.
      </span>
    )
  }
  return (
    <span className="block space-y-1.5" data-testid="notes-summary">
      <span className="block text-xs text-muted-foreground">
        {notes.length} {notes.length === 1 ? 'note' : 'notes'}
      </span>
      {notes.slice(0, 3).map((n, i) => {
        const author = people.get(n.authorId)
        return (
          <span
            key={n.id}
            className={cn(
              'block rounded-md border border-warning/40 bg-warning/15 px-2 py-1.5 text-sm',
              i > 0 && 'hidden min-[900px]:block',
              author?.status === 'left' && 'opacity-60 grayscale',
            )}
          >
            <span className="line-clamp-2 break-words">{n.text}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{author?.displayName ?? 'Someone'}</span>
          </span>
        )
      })}
    </span>
  )
}
