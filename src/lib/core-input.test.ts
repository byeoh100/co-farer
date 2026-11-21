import { describe, expect, it } from 'vitest'
import {
  INVITE_CODE_LENGTH, avatarInitial, generateInviteCode, isInviteCodeShape,
  parseBudgetInput, parseImageUrl, parseText, readPublicCategories, toStoredImagePath,
} from './core-input'

describe('invite codes', () => {
  it('are 12 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode()
      expect(code).toHaveLength(INVITE_CODE_LENGTH)
      expect(isInviteCodeShape(code)).toBe(true)
      expect(code).not.toMatch(/[0O1lI]/)
    }
  })
  it('differ between calls', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()))
    expect(codes.size).toBe(500)
  })
  it('skip biased bytes instead of wrapping them', () => {
    // 255 is above the rejection limit (224 for 56 symbols); only byte 0 maps.
    const random = (n: number) => new Uint8Array(n).fill(255).map((b, i) => (i % 2 ? 0 : b))
    expect(generateInviteCode(random)).toBe('A'.repeat(INVITE_CODE_LENGTH))
  })
  it('shape check rejects wrong lengths and characters', () => {
    expect(isInviteCodeShape('short')).toBe(false)
    expect(isInviteCodeShape('ABCDEFGHJK0M')).toBe(false)
    expect(isInviteCodeShape(42)).toBe(false)
  })
})

describe('parseText', () => {
  it('trims, collapses spaces and enforces limits', () => {
    expect(parseText('  Spring   break ', 'Name', 120)).toEqual({ ok: true, value: 'Spring break' })
    expect(parseText('   ', 'Name', 120).ok).toBe(false)
    expect(parseText('x'.repeat(121), 'Name', 120).ok).toBe(false)
    expect(parseText(undefined, 'Destination', 200, false)).toEqual({ ok: true, value: null })
    expect(parseText(5, 'Name', 120).ok).toBe(false)
  })
})

describe('parseBudgetInput', () => {
  it('accepts whole dollars, blanks and known public categories', () => {
    const r = parseBudgetInput({ housing: 150, gas: '40', food: '', publicCategories: ['gas', 'gas'] })
    expect(r).toEqual({ ok: true, value: { housing: 150, gas: 40, food: null, activities: null, publicCategories: ['gas'] } })
  })
  it('rejects negatives, decimals, huge numbers and text', () => {
    for (const bad of [-1, 10.5, 100_001, 'abc', true]) {
      expect(parseBudgetInput({ housing: bad }).ok).toBe(false)
    }
  })
  it('rejects unknown categories', () => {
    expect(parseBudgetInput({ publicCategories: ['rent'] }).ok).toBe(false)
    expect(parseBudgetInput({ publicCategories: 'gas' }).ok).toBe(false)
  })
})

describe('readPublicCategories', () => {
  it('reads JSON or arrays and drops junk', () => {
    expect(readPublicCategories('["gas","nope"]')).toEqual(['gas'])
    expect(readPublicCategories(['food'])).toEqual(['food'])
    expect(readPublicCategories('not json')).toEqual([])
    expect(readPublicCategories(null)).toEqual([])
  })
})

describe('profile pictures', () => {
  it('accept only app-scope files from this app', () => {
    expect(parseImageUrl('/api/files/app/avatars/a1b2.png?scope=app')).toEqual({ ok: true, value: '/api/files/app/avatars/a1b2.png?scope=app' })
    expect(parseImageUrl('')).toEqual({ ok: true, value: null })
    for (const bad of [
      'https://evil.example/pixel.png',
      '//evil.example/x.png',
      '/api/files/x.png?scope=self',
      '/api/files/../actions/x?scope=app',
      'javascript:alert(1)',
    ]) {
      expect(parseImageUrl(bad).ok).toBe(false)
    }
  })
  it('strip the origin from an upload URL', () => {
    expect(toStoredImagePath('https://co-farer.app.space/api/files/app/k.png?scope=app')).toBe('/api/files/app/k.png?scope=app')
  })
  it('default avatar uses the first letter of the first name', () => {
    expect(avatarInitial('maya rodriguez')).toBe('M')
    expect(avatarInitial('  ')).toBe('?')
    expect(avatarInitial(null)).toBe('?')
  })
})
