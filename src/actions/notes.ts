/**
 * Module 5 (Notes) server actions. Each starts with requireMember (or
 * requireOrganizer) and uses ctx.userId, never a userId from params.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { MAX_NOTES_PER_TRIP, parseNoteText } from '../lib/notes'
import { requireMember, requireOrganizer } from './trip-access'

type Handler = ActionHandler<Env>
type NoteRow = { tripId: string; authorId: string; text: string } & Record<string, unknown>

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })
const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

/** The note, if it's in this trip. Same answer for "missing" and "other trip". */
async function findNote(tools: ActionTools, tripId: string, noteId: unknown) {
  if (typeof noteId !== 'string' || !noteId) return null
  const res = await tools.get<NoteRow>('notes', noteId)
  return res.success && res.data.record.data.tripId === tripId ? res.data.record : null
}

const addNote: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const text = parseNoteText(params.text)
  if (!text.ok) return fail(text.error, 'bad_request')
  const existing = await tools.query('notes', { where: { tripId }, limit: MAX_NOTES_PER_TRIP })
  if (existing.success && existing.data.records.length >= MAX_NOTES_PER_TRIP) {
    return fail(`The board is full (${MAX_NOTES_PER_TRIP} notes). Remove some old ones first.`, 'too_many_notes')
  }
  const created = await tools.create('notes', { tripId, authorId: userId, text: text.value, editedAt: null })
  if (!created.success) return fail('Could not add the note.', 'create_failed')
  return ok({ noteId: created.data.recordId })
}

/** Your own notes only. */
const editNote: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const note = await findNote(tools, check.membership.tripId, params.noteId)
  if (!note || note.data.authorId !== userId) return fail('That note wasn’t found, or isn’t yours.', 'not_found')
  const text = parseNoteText(params.text)
  if (!text.ok) return fail(text.error, 'bad_request')
  if (text.value === note.data.text) return ok({ saved: true })
  const res = await tools.update('notes', note.recordId, { text: text.value, editedAt: new Date().toISOString() })
  if (!res.success) return fail('Could not save the note.', 'save_failed')
  return ok({ saved: true })
}

/** Your own notes only. */
const deleteNote: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const note = await findNote(tools, check.membership.tripId, params.noteId)
  if (!note || note.data.authorId !== userId) return fail('That note wasn’t found, or isn’t yours.', 'not_found')
  const res = await tools.remove('notes', note.recordId)
  if (!res.success) return fail('Could not delete the note.', 'delete_failed')
  return ok({ deleted: true })
}

/** The organizer removes anyone's note, including ones from people who left. */
const removeNote: Handler = async ({ userId, params, tools }) => {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const note = await findNote(tools, check.membership.tripId, params.noteId)
  if (!note) return fail('That note wasn’t found.', 'not_found')
  const res = await tools.remove('notes', note.recordId)
  if (!res.success) return fail('Could not remove the note.', 'delete_failed')
  return ok({ removed: true })
}

export const notesActions: Record<string, Handler> = { addNote, editNote, deleteNote, removeNote }
