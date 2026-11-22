/**
 * Food preferences and the "may not suit" warning (spec §7). Pure functions,
 * shared by the actions, the research prompts and the Food list.
 */

export const DIETARY_TAGS = [
  'vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'dairy_free', 'nut_allergy', 'shellfish_allergy', 'halal', 'kosher',
] as const
export type DietaryTag = (typeof DIETARY_TAGS)[number]

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  gluten_free: 'gluten-free',
  dairy_free: 'dairy-free',
  nut_allergy: 'nut allergy',
  shellfish_allergy: 'shellfish allergy',
  halal: 'halal',
  kosher: 'kosher',
}

export const MAX_CUISINE_TEXT = 200

export function isDietaryTag(v: unknown): v is DietaryTag {
  return (DIETARY_TAGS as readonly unknown[]).includes(v)
}

/** A stored multiselect (JSON text or a list) → known tags, without repeats. */
export function readDietary(raw: unknown): DietaryTag[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  return Array.isArray(list) ? [...new Set(list.filter(isDietaryTag))] : []
}

export interface FoodPrefsInput {
  dietary: DietaryTag[]
  likes: string | null
  avoids: string | null
}

/** Checks setMyFoodPrefs' params: known tags only, short cuisine lists. */
export function parseFoodPrefs(p: Record<string, unknown>): { ok: true; value: FoodPrefsInput } | { ok: false; error: string } {
  if (p.dietary != null && !Array.isArray(p.dietary)) return { ok: false, error: 'Pick dietary needs from the list.' }
  const raw = (p.dietary as unknown[] | undefined) ?? []
  if (raw.some((t) => !isDietaryTag(t))) return { ok: false, error: 'Pick dietary needs from the list.' }
  const text = (v: unknown, label: string): string | null | { error: string } => {
    if (v == null || v === '') return null
    if (typeof v !== 'string') return { error: `${label} must be text.` }
    const t = v.replace(/\s+/g, ' ').trim()
    if (t.length > MAX_CUISINE_TEXT) return { error: `${label} can be at most ${MAX_CUISINE_TEXT} characters.` }
    return t || null
  }
  const likes = text(p.likes, 'Cuisines you like')
  if (likes && typeof likes === 'object') return { ok: false, error: likes.error }
  const avoids = text(p.avoids, 'Cuisines to avoid')
  if (avoids && typeof avoids === 'object') return { ok: false, error: avoids.error }
  return { ok: true, value: { dietary: [...new Set(raw as DietaryTag[])], likes, avoids } }
}

/** How many people need each tag (active members only), most needed first. */
export function groupNeeds(prefs: Array<{ dietary: DietaryTag[] }>): Array<{ tag: DietaryTag; count: number }> {
  const counts = new Map<DietaryTag, number>()
  for (const p of prefs) for (const t of new Set(p.dietary)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || DIETARY_TAGS.indexOf(a.tag) - DIETARY_TAGS.indexOf(b.tag))
}

export interface FoodWarning {
  missing: Array<{ tag: DietaryTag; count: number }>
  /** "May not suit: vegetarian (2), gluten-free (1)" */
  text: string
}

/**
 * The warning triangle: every need in the group that the place isn't
 * confirmed to accommodate. Unknown (not researched, or the sources didn't
 * say) counts as not confirmed, the human's decision: safer for allergies.
 * The place stays on the list either way.
 */
export function foodWarning(accommodates: DietaryTag[] | null, prefs: Array<{ dietary: DietaryTag[] }>): FoodWarning | null {
  const ok = new Set(accommodates ?? [])
  const missing = groupNeeds(prefs).filter((n) => !ok.has(n.tag))
  if (missing.length === 0) return null
  return { missing, text: `May not suit: ${missing.map((m) => `${DIETARY_LABELS[m.tag]} (${m.count})`).join(', ')}` }
}
