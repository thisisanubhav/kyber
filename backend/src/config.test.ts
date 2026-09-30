import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('production configuration guardrails', () => {
  it('rejects development defaults in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow()
  })

  it('accepts an explicit encrypted production configuration and disables startup migrations', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      METRICS_TOKEN: 'a-separate-production-metrics-token',
      DATABASE_URL: 'postgres://kyber:unique-password@database.internal/kyber',
      DATABASE_SSL: 'true',
      REDIS_URL: 'rediss://redis.internal:6380',
      STORAGE_DRIVER: 's3',
      S3_SECURE: 'true',
      MINIO_ENDPOINT: 'storage.internal',
      MINIO_PUBLIC_ENDPOINT: 'uploads.example.com',
      MINIO_ACCESS_KEY: 'production-access',
      MINIO_SECRET_KEY: 'production-secret-value',
      CLAMAV_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.com',
      SMTP_REQUIRE_TLS: 'true',
      REQUIRE_EMAIL_VERIFICATION: 'true',
      MAIL_FROM_AUTH: 'Kyber <no-reply@example.com>',
      MAIL_FROM_CAREERS: 'Kyber Careers <careers@example.com>',
      APP_ORIGIN: 'https://app.example.com',
      WEBSITE_ORIGIN: 'https://www.example.com',
      API_ORIGIN: 'https://api.example.com',
      TOKEN_PEPPER: 'a-unique-production-token-pepper-with-entropy',
    })

    expect(config.NODE_ENV).toBe('production')
    expect(config.RUN_MIGRATIONS_ON_START).toBe(false)
    expect(config.TRUSTED_PROXIES).toEqual([])
  })
})
