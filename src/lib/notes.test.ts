import { describe, expect, it } from 'vitest'
import { MAX_NOTE_LENGTH, parseNoteText } from './notes'
import { timeAgo } from '../components/notes/NotesFull'

describe('parseNoteText', () => {
  it('trims spaces, keeps line breaks, and squeezes blank lines', () => {
    expect(parseNoteText('  I’m bringing   the speaker  ')).toEqual({ ok: true, value: 'I’m bringing the speaker' })
    expect(parseNoteText('Snacks:\r\n- chips\n\n\n\n- salsa')).toEqual({ ok: true, value: 'Snacks:\n- chips\n\n- salsa' })
  })
  it('refuses empty, non-text and too-long notes', () => {
    for (const v of ['', '   \n  ', null, 5]) expect(parseNoteText(v).ok).toBe(false)
    expect(parseNoteText('x'.repeat(MAX_NOTE_LENGTH)).ok).toBe(true)
    expect(parseNoteText('x'.repeat(MAX_NOTE_LENGTH + 1)).ok).toBe(false)
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2027-03-19T12:00:00Z')
  it('reads like a person would say it', () => {
    expect(timeAgo('2027-03-19T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2027-03-19T11:55:00Z', now)).toBe('5 min ago')
    expect(timeAgo('2027-03-19T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2027-03-17T12:00:00Z', now)).toMatch(/Mar 17|17 Mar/)
  })
})
