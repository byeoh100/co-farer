/**
 * Co-farer — Food preferences (the Additional module's Food list).
 *
 * `food_prefs`: one row per (trip, person): dietary needs from a fixed list,
 * plus cuisines they like and avoid. Team-read, because the spec makes food
 * preferences visible to the group. Written only by `setMyFoodPrefs`.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { DIETARY_TAGS } from '../lib/food'
import { sameForAllRoles, teamReadOnly } from './trip-schemas'

export const foodPrefsSchema: CollectionSchema = {
  name: 'food_prefs',
  teamField: 'tripId',
  uniqueOn: ['tripId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'dietary', storage: 'text', interpretation: { kind: 'multiselect', options: [...DIETARY_TAGS] } },
    { name: 'likes', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'avoids', storage: 'text', interpretation: 'plain', maxLength: 200 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const foodSchemas: CollectionSchema[] = [foodPrefsSchema]
