/**
 * The ASSETS binding on plain workerd (docs/MIGRATION.md, Phase 1).
 *
 * workerd's disk service lists folders as JSON and sends no content types,
 * so this small worker gives the app what Cloudflare's asset layer does with
 * `not_found_handling = "none"`:
 *  - `/` and folder paths serve their index.html; `/about` tries about.html;
 *  - a miss is a real 404 (the app worker then picks the SPA shell);
 *  - content types by extension, and the headers from dist/client/_headers
 *    (only its global `/*` block, which is all the build writes);
 *  - long caching for the hashed files under /assets/.
 */

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  webmanifest: 'application/manifest+json',
}

const HIDDEN = new Set(['/_headers', '/_redirects', '/_routes.json'])

let globalHeaders = null

async function loadGlobalHeaders(disk) {
  if (globalHeaders) return globalHeaders
  const out = []
  try {
    const res = await disk.fetch('http://disk/_headers')
    if (res.ok) {
      let inGlobal = false
      for (const line of (await res.text()).split('\n')) {
        if (!line.trim()) continue
        if (!/^\s/.test(line)) {
          inGlobal = line.trim() === '/*'
          continue
        }
        const i = line.indexOf(':')
        if (inGlobal && i > 0) out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()])
      }
    }
  } catch {
    // No _headers: serve without them.
  }
  globalHeaders = out
  return out
}

/** A file from the disk, or null (missing, or a folder listing). */
async function readFile(disk, path, method) {
  const res = await disk.fetch(`http://disk${path}`, { method: method === 'HEAD' ? 'HEAD' : 'GET' })
  if (!res.ok) return null
  // The disk service answers a folder with a JSON listing; that's not a file.
  if ((res.headers.get('content-type') ?? '').startsWith('application/json') && !path.endsWith('.json') && !path.endsWith('.map')) {
    return null
  }
  return res
}

function candidates(pathname) {
  if (pathname.endsWith('/')) return [`${pathname}index.html`]
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (last.includes('.')) return [pathname]
  return [pathname, `${pathname}.html`, `${pathname}/index.html`]
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    const url = new URL(request.url)
    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Not found', { status: 404 })
    }
    // Cloudflare's asset config files are never served; everything else is (incl. `_layout-*.js` chunks).
    if (pathname.includes('..') || HIDDEN.has(pathname)) {
      return new Response('Not found', { status: 404 })
    }
    for (const path of candidates(pathname)) {
      const file = await readFile(env.DISK, path, request.method)
      if (!file) continue
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
      const headers = new Headers()
      headers.set('content-type', TYPES[ext] ?? 'application/octet-stream')
      const len = file.headers.get('content-length')
      if (len) headers.set('content-length', len)
      headers.set('cache-control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate')
      for (const [k, v] of await loadGlobalHeaders(env.DISK)) headers.set(k, v)
      return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers })
    }
    return new Response('Not found', { status: 404 })
  },
}
