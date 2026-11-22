/**
 * The suggest-research-vote engine (PLAN.md §3). Built in Module 3 for
 * Housing; Activities and Food reuse it with their own `module` value.
 *
 * Every collection is team-read and server-written, like all trip data.
 * `options.fit` holds only counts (src/lib/budget-fit.ts), never a budget.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { sameForAllRoles, teamReadOnly } from './trip-schemas'

export const ENGINE_MODULES = ['housing'] as const // Activities and Food join in Modules 6 and 7.
export type EngineModule = (typeof ENGINE_MODULES)[number]

export const boardsSchema: CollectionSchema = {
  name: 'boards',
  teamField: 'tripId',
  uniqueOn: ['tripId', 'module'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'module', storage: 'text', interpretation: { kind: 'select', options: [...ENGINE_MODULES] }, required: true, immutable: true },
    { name: 'lockable', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    // waiting_for_dates (housing before dates lock) → open → locked
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['waiting_for_dates', 'open', 'locked'] }, default: 'open' },
    // ISO timestamp (UTC). At the deadline the top option locks.
    { name: 'deadline', storage: 'text', interpretation: 'plain', maxLength: 30 },
    { name: 'winningOptionId', storage: 'text', interpretation: 'plain' },
    // Set when an automatic lock found a tie: the organizer picks.
    { name: 'tieAtDeadline', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const optionsSchema: CollectionSchema = {
  name: 'options',
  teamField: 'tripId',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'module', storage: 'text', interpretation: { kind: 'select', options: [...ENGINE_MODULES] }, required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 160 },
    { name: 'url', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    { name: 'source', storage: 'text', interpretation: { kind: 'select', options: ['ai', 'member'] }, required: true },
    { name: 'addedBy', storage: 'text', interpretation: 'plain' },
    { name: 'researchStatus', storage: 'text', interpretation: { kind: 'select', options: ['pending', 'done', 'failed'] }, default: 'pending' },
    // JSON: { summary, pros[], cons[], sources[] } (sources are search-result URLs only)
    { name: 'research', storage: 'text', interpretation: 'plain' },
    // The whole stay for the whole group. The per-person share is derived from
    // it and the current group size (recomputed when members join or leave).
    { name: 'estTotal', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    { name: 'estPricePerPerson', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 0 } },
    { name: 'priceSource', storage: 'text', interpretation: { kind: 'select', options: ['ai', 'member'] } },
    // A photo URL straight from the search results (never chosen by the model).
    { name: 'imageUrl', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    // JSON CategoryFit (counts only). Housing only.
    { name: 'fit', storage: 'text', interpretation: 'plain' },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

/** Approval voting: one row per (option, person). */
export const votesSchema: CollectionSchema = {
  name: 'votes',
  teamField: 'tripId',
  uniqueOn: ['optionId', 'userId'],
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'optionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  permissions: sameForAllRoles(teamReadOnly),
}

export const engineSchemas: CollectionSchema[] = [boardsSchema, optionsSchema, votesSchema]
