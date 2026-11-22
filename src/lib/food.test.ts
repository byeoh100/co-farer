import { describe, expect, it } from 'vitest'
import { foodWarning, groupNeeds, parseFoodPrefs, readDietary } from './food'

describe('parseFoodPrefs', () => {
  it('accepts known tags (without repeats) and short cuisine text', () => {
    expect(parseFoodPrefs({ dietary: ['vegetarian', 'vegetarian', 'nut_allergy'], likes: '  Thai,   Mexican ', avoids: '' })).toEqual({
      ok: true, value: { dietary: ['vegetarian', 'nut_allergy'], likes: 'Thai, Mexican', avoids: null },
    })
    expect(parseFoodPrefs({})).toEqual({ ok: true, value: { dietary: [], likes: null, avoids: null } })
  })
  it('refuses unknown tags and long text', () => {
    expect(parseFoodPrefs({ dietary: ['carnivore'] }).ok).toBe(false)
    expect(parseFoodPrefs({ dietary: 'vegan' }).ok).toBe(false)
    expect(parseFoodPrefs({ likes: 'x'.repeat(201) }).ok).toBe(false)
  })
  it('reads stored multiselects tolerantly', () => {
    expect(readDietary('["vegan","nope"]')).toEqual(['vegan'])
    expect(readDietary('not json')).toEqual([])
    expect(readDietary(null)).toEqual([])
  })
})

describe('groupNeeds and foodWarning', () => {
  const prefs = [{ dietary: ['vegetarian' as const, 'gluten_free' as const] }, { dietary: ['vegetarian' as const] }, { dietary: [] }]

  it('counts each need once per person, most needed first', () => {
    expect(groupNeeds(prefs)).toEqual([{ tag: 'vegetarian', count: 2 }, { tag: 'gluten_free', count: 1 }])
  })
  it('warns about every need the place isn’t confirmed to accommodate', () => {
    expect(foodWarning(['gluten_free'], prefs)?.text).toBe('May not suit: vegetarian (2)')
    expect(foodWarning([], prefs)?.text).toBe('May not suit: vegetarian (2), gluten-free (1)')
    expect(foodWarning(['vegetarian', 'gluten_free', 'vegan'], prefs)).toBeNull()
  })
  it('treats unknown (not researched) as not confirmed, and no needs as no warning', () => {
    expect(foodWarning(null, prefs)?.missing).toHaveLength(2)
    expect(foodWarning(null, [{ dietary: [] }])).toBeNull()
  })
})
