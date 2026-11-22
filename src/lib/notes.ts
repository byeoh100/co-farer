/** Module 5 (Notes): limits and input checks, shared by the actions and the board. */

export const MAX_NOTE_LENGTH = 280
export const MAX_NOTES_PER_TRIP = 200

/** Trims the note (keeping line breaks, at most two in a row); refuses empty or too long. */
export function parseNoteText(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== 'string') return { ok: false, error: 'Write something first.' }
  const text = v
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return { ok: false, error: 'Write something first.' }
  if (text.length > MAX_NOTE_LENGTH) return { ok: false, error: `Notes can be at most ${MAX_NOTE_LENGTH} characters.` }
  return { ok: true, value: text }
}
