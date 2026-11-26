/**
 * The AI research step's two outside calls (docs/MIGRATION.md, Phase 2a):
 *
 *  - `search(env, plan)`: the Brave Search API. Its key is read from
 *    Parameter Store (`/cofarer/brave-api-key`), or from BRAVE_API_KEY for
 *    local development only.
 *  - `complete(env, req)`: Claude on Amazon Bedrock through the Converse
 *    API, signed with AWS Signature V4 (aws4fetch, which runs in workerd).
 *
 * AWS credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_SESSION_TOKEN when set (local development, from the developer's own
 * profile); otherwise the EC2 instance role through IMDSv2, reached only
 * through the `IMDS` service binding (deploy/workerd.capnp). No AWS keys
 * live in the code or the repo.
 *
 * Neither function throws: a failure is logged (never its content) and
 * returned as null, so the caller can show its polite error.
 *
 * The response readers below are pure and unit-tested
 * (src/lib/ai-provider.test.ts). The safety rules stay in research.ts:
 * no tools are ever sent, page text is wrapped as untrusted data, sources
 * must come from the search results, a missing price stays null.
 */

import { DEFAULT_REGION, awsClient, getParameter, resetAwsCache, type AwsEnv } from './aws'
import { RESEARCH_MODEL } from './limits'
import { isSafeImageUrl, type SearchPlan, type SearchResult } from './research'

/** The environment variables and bindings this file reads (AWS ones: src/lib/aws.ts). */
export interface AiEnv extends AwsEnv {
  /** Bedrock model or inference profile ID (default below). */
  BEDROCK_MODEL_ID?: string
  /** Local development only; the server reads Parameter Store. */
  BRAVE_API_KEY?: string
}

export { awsCredentials, readImdsCredentials, readParameterValue } from './aws'
/**
 * Claude Haiku 5.5. In us-east-2 it runs only through the US inference
 * profile (us-east-1, us-east-2, us-west-2; the project's SCP allows all
 * three). The human approved this on 2026-11-25.
 */
export const DEFAULT_BEDROCK_MODEL = RESEARCH_MODEL
export const BRAVE_KEY_PARAMETER = '/cofarer/brave-api-key'

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search'
/** Brave's limits: at most 20 results per call, a 400-character query. */
const BRAVE_MAX_COUNT = 20
const BRAVE_MAX_QUERY = 400
/** Per-result text kept for the prompt (research.ts clips again at 2200). */
const MAX_RESULT_TEXT = 1500

// ── search ───────────────────────────────────────────────────────────────

/** Runs one search plan. Null when the search failed; [] when it found nothing. */
export async function search(env: AiEnv, plan: SearchPlan): Promise<SearchResult[] | null> {
  try {
    const key = await braveKey(env)
    if (!key) return null
    const first = await braveCall(key, braveQuery(plan), plan.numResults)
    if (first == null) return null
    // A pasted link Brave doesn't know yet: search its site for the words in its path.
    if (first.length === 0) {
      const fallback = urlFallbackQuery(plan.query)
      if (fallback) return (await braveCall(key, fallback, plan.numResults)) ?? []
    }
    return first
  } catch (err) {
    console.error(`[ai-provider] search failed: ${errorName(err)}`)
    return null
  }
}

async function braveCall(key: string, q: string, numResults: number): Promise<SearchResult[] | null> {
  const url = new URL(BRAVE_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('count', String(Math.min(BRAVE_MAX_COUNT, Math.max(1, numResults))))
  url.searchParams.set('extra_snippets', 'true')
  url.searchParams.set('safesearch', 'moderate')
  url.searchParams.set('result_filter', 'web')
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    console.error(`[ai-provider] Brave search answered HTTP ${res.status}`)
    return null
  }
  return readBraveResults(await res.json())
}

/**
 * Brave has no domain filters, so they become search operators:
 * includeDomains → `(site:a OR site:b)`, excludeDomains → `-site:a -site:b`.
 * The plain words are trimmed first so the filters always fit in 400 characters.
 */
export function braveQuery(plan: SearchPlan): string {
  const include = plan.includeDomains?.length ? `(${plan.includeDomains.map((d) => `site:${d}`).join(' OR ')})` : ''
  const exclude = (plan.excludeDomains ?? []).map((d) => `-site:${d}`).join(' ')
  const filters = [include, exclude].filter(Boolean).join(' ')
  const room = BRAVE_MAX_QUERY - (filters ? filters.length + 1 : 0)
  const words = plan.query.replace(/\s+/g, ' ').trim()
  const base = words.length > room ? words.slice(0, room).replace(/\s+\S*$/, '') : words
  return filters ? `${base} ${filters}` : base
}

