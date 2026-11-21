/**
 * Co-farer — Module 2 (Dates) schemas.
 *
 * `availability`: one row per date range a person is free. Dates are
 * YYYY-MM-DD text with no times, so they never shift between time zones.
 * A person's own overlapping or touching ranges are merged by
 * addAvailability, so rows never overlap for one person.
 * Team-read like every trip collection; written only by server actions.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { sameForAllRoles, teamReadOnly } from './trip-schemas'

export const availabilitySchema: CollectionSchema = {
  name: 'availability',
  teamField: 'tripId',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'start', storage: 'text', interpretation: 'plain', required: true, maxLength: 10 },
    { name: 'end', storage: 'text', interpretation: 'plain', required: true, maxLength: 10 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const datesSchemas: CollectionSchema[] = [availabilitySchema]
