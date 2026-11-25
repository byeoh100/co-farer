/**
 * Co-farer limits (PLAN.md §6). Starting points; the spec says they can change.
 * No build-time values here, so both the worker and the pages can import it.
 */

/** AI research calls allowed per trip (housing + activities + food). */
export const RESEARCH_CALL_CAP = 25

/** How many options "Suggest" creates, per module. */
export const SUGGESTION_COUNT = { housing: 5, activities: 10, food: 10 } as const

/**
 * Model for the research step: Claude Haiku 5.5 on Amazon Bedrock
 * (src/lib/ai-provider.ts), through the US inference profile, the only way
 * it runs in us-east-2 (docs/MIGRATION.md, Phase 2a). BEDROCK_MODEL_ID
 * overrides it. The human chose Haiku over Opus 5.5 for cost; the task is
 * reading search results into checked JSON, which suits it.
 */
export const RESEARCH_MODEL = 'us.anthropic.claude-haiku-5-5'