/** For a pasted URL: `site:host` plus the words in its path ("cachuma lake yurts"). Null for anything else. */
export function urlFallbackQuery(query: string): string | null {
  if (!/^https?:\/\//i.test(query.trim())) return null
  try {
    const u = new URL(query.trim())
    const host = u.hostname.replace(/^www\./, '')
    const words = decodeURIComponent(u.pathname)
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !/^(html?|php|aspx?|index)$/i.test(w))
      .slice(0, 12)
      .join(' ')
    return `${words} site:${host}`.trim()
  } catch {
    return null
  }
}

/** Reads Brave's web results: http(s) only, HTML stripped, snippets joined, https thumbnails only. */
export function readBraveResults(raw: unknown): SearchResult[] {
  const list = (raw as { web?: { results?: unknown } } | null)?.web?.results
  if (!Array.isArray(list)) return []
  const out: SearchResult[] = []
  for (const r of list as Array<Record<string, unknown>>) {
    const url = typeof r.url === 'string' ? r.url : ''
    if (!/^https?:\/\//i.test(url)) continue
    const title = typeof r.title === 'string' && r.title.trim() ? plainText(r.title) : url
    const parts = [r.description, ...(Array.isArray(r.extra_snippets) ? r.extra_snippets : [])]
      .filter((s): s is string => typeof s === 'string')
      .map(plainText)
      .filter(Boolean)
    const text = [...new Set(parts)].join('\n').slice(0, MAX_RESULT_TEXT)
    const thumb = (r.thumbnail ?? {}) as { src?: unknown }
    out.push({ title, url, text, image: isSafeImageUrl(thumb.src) ? thumb.src : null })
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" }

/** Brave marks matches with <strong> and escapes entities; the prompt wants plain text. */
export function plainText(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase()
      if (k in ENTITIES) return ENTITIES[k]
      const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : k.startsWith('#') ? parseInt(k.slice(1), 10) : NaN
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    })
    .replace(/\s+/g, ' ')
    .trim()
}

// ── complete ─────────────────────────────────────────────────────────────

export interface CompleteRequest {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
}

/**
 * One Converse call with no tools. Returns the model's text, or null on any
 * failure (logged by status or error name, never the content).
 */
export async function complete(env: AiEnv, req: CompleteRequest): Promise<string | null> {
  try {
    const aws = await awsClient(env, 'bedrock')
    if (!aws) return null
    const region = env.AWS_REGION || DEFAULT_REGION
    const model = env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL
    const res = await aws.fetch(`https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(converseBody(req)),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      console.error(`[ai-provider] Bedrock answered HTTP ${res.status} (${res.headers.get('x-amzn-errortype') ?? 'no error type'})`)
      return null
    }
    const data = await res.json()
    const stop = (data as { stopReason?: unknown })?.stopReason
    if (stop === 'max_tokens') console.error('[ai-provider] Bedrock reply was cut off at maxTokens')
    const text = readConverseText(data)
    if (text == null) console.error(`[ai-provider] unrecognized Converse reply (stopReason ${String(stop)})`)
    return text
  } catch (err) {
    console.error(`[ai-provider] complete failed: ${errorName(err)}`)
    return null
  }
}

/** The Converse request body. No `toolConfig`, ever: the model gets no tools. */
export function converseBody(req: CompleteRequest) {
  return {
    system: [{ text: req.system }],
    messages: req.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
    inferenceConfig: { maxTokens: req.maxTokens },
  }
}

/** The text blocks of a Converse reply, joined; reasoning blocks are skipped. */
export function readConverseText(raw: unknown): string | null {
  const content = (raw as { output?: { message?: { content?: unknown } } } | null)?.output?.message?.content
  if (!Array.isArray(content)) return null
  const texts = content
    .filter((b): b is { text: string } => !!b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
  return texts.length ? texts.join('') : null
}

// ── Brave key ────────────────────────────────────────────────────────────

let cachedBraveKey: { value: string; until: number } | null = null
const BRAVE_KEY_TTL_MS = 60 * 60_000

async function braveKey(env: AiEnv): Promise<string | null> {
  if (env.BRAVE_API_KEY) return env.BRAVE_API_KEY
  if (cachedBraveKey && cachedBraveKey.until > Date.now()) return cachedBraveKey.value
  const value = await getParameter(env, BRAVE_KEY_PARAMETER)
  if (!value) return null
  cachedBraveKey = { value, until: Date.now() + BRAVE_KEY_TTL_MS }
  return value
}

/** Test hook: forget cached credentials and keys. */
export function resetAiProviderCache(): void {
  cachedBraveKey = null
  resetAwsCache()
}

function errorName(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : typeof err
}
