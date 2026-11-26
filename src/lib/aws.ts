/**
 * AWS access shared by the self-hosted server (docs/MIGRATION.md, Phase 2):
 * SigV4 signing with aws4fetch (it runs in workerd), credentials, and
 * Parameter Store reads.
 *
 * Credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
 * when set (local development, from the developer's own profile via
 * `npm run workerd -- --aws`); otherwise the EC2 instance role through
 * IMDSv2, reached only through the `IMDS` service binding
 * (deploy/workerd.capnp). No AWS keys live in the code or the repo.
 */

import { AwsClient } from 'aws4fetch'

export interface AwsEnv {
  /** The project's one Region (default us-east-2). */
  AWS_REGION?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_SESSION_TOKEN?: string
  /** Service binding to 169.254.169.254:80 (the instance metadata service), on the server only. */
  IMDS?: Fetcher
}

export const DEFAULT_REGION = 'us-east-2'


export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  /** Epoch ms; absent for long-lived local keys. */
  expiresAt?: number
}

let cachedRoleCreds: AwsCredentials | null = null
/** Refresh instance-role credentials this long before they expire. */
const CREDS_MARGIN_MS = 5 * 60_000

export async function awsClient(env: AwsEnv, service: 'bedrock' | 'ssm'): Promise<AwsClient | null> {
  const creds = await awsCredentials(env)
  if (!creds) return null
  return new AwsClient({ ...creds, service, region: env.AWS_REGION || DEFAULT_REGION, retries: 2 })
}

export async function awsCredentials(env: AwsEnv): Promise<AwsCredentials | null> {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN || undefined }
  }
  if (cachedRoleCreds?.expiresAt && cachedRoleCreds.expiresAt - CREDS_MARGIN_MS > Date.now()) return cachedRoleCreds
  if (!env.IMDS) {
    console.error('[aws] no AWS credentials: set the AWS_* variables locally, or the IMDS binding on the server')
    return null
  }
  cachedRoleCreds = await imdsCredentials(env.IMDS)
  return cachedRoleCreds
}

/** IMDSv2: a session token first, then the role name, then that role's credentials. */
async function imdsCredentials(imds: Fetcher): Promise<AwsCredentials | null> {
  const base = 'http://169.254.169.254/latest'
  // IMDS answers in milliseconds on EC2; anywhere else, fail fast instead of hanging.
  const signal = () => AbortSignal.timeout(2_000)
  const tokenRes = await imds.fetch(`${base}/api/token`, { method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }, signal: signal() })
  if (!tokenRes.ok) {
    console.error(`[aws] IMDS token answered HTTP ${tokenRes.status}`)
    return null
  }
  const headers = { 'X-aws-ec2-metadata-token': await tokenRes.text() }
  const roleRes = await imds.fetch(`${base}/meta-data/iam/security-credentials/`, { headers, signal: signal() })
  const role = roleRes.ok ? (await roleRes.text()).split('\n')[0].trim() : ''
  if (!role) {
    console.error('[aws] the instance has no IAM role')
    return null
  }
  const credsRes = await imds.fetch(`${base}/meta-data/iam/security-credentials/${encodeURIComponent(role)}`, { headers, signal: signal() })
  return credsRes.ok ? readImdsCredentials(await credsRes.json()) : null
}

/** Reads the instance metadata service's credentials document. */
export function readImdsCredentials(raw: unknown): AwsCredentials | null {
  const d = (raw ?? {}) as Record<string, unknown>
  if (d.Code !== undefined && d.Code !== 'Success') return null
  if (typeof d.AccessKeyId !== 'string' || typeof d.SecretAccessKey !== 'string' || typeof d.Token !== 'string') return null
  const expiresAt = typeof d.Expiration === 'string' ? Date.parse(d.Expiration) : NaN
  return {
    accessKeyId: d.AccessKeyId,
    secretAccessKey: d.SecretAccessKey,
    sessionToken: d.Token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + CREDS_MARGIN_MS * 2,
  }
}

/** SSM GetParameter (decrypted SecureString) over its JSON API. */
export async function getParameter(env: AwsEnv, name: string): Promise<string | null> {
  const aws = await awsClient(env, 'ssm')
  if (!aws) return null
  const region = env.AWS_REGION || DEFAULT_REGION
  const res = await aws.fetch(`https://ssm.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AmazonSSM.GetParameter' },
    body: JSON.stringify({ Name: name, WithDecryption: true }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.error(`[aws] Parameter Store answered HTTP ${res.status} for ${name}`)
    return null
  }
  return readParameterValue(await res.json())
}

export function readParameterValue(raw: unknown): string | null {
  const v = (raw as { Parameter?: { Value?: unknown } } | null)?.Parameter?.Value
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Test hook: forget cached instance-role credentials. */
export function resetAwsCache(): void {
  cachedRoleCreds = null
}
