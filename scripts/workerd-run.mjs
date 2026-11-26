#!/usr/bin/env node
/**
 * Runs Co-farer on plain workerd locally (docs/MIGRATION.md, Phases 1–2).
 *
 *   npm run build && npm run workerd      → http://localhost:8080
 *
 * - Makes a local ES256 key pair once, in .workerd-data/stub-auth.json
 *   (gitignored), for the Phase 1 stand-in sign-in.
 * - Points DeepSpace's platform URLs at a closed local port, so anything
 *   that still needs a DeepSpace server fails visibly instead of silently.
 * - Keeps Durable Object data in .workerd-data/do across restarts.
 * - AI research (Phase 2a): the @deepspace.test stand-in users get the free
 *   fake AI, as before. For real Bedrock and Brave calls, run with `--aws`:
 *   it exports short-lived credentials from your AWS profile (AWS_PROFILE,
 *   default "cofarer") with `aws configure export-credentials`, and reads
 *   BRAVE_API_KEY from your shell if set (else Parameter Store). Those keys
 *   live only in this process's environment, never in a file.
 */

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { homedir } from 'node:os'
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
  // Phase 2b: real Cognito sign-in alongside the stub (public identifiers, not
  // secrets; also in Parameter Store under /cofarer/cognito-*). Locally the app
  // signs its own tokens with the local key above, so no AWS access is needed
  // to sign in. Set COGNITO_CLIENT_ID= (empty) to turn Cognito off.
  COGNITO_DOMAIN: process.env.COGNITO_DOMAIN ?? 'https://co-farer.auth.us-east-2.amazoncognito.com',
  COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? '3ofnp5fam86b8s3j10barba1dl',
  COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ?? 'us-east-2_DHqzYR5y0',
  APP_URL: 'http://localhost:8080',
  APP_JWT_PRIVATE_KEY: keys.privatePem,
}

const userArgs = process.argv.slice(2)
const useAws = userArgs.includes('--aws')
env.AWS_REGION ||= 'us-east-2'
env.BEDROCK_MODEL_ID ||= ''
for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'BRAVE_API_KEY']) env[k] ||= ''
if (useAws) {
  const profile = process.env.AWS_PROFILE || 'cofarer'
  try {
    const out = execFileSync('aws', ['configure', 'export-credentials', '--profile', profile, '--format', 'process'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${process.env.PATH}:${resolve(homedir(), '.local/bin')}` },
    })
    const c = JSON.parse(out)
    env.AWS_ACCESS_KEY_ID = c.AccessKeyId
    env.AWS_SECRET_ACCESS_KEY = c.SecretAccessKey
    env.AWS_SESSION_TOKEN = c.SessionToken ?? ''
    console.log(`Using AWS profile "${profile}" for Bedrock${env.BRAVE_API_KEY ? '' : ' and Parameter Store'}${c.Expiration ? ` (credentials expire ${c.Expiration})` : ''}`)
  } catch {
    console.error(`Couldn't get credentials for AWS profile "${profile}". Run \`aws login --profile ${profile}\` first.`)
    process.exit(1)
  }
}

const bin = resolve(root, 'node_modules/.bin/workerd')
const args = [
  'serve',
  resolve(root, 'deploy/workerd.capnp'),
  '--experimental',
  `--directory-path=assets-disk=${resolve(root, 'dist/client')}`,
  `--directory-path=do-storage=${doDir}`,
  ...userArgs.filter((a) => a !== '--aws'),
]
console.log('Co-farer on workerd → http://localhost:8080   (Sign in → Cognito; test users: http://localhost:8080/api/auth/stub-login)')
const child = spawn(bin, args, { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
