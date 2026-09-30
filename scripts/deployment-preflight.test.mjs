import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEnv, validateDeploymentConfig } from './deployment-preflight.mjs'

const validEnvironment = {
  NODE_ENV: 'production',
  KYBER_BACKEND_IMAGE: `registry.acme.test/kyber/backend@sha256:${'a'.repeat(64)}`,
  KYBER_WEBSITE_IMAGE: `registry.acme.test/kyber/website@sha256:${'b'.repeat(64)}`,
  KYBER_APP_IMAGE: `registry.acme.test/kyber/app@sha256:${'c'.repeat(64)}`,
  METRICS_TOKEN: 'metrics-token-that-is-long-and-unique-2026',
  DATABASE_URL: 'postgres://kyber:secret@database.internal:5432/kyber',
  DATABASE_SSL: 'true',
  REDIS_URL: 'rediss://default:secret@redis.internal:6380/0',
  STORAGE_DRIVER: 's3',
  MINIO_ENDPOINT: 'storage.internal',
  MINIO_PUBLIC_ENDPOINT: 'uploads-staging.acme.test',
  S3_SECURE: 'true',
  MINIO_ACCESS_KEY: 'staging-access-key',
  MINIO_SECRET_KEY: 'storage-secret-with-adequate-length',
  MINIO_BUCKET: 'kyber-staging-private',
  CLAMAV_ENABLED: 'true',
  CLAMAV_HOST: 'clamav.internal',
  SMTP_HOST: 'smtp.acme.test',
  SMTP_REQUIRE_TLS: 'true',
  MAIL_FROM_AUTH: 'Kyber <no-reply@staging.acme.test>',
  MAIL_FROM_CAREERS: 'Kyber Careers <careers@staging.acme.test>',
  REQUIRE_EMAIL_VERIFICATION: 'true',
  APP_ORIGIN: 'https://app-staging.acme.test',
  WEBSITE_ORIGIN: 'https://staging.acme.test',
  API_ORIGIN: 'https://api-staging.acme.test',
  TOKEN_PEPPER: 'token-pepper-that-is-long-and-unique-2026',
  TRUSTED_PROXIES: '10.20.0.0/16',
  RUN_MIGRATIONS_ON_START: 'false',
}

test('accepts a digest-pinned, TLS-only production configuration', () => {
  assert.deepEqual(validateDeploymentConfig(validEnvironment), [])
})

test('rejects mutable images, placeholders, shared secrets, and unsafe proxies', () => {
  const errors = validateDeploymentConfig({
    ...validEnvironment,
    KYBER_BACKEND_IMAGE: 'registry.example/kyber/backend:latest',
    METRICS_TOKEN: validEnvironment.TOKEN_PEPPER,
    TRUSTED_PROXIES: '0.0.0.0/0',
  })
  assert.ok(errors.some((error) => error.startsWith('KYBER_BACKEND_IMAGE: contains a placeholder')))
  assert.ok(errors.some((error) => error.startsWith('KYBER_BACKEND_IMAGE: must be a fully qualified image')))
  assert.ok(errors.some((error) => error.startsWith('METRICS_TOKEN: must be distinct')))
  assert.ok(errors.some((error) => error.startsWith('TRUSTED_PROXIES: must not trust every network')))
})

test('parses quoted values without exposing or transforming their contents', () => {
  assert.deepEqual(parseEnv('A=plain\nB="two words"\n# comment\nC=three=four\n'), {
    A: 'plain',
    B: 'two words',
    C: 'three=four',
  })
})
