import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { testCleanupActions } from './test-cleanup'

const run = (userId: string, allow: string | undefined) => {
  const query = vi.fn(async () => ({ success: true, data: { records: [] } }))
  const tools = { query, deleteWhere: vi.fn(), remove: vi.fn() } as unknown as ActionTools
  const result = testCleanupActions.cleanupMyTestTrips({ userId, params: {}, tools, env: { ALLOW_DEBUG_ROUTES: allow } as never, callerJwt: 'x' })
  return { result, query }
}

describe('cleanupMyTestTrips', () => {
  it('refuses a real account, even on a local server', async () => {
    const { result, query } = run('71fb35a0-a041-7081-da1d-575683ad86d3', 'true')
    expect(await result).toMatchObject({ success: false, code: 'not_available' })
    expect(query).not.toHaveBeenCalled()
  })
  it('refuses a test identity on a server that isn’t local', async () => {
    for (const allow of [undefined, 'false', '']) expect(await run('test-alice', allow).result).toMatchObject({ success: false, code: 'not_available' })
  })
  it('runs for a test identity on a local server', async () => {
    const { result, query } = run('test-alice', 'true')
    expect(await result).toMatchObject({ success: true })
    expect(query).toHaveBeenCalled()
  })
})
