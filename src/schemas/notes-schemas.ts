/**
 * Co-farer — Module 5 (Notes) schema.
 *
 * `notes`: one sticky note on the trip's board. Team-read so the board is
 * live for everyone; written only by the actions in src/actions/notes.ts.
 * A note stays when its author leaves (spec: edge cases); the board grays
 * it out using the author's `team_members` status.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { sameForAllRoles, teamReadOnly } from './trip-schemas'

export const notesSchema: CollectionSchema = {
  name: 'notes',
  teamField: 'tripId',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'authorId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true, maxLength: 280 },
    // ISO time of the last edit; null if never edited.
    { name: 'editedAt', storage: 'text', interpretation: 'plain', maxLength: 30 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const notesSchemas: CollectionSchema[] = [notesSchema]
