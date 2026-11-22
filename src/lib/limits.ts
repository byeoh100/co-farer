/**
 * Co-farer limits (PLAN.md §6). Starting points; the spec says they can change.
 * No build-time values here, so both the worker and the pages can import it.
 */

/** AI research calls allowed per trip (housing + activities + food). */
export const RESEARCH_CALL_CAP = 25

/** How many options "Suggest" creates, per module. */
export const SUGGESTION_COUNT = { housing: 5, activities: 10, food: 10 } as const

/** Model for the research step (anthropic/chat-completion). The human's choice in Module 3. */
export const RESEARCH_MODEL = 'claude-opus-5-5'
