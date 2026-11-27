/** Co-farer has one theme, Midnight Basecamp (co-farer-redesign/SPEC.md), defined in src/styles.css. */
export const THEMES = [
  { id: 'midnight', label: 'Midnight Basecamp', description: 'Charcoal, midnight blue, condensed headings.' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function getActiveTheme(): ThemeId {
  return 'midnight'
}
