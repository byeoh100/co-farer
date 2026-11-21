import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema'

/**
 * Users. Two Co-farer changes from the scaffold:
 *  - Non-admins can't edit their row at all. DeepSpace manages name, email
 *    and picture from the sign-in identity, and `role` must never be
 *    self-editable. Co-farer's own profile lives in `profiles`.
 *  - `roster: 'read-policy'`: the app-wide user list shows a non-admin only
 *    the rows their read policy grants (their own). Without it every signed-in
 *    user could list every user's name and picture across all trips. Members
 *    see each other through `team_members` (displayName, imageUrl) instead.
 */
const readOwnOnly = { read: 'own', create: false, update: false, delete: false } as const

export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [...USERS_COLUMNS],
  roster: 'read-policy',
  permissions: {
    viewer: { ...readOwnOnly },
    member: { ...readOwnOnly },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
