/**
 * The sticky-note board (spec §5): add a note, edit or delete your own, and
 * the organizer can remove any. Notes from people who left stay, grayed out.
 * One sticky color for all (colors and checkboxes aren't in v1).
 */

import { useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, Textarea, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../lib/actions-client'
import { MAX_NOTE_LENGTH, MAX_NOTES_PER_TRIP } from '../../lib/notes'
import { useMembers, useNotes, type Member, type Note, type Trip } from '../../lib/trip-data'
import { MemberAvatar } from '../trip/MemberAvatar'

/** "just now", "5 min ago", "3 h ago", "Nov 21". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotesFull({ trip, me }: { trip: Trip; me: Member }) {
  const notes = useNotes(trip.id)
  // Include people who left: their notes stay on the board, grayed out.
  const { members } = useMembers(trip.id, { includeLeft: true })
  const people = new Map(members.map((m) => [m.userId, m]))
  const { success, error } = useToast()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Note | null>(null)
  const isOrganizer = me.tripRole === 'organizer'

  const run = async (key: string, name: string, params: Record<string, unknown>, done?: string) => {
    setBusy(key)
    const res = await callAction(name, { tripId: trip.id, ...params })
    setBusy(null)
    if (!res.success) {
      error('Couldn’t do that', res.error)
      return false
    }
    if (done) success(done)
    return true
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (await run('add', 'addNote', { text: draft })) setDraft('')
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4" data-testid="notes-full">
      <form onSubmit={add} className="space-y-2 rounded-xl border border-border bg-card p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(e)
          }}
          placeholder="Add a note for the group, e.g. “I’m bringing the speaker”"
          aria-label="New note"
          rows={2}
          data-testid="note-input"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {draft.length}/{MAX_NOTE_LENGTH}
            {notes.length >= MAX_NOTES_PER_TRIP - 20 && ` · ${notes.length} of ${MAX_NOTES_PER_TRIP} notes`}
          </span>
          <Button type="submit" size="sm" loading={busy === 'add'} disabled={!!busy || !draft.trim()} data-testid="add-note">
            Add note
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No notes yet. Add the first one.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="note-list">
          {notes.map((n) => (
            <StickyNote
              key={n.id}
              note={n}
              author={people.get(n.authorId)}
              mine={n.authorId === me.userId}
              canRemove={isOrganizer && n.authorId !== me.userId}
              busy={busy}
              onSave={(text) => run(`edit-${n.id}`, 'editNote', { noteId: n.id, text }, 'Note saved')}
              onDelete={() => setConfirm(n)}
            />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          const mine = confirm.authorId === me.userId
          await run('delete', mine ? 'deleteNote' : 'removeNote', { noteId: confirm.id }, mine ? 'Note deleted' : 'Note removed')
          setConfirm(null)
        }}
        loading={busy === 'delete'}
        title={confirm?.authorId === me.userId ? 'Delete your note?' : 'Remove this note?'}
        description={confirm?.authorId === me.userId ? 'It’s removed for everyone.' : 'It’s removed for everyone. Only the organizer can do this.'}
        confirmText={confirm?.authorId === me.userId ? 'Delete' : 'Remove'}
        variant="destructive"
      />
    </div>
  )
}

function StickyNote({
  note, author, mine, canRemove, busy, onSave, onDelete,
}: {
  note: Note
  author: Member | undefined
  mine: boolean
  canRemove: boolean
  busy: string | null
  onSave: (text: string) => Promise<boolean>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const left = author?.status === 'left'
  const name = author?.displayName ?? 'Someone'

  return (
    <li
      className={cn(
        'flex min-h-28 flex-col rounded-lg border border-warning/40 bg-warning/15 p-3 shadow-sm',
        left && 'opacity-60 grayscale',
      )}
      data-testid="note"
      data-note-id={note.id}
      data-author={name}
      data-left={left ? 'true' : undefined}
    >
      {editing ? (
        <form
          className="flex flex-1 flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await onSave(text)) setEditing(false)
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            rows={3}
            autoFocus
            aria-label="Edit note"
            className="bg-background/70"
            data-testid="note-edit-input"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setText(note.text); setEditing(false) }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy === `edit-${note.id}`} disabled={!!busy || !text.trim()} data-testid="note-save">
              Save
            </Button>
          </div>
        </form>
      ) : (
        <p className="flex-1 whitespace-pre-wrap break-words text-sm" data-testid="note-text">{note.text}</p>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {author && <MemberAvatar userId={author.userId} name={author.displayName} imageUrl={author.imageUrl} online={!left} size={20} />}
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground/80">{mine ? 'You' : name}</span>
          {left && <span data-testid="note-left"> · has left</span>}
          {' · '}
          {timeAgo(note.createdAt)}
          {note.editedAt && ' · edited'}
        </span>
        {!editing && (mine || canRemove) && (
          <span className="ml-auto flex shrink-0">
            {mine && (
              <button
                type="button"
                className="rounded p-1 hover:bg-background/60"
                onClick={() => { setText(note.text); setEditing(true) }}
                aria-label="Edit note"
                data-testid="note-edit"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="rounded p-1 hover:bg-background/60"
              onClick={onDelete}
              aria-label={mine ? 'Delete note' : 'Remove note'}
              data-testid="note-delete"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        )}
      </div>
    </li>
  )
}
