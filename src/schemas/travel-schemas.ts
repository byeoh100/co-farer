/**
 * Co-farer — Module 4 (Transportation) schemas.
 *
 *  - `travel`: one row per (trip, person): how they're getting there. No row
 *    means "not decided". Team-read, like all trip data.
 *  - `seat_claims`: one row per rider in a car. `uniqueOn [tripId,
 *    riderUserId]` means a rider holds one seat at a time. Team-read, so the
 *    carpool board updates live for everyone.
 *  - `pickup_notes`: a rider's pickup note (often an address). Owner-only:
 *    the driver and the others in that car get it through `getCarPickups`,
 *    which checks they're in the car. Nobody else in the trip can read it.
 *
 * Every write goes through a server action in src/actions/travel.ts.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import { sameForAllRoles, teamReadOnly } from './trip-schemas'

const ownReadOnly: RolePermissions = { read: 'own', create: false, update: false, delete: false }

export const TRAVEL_MODES = ['undecided', 'driving', 'riding', 'other'] as const
export type TravelMode = (typeof TRAVEL_MODES)[number]

/** "Another way": the dropdown the human asked for. */
export const OTHER_KINDS = ['flight', 'train', 'bus', 'dropoff', 'other'] as const
export type OtherKind = (typeof OTHER_KINDS)[number]

export const travelSchema: CollectionSchema = {
  name: 'travel',
  teamField: 'tripId',
  uniqueOn: ['tripId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'mode', storage: 'text', interpretation: { kind: 'select', options: [...TRAVEL_MODES] }, default: 'undecided' },
    // Drivers: where the car leaves from. Null = the trip's meeting point.
    { name: 'startPoint', storage: 'text', interpretation: 'plain', maxLength: 120 },
    // Drivers: passenger seats, not counting the driver.
    { name: 'seats', storage: 'number', interpretation: 'plain' },
    // "Another way": flight, train, bus, drop-off or other, with details and dates.
    { name: 'otherKind', storage: 'text', interpretation: { kind: 'select', options: [...OTHER_KINDS] } },
    { name: 'details', storage: 'text', interpretation: 'plain', maxLength: 300 },
    // YYYY-MM-DD: when they get there and when they leave (optional).
    { name: 'fromDate', storage: 'text', interpretation: 'plain', maxLength: 10 },
    { name: 'toDate', storage: 'text', interpretation: 'plain', maxLength: 10 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const seatClaimsSchema: CollectionSchema = {
  name: 'seat_claims',
  teamField: 'tripId',
  uniqueOn: ['tripId', 'riderUserId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'driverUserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'riderUserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Bumped when the rider edits their pickup note, so the car refetches it.
    // A counter only: the note itself is never in this row.
    { name: 'pickupVersion', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const pickupNotesSchema: CollectionSchema = {
  name: 'pickup_notes',
  ownerField: 'userId',
  uniqueOn: ['tripId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'note', storage: 'text', interpretation: 'plain', maxLength: 200 },
  ],
  permissions: sameForAllRoles(ownReadOnly),
}

export const travelSchemas: CollectionSchema[] = [travelSchema, seatClaimsSchema, pickupNotesSchema]
