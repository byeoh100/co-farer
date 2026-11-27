import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppContext } from '../../worker'
import { registerHealthRoute } from './http-routes'

/** A fake RECORD_ROOMS whose room answers the tools API with `reply` (or throws). */
function env(reply: (() => Response) | 'throw') {
  const stub = { fetch: async () => { if (reply === 'throw') throw new Error('room down'); return reply() } }
  return { DEEPSPACE_APP_ID: 'app', OWNER_USER_ID: 'owner', RECORD_ROOMS: { idFromName: () => 'id', get: () => stub } }
}
const get = (e: object) => {
  const app = new Hono<AppContext>()
  registerHealthRoute(app)
  return app.request('http://x/healthz', {}, e as never)
}

describe('/healthz', () => {
  it('is ok when the data room answers a read', async () => {
    const res = await get(env(() => Response.json({ success: true, data: { records: [] } })))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
  it('is 503 when the room errors or refuses', async () => {
    expect((await get(env('throw'))).status).toBe(503)
    expect((await get(env(() => Response.json({ success: false, error: 'x' })))).status).toBe(503)
    expect(await (await get(env('throw'))).text()).toBe('unavailable')
  })
})
