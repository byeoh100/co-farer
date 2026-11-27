import { describe, expect, it } from 'vitest'
import { DEPARTED, PALETTE, byJoinOrder, initials, personColor, personColors } from './personColor'

const m = (userId: string, joinedAt: string, status: 'active' | 'left' = 'active') => ({ userId, joinedAt, status })

describe('personColor', () => {
  it('orders by join time, not by the order rows arrive', () => {
    const members = [m('c', '2026-01-03'), m('a', '2026-01-01'), m('b', '2026-01-02')]
    expect(personColor(members, 'a')).toBe(PALETTE[0])
    expect(personColor(members, 'b')).toBe(PALETTE[1])
    expect(personColor(members, 'c')).toBe(PALETTE[2])
    expect(personColor([...members].reverse(), 'c')).toBe(PALETTE[2])
    expect(byJoinOrder(members).map((x) => x.userId)).toEqual(['a', 'b', 'c'])
  })
  it('wraps after 8', () => {
    const members = Array.from({ length: 10 }, (_, i) => m(`u${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`))
    expect(personColor(members, 'u8')).toBe(PALETTE[0])
    expect(personColor(members, 'u9')).toBe(PALETTE[1])
  })
  it('gives departed members grey without shifting anyone else', () => {
    const members = [m('a', '1'), m('b', '2', 'left'), m('c', '3')]
    expect(personColor(members, 'b')).toBe(DEPARTED)
    expect(personColor(members, 'c')).toBe(PALETTE[2])
    expect(personColors(members).get('b')).toBe(DEPARTED)
    expect(personColor(members, 'nobody')).toBe(DEPARTED)
  })
  it('makes initials', () => {
    expect(initials('Maya Ruiz')).toBe('MR')
    expect(initials('sam')).toBe('S')
    expect(initials('  ')).toBe('?')
    expect(initials('Ana de la Cruz')).toBe('AC')
  })
})
