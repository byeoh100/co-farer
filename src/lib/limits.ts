/**
 * Co-farer limits (PLAN.md §6). Starting points; the spec says they can change.
 * No build-time values here, so both the worker and the pages can import it.
 */

/** AI research calls allowed per trip (housing + activities + food). */
export const RESEARCH_CALL_CAP = 25

/** How many options "Suggest" creates, per module. */
export const SUGGESTION_COUNT = { housing: 5, activities: 10, food: 10 } as const

/**
 * Model for the research step (anthropic/chat-completion). Claude Haiku 5.5:
 * the human asked for a cheaper model (it was Claude Opus 5.5). About 40×
 * cheaper per token ($0.10 / $0.50 per million vs $4 / $20), and DeepSpace
 * bills Haiku at standard pricing on the free tier. The task is reading
 * search results into checked JSON, which suits it.
 */
export const RESEARCH_MODEL = 'claude-haiku-5-5'
