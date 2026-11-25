#!/usr/bin/env node
/**
 * Runs Co-farer on plain workerd locally (docs/MIGRATION.md, Phase 1).
 *
 *   npm run build && npm run workerd      → http://localhost:8080
 *
 * - Makes a local ES256 key pair once, in .workerd-data/stub-auth.json
 *   (gitignored), for the Phase 1 stand-in sign-in.
 * - Points DeepSpace's platform URLs at a closed local port, so anything
 *   that still needs a DeepSpace server fails visibly instead of silently.
 * - Keeps Durable Object data in .workerd-data/do across restarts.
 */

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dataDir = resolve(root, '.workerd-data')
const doDir = resolve(dataDir, 'do')
const keyFile = resolve(dataDir, 'stub-auth.json')
mkdirSync(doDir, { recursive: true })

if (!existsSync(resolve(root, 'dist/co_farer/index.js'))) {
  console.error('No build found. Run `npm run build` first.')
  process.exit(1)
}

if (!existsSync(keyFile)) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  writeFileSync(
    keyFile,
    JSON.stringify({
      publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
      privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    { mode: 0o600 },
  )
  console.log('Made a local stub sign-in key pair in .workerd-data/stub-auth.json')
}
const keys = JSON.parse(readFileSync(keyFile, 'utf8'))

// A port nothing listens on: every DeepSpace platform call fails fast.
const CLOSED = 'http://127.0.0.1:9'

const env = {
  ...process.env,
  DEEPSPACE_APP_ID: 'app_01M7YNEGCHEWFMYBPJTYECY9KT',
  APP_NAME: 'co-farer',
  NATIVE_AUTH_REDIRECT_URIS: '',
  AUTH_JWT_PUBLIC_KEY: keys.publicPem,
  AUTH_JWT_ISSUER: 'cofarer-local-stub',
  OWNER_USER_ID: 'stub-owner',
  AUTH_WORKER_URL: CLOSED,
  API_WORKER_URL: CLOSED,
  PLATFORM_WORKER_URL: CLOSED,
  APP_OWNER_JWT: 'phase1-dummy-owner-jwt',
  ALLOW_DEBUG_ROUTES: 'true',
  LOCAL_STUB_AUTH: 'true',
  STUB_AUTH_PRIVATE_KEY: keys.privatePem,
}

const bin = resolve(root, 'node_modules/.bin/workerd')
const args = [
  'serve',
  resolve(root, 'deploy/workerd.capnp'),
  '--experimental',
  `--directory-path=assets-disk=${resolve(root, 'dist/client')}`,
  `--directory-path=do-storage=${doDir}`,
  ...process.argv.slice(2),
]
console.log('Co-farer on workerd → http://localhost:8080   (sign in: http://localhost:8080/api/auth/stub-login)')
const child = spawn(bin, args, { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
