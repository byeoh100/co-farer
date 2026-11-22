/**
 * Food preferences (the Additional module's Food list). Starts with
 * requireMember and writes only the caller's own row (ctx.userId).
 * The row is team-read: the spec makes food preferences visible to the group.
 */

import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { parseFoodPrefs } from '../lib/food'
import { requireMember } from './trip-access'

type Handler = ActionHandler<Env>

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })

const setMyFoodPrefs: Handler = async ({ userId, params, tools }) => {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return fail(check.error, check.code)
  const tripId = check.membership.tripId
  const input = parseFoodPrefs(params)
  if (!input.ok) return fail(input.error, 'bad_request')
  const fields = { dietary: JSON.stringify(input.value.dietary), likes: input.value.likes, avoids: input.value.avoids }

  const find = async () => {
    const res = await tools.query('food_prefs', { where: { tripId, userId }, limit: 1 })
    return res.success ? (res.data.records[0] ?? null) : null
  }
  const row = await find()
  let res = row ? await tools.update('food_prefs', row.recordId, fields) : await tools.create('food_prefs', { tripId, userId, ...fields })
  if (!res.success && !row) {
    // A concurrent first save may have created it (uniqueOn).
    const again = await find()
    if (again) res = await tools.update('food_prefs', again.recordId, fields)
  }
  if (!res.success) return fail('Could not save your food preferences.', 'save_failed')
  return { success: true, data: { saved: true } }
}

export const foodActions: Record<string, Handler> = { setMyFoodPrefs }
