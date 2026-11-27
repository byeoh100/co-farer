import { describe, expect, it } from 'vitest'
import { daysUntil, leadOption, leaderboard, pickedByLabel, seatsLeft, voteShare } from './overview'

const o = (id: string, createdAt: string) => ({ id, createdAt })
const votes = new Map([['b', ['x', 'y']], ['c', ['x', 'y']], ['d', ['x']]])
const options = [o('a', '1'), o('b', '3'), o('c', '2'), o('d', '0')]

describe('leaderboard and lead option', () => {
  it('orders by votes, then oldest first', () => {
    expect(leaderboard(options, votes).map((x) => x.id)).toEqual(['c', 'b', 'd', 'a'])
  })
  it('leads with the locked option, else the top of the leaderboard', () => {
    expect(leadOption(options, votes, 'a')?.id).toBe('a')
    expect(leadOption(options, votes, null)?.id).toBe('c')
    expect(leadOption(options, votes, 'gone')?.id).toBe('c')
    expect(leadOption([], votes, null)).toBeNull()
  })
  it('ties with no votes go to the earliest added', () => {
    expect(leadOption([o('x', '5'), o('y', '4')], new Map(), null)?.id).toBe('y')
  })
})

describe('small helpers', () => {
  it('vote share is capped at 100%', () => {
    expect(voteShare(3, 6)).toBe(50)
    expect(voteShare(7, 6)).toBe(100)
    expect(voteShare(1, 0)).toBe(0)
  })
  it('seats left counts only open seats', () => {
    expect(seatsLeft([{ seats: 3, riders: ['a'] }, { seats: 2, riders: ['b', 'c'] }, { seats: 1, riders: ['d', 'e'] }])).toBe(2)
  })
  it('names who picked', () => {
    expect(pickedByLabel([])).toBe('No picks yet')
    expect(pickedByLabel(['Maya'])).toBe('Picked by Maya')
    expect(pickedByLabel(['Maya', 'Jordan', 'Sam'])).toBe('Picked by Maya, Jordan and Sam')
  })
  it('counts days', () => {
    expect(daysUntil('2027-03-19', '2026-11-27')).toBe(112)
    expect(daysUntil('2026-11-26', '2026-11-27')).toBe(-1)
  })
})
