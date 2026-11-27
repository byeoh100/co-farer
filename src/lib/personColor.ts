/**
 * One colour per traveller, used for their avatar, seat, vote segment and
 * notes on every card (co-farer-redesign/SPEC.md, Data rules).
 *
 * Members are ordered by when they joined (oldest first); a member's colour
 * is PALETTE[index % 8]. Members who left get the departed grey. Every
 * component goes through this file so one person has one colour everywhere.
 */

export const PALETTE = ['#F26B3A', '#E9C46A', '#7FB7BE', '#B8A1D9', '#9CC59A', '#E39AA8', '#8FB3E0', '#D9A46B'] as const
export const DEPARTED = '#6E6A64'

export interface ColorMember {
  userId: string
  joinedAt: string
  status: 'active' | 'left'
}

/** Join order: oldest first; ties by user id so the order never flickers. */
export function byJoinOrder<T extends Pick<ColorMember, 'joinedAt' | 'userId'>>(members: T[]): T[] {
  return [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId))
}

/**
 * A member's colour. Pass every member row of the trip, including members who
 * left, so colours don't shift when someone leaves. Unknown users get grey.
 */
export function personColor(members: ColorMember[], userId: string): string {
  const ordered = byJoinOrder(members)
  const i = ordered.findIndex((m) => m.userId === userId)
  if (i < 0 || ordered[i].status === 'left') return DEPARTED
  return PALETTE[i % PALETTE.length]
}

/** userId → colour for the whole trip, computed once. */
export function personColors(members: ColorMember[]): Map<string, string> {
  const ordered = byJoinOrder(members)
  return new Map(ordered.map((m, i) => [m.userId, m.status === 'left' ? DEPARTED : PALETTE[i % PALETTE.length]]))
}

/** "Maya Ruiz" → "MR", "sam" → "S". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
