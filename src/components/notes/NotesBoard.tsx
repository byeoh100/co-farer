/**
 * Notes on the trip overview (co-farer-redesign/SPEC.md, NotesBoard): a
 * wrapping row of bubbles, newest first, each tinted with its author's
 * colour. Notes from people who left are grey and say so. Your own notes
 * (and, for the organizer, anyone's) keep their controls, shown on hover or
 * focus: delete here with the usual confirmation, edit in the Notes view.
 */

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmModal, useToast } from '@/components/ui'
import { callAction } from '../../lib/actions-client'
import { usePersonColor } from '../../lib/person-colors-context'
import { useMembers, useNotes, type Member, type Note } from '../../lib/trip-data'
import { CardHeader, CardShell, PillButton } from '../trip/cards'
import type { SectionControl } from '../trip/ExpandableSection'
import { ScrollArea } from '../trip/ScrollArea'

export function NotesBoard({ tripId, me, control }: { tripId: string; me: Member; control: SectionControl }) {
  const notes = useNotes(tripId)
  const { members } = useMembers(tripId, { includeLeft: true })
  const people = new Map(members.map((m) => [m.userId, m]))
  const colorOf = usePersonColor()
  const { success, error } = useToast()
  const [confirm, setConfirm] = useState<Note | null>(null)
  const [busy, setBusy] = useState(false)
  const isOrganizer = me.tripRole === 'organizer'

  const remove = async () => {
    if (!confirm) return
    const mine = confirm.authorId === me.userId
    setBusy(true)
    const res = await callAction(mine ? 'deleteNote' : 'removeNote', { tripId, noteId: confirm.id })
    setBusy(false)
    setConfirm(null)
    if (res.success) success(mine ? 'Note deleted' : 'Note removed')
    else error('Couldn’t do that', res.error)
  }

  return (
    <CardShell sectionId="notes" className="h-[400px] gap-3" testId="notes-summary">
      <CardHeader
        title="Notes"
        sub={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · newest first`}
        action={
          <PillButton size="sm" data-testid="section-notes" onClick={control.open} {...control.buttonProps}>
            + Add note
          </PillButton>
        }
      />
      {notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-cf-muted">No notes yet</p>
      ) : (
        <ScrollArea label="Notes, newest first" className="flex flex-wrap content-start gap-2">
          {notes.map((n) => {
            const author = people.get(n.authorId)
            const left = !author || author.status === 'left'
            const name = author?.displayName ?? 'Someone'
            const color = left ? 'var(--cf-faint)' : colorOf(n.authorId)
            const mine = n.authorId === me.userId
            const canDelete = mine || (isOrganizer && !mine)
            return (
              <div
                key={n.id}
                className="group relative max-w-full rounded-2xl border-l-[3px] px-3.5 py-2.5"
                style={{ borderColor: color, background: left ? 'transparent' : `${colorOf(n.authorId)}24`, color: left ? 'var(--cf-faint)' : undefined }}
                data-testid="overview-note"
              >
                <span className="whitespace-pre-wrap break-words">{n.text}</span>{' '}
                <span className="text-xs font-semibold" style={{ color }}>
                  · {name}
                  {left && ', has left'}
                </span>
                {canDelete && (
                  <span className="ml-1.5 inline-flex gap-0.5 align-middle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {mine && (
                      <button type="button" aria-label="Edit note" onClick={control.open} className="rounded p-1 text-cf-muted hover:text-cf-text">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    <button type="button" aria-label={mine ? 'Delete note' : 'Remove note'} onClick={() => setConfirm(n)} className="rounded p-1 text-cf-muted hover:text-cf-text">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </ScrollArea>
      )}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        loading={busy}
        title={confirm?.authorId === me.userId ? 'Delete your note?' : 'Remove this note?'}
        description={confirm?.authorId === me.userId ? 'It’s removed for everyone.' : 'It’s removed for everyone. Only the organizer can do this.'}
        confirmText={confirm?.authorId === me.userId ? 'Delete' : 'Remove'}
        variant="destructive"
      />
    </CardShell>
  )
}
