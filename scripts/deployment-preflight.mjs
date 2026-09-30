import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const requiredKeys = [
  'NODE_ENV',
  'KYBER_BACKEND_IMAGE',
  'KYBER_WEBSITE_IMAGE',
  'KYBER_APP_IMAGE',
  'METRICS_TOKEN',
  'DATABASE_URL',
  'DATABASE_SSL',
  'REDIS_URL',
  'STORAGE_DRIVER',
  'MINIO_ENDPOINT',
  'MINIO_PUBLIC_ENDPOINT',
  'S3_SECURE',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'CLAMAV_ENABLED',
  'CLAMAV_HOST',
  'SMTP_HOST',
  'SMTP_REQUIRE_TLS',
  'MAIL_FROM_AUTH',
  'MAIL_FROM_CAREERS',
  'REQUIRE_EMAIL_VERIFICATION',
  'APP_ORIGIN',
  'WEBSITE_ORIGIN',
  'API_ORIGIN',
  'TOKEN_PEPPER',
  'TRUSTED_PROXIES',
  'RUN_MIGRATIONS_ON_START',
]

const imageKeys = ['KYBER_BACKEND_IMAGE', 'KYBER_WEBSITE_IMAGE', 'KYBER_APP_IMAGE']
const originKeys = ['APP_ORIGIN', 'WEBSITE_ORIGIN', 'API_ORIGIN']
const placeholderPattern = /(?:replace(?:-with|-me)?|changeme|change-me|example(?:[./:]|$)|your[-_])/i
const imageDigestPattern = /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/

export function parseEnv(source) {
  const environment = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) throw new Error('Environment file contains a malformed line.')
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    environment[key] = value
  }
  return environment
}

export function validateDeploymentConfig(environment) {
  const errors = []
  const add = (key, message) => errors.push(`${key}: ${message}`)

  for (const key of requiredKeys) {
    if (!environment[key]) add(key, 'is required')
  }

  for (const [key, value] of Object.entries(environment)) {
    if (value && placeholderPattern.test(value)) add(key, 'contains a placeholder value')
  }

  if (environment.NODE_ENV !== 'production') add('NODE_ENV', 'must be production')

  for (const key of imageKeys) {
    if (environment[key] && !imageDigestPattern.test(environment[key])) {
      add(key, 'must be a fully qualified image pinned by sha256 digest')
    }
  }

  for (const key of originKeys) {
    if (!environment[key]) continue
    try {
      const url = new URL(environment[key])
      if (url.protocol !== 'https:' || url.origin !== environment[key]) {
        add(key, 'must be an HTTPS origin without a path, query, or fragment')
      }
    } catch {
      add(key, 'must be a valid HTTPS origin')
    }
  }

  if (environment.DATABASE_URL && !/^postgres(?:ql)?:\/\//.test(environment.DATABASE_URL)) {
    add('DATABASE_URL', 'must be a PostgreSQL URL')
  }
  if (environment.REDIS_URL && !environment.REDIS_URL.startsWith('rediss://')) {
    add('REDIS_URL', 'must use TLS with rediss://')
  }

  const requiredTrue = ['DATABASE_SSL', 'S3_SECURE', 'CLAMAV_ENABLED', 'SMTP_REQUIRE_TLS', 'REQUIRE_EMAIL_VERIFICATION']
  for (const key of requiredTrue) {
    if (environment[key] !== 'true') add(key, 'must be true')
  }
  if (environment.STORAGE_DRIVER !== 's3') add('STORAGE_DRIVER', 'must be s3')
  if (environment.RUN_MIGRATIONS_ON_START !== 'false') add('RUN_MIGRATIONS_ON_START', 'must be false')
  if (environment.COOKIE_DOMAIN) add('COOKIE_DOMAIN', 'must remain unset for host-only cookies')

  for (const key of ['TOKEN_PEPPER', 'METRICS_TOKEN']) {
    if (environment[key] && environment[key].length < 32) add(key, 'must contain at least 32 characters')
  }
  if (environment.TOKEN_PEPPER && environment.TOKEN_PEPPER === environment.METRICS_TOKEN) {
    add('METRICS_TOKEN', 'must be distinct from TOKEN_PEPPER')
  }
  if (environment.MINIO_SECRET_KEY && environment.MINIO_SECRET_KEY.length < 24) {
    add('MINIO_SECRET_KEY', 'must contain at least 24 characters')
  }

  if (environment.TRUSTED_PROXIES) {
    const proxies = environment.TRUSTED_PROXIES.split(',').map((value) => value.trim())
    if (proxies.some((value) => ['*', '0.0.0.0/0', '::/0'].includes(value))) {
      add('TRUSTED_PROXIES', 'must not trust every network')
    }
  }

  const internalHosts = ['MINIO_ENDPOINT', 'CLAMAV_HOST', 'SMTP_HOST']
  for (const key of internalHosts) {
    if (['localhost', '127.0.0.1', '::1'].includes(environment[key])) add(key, 'must not use loopback')
  }

  return errors
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npm run deploy:preflight -- /absolute/path/to/staging.env')
    process.exitCode = 2
    return
  }

  const [contents, metadata] = await Promise.all([readFile(file, 'utf8'), stat(file)])
  const errors = validateDeploymentConfig(parseEnv(contents))
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    errors.push('ENV_FILE: must not be readable or writable by group or other users (use mode 0600)')
  }

  if (errors.length) {
    console.error(`Deployment preflight failed with ${errors.length} issue(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log('Deployment preflight passed. No secret values were printed.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Deployment preflight could not run: ${error.message}`)
    process.exitCode = 1
  })
}
