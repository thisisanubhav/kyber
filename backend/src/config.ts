import { z } from 'zod'

const booleanValue = z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
const optionalSecret = z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional())
const localPepper = 'kyber-local-development-pepper-change-before-deploy'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4175),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  METRICS_TOKEN: optionalSecret,
  DATABASE_URL: z.string().min(1).default('postgres://kyber:kyber_local_only@localhost:54329/kyber'),
  DATABASE_SSL: booleanValue,
  REDIS_URL: z.string().min(1).default('redis://localhost:6389'),
  MINIO_ENDPOINT: z.string().min(1).default('localhost'),
  MINIO_PUBLIC_ENDPOINT: z.string().min(1).default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_PUBLIC_PORT: z.coerce.number().int().positive().default(9000),
  S3_SECURE: booleanValue,
  MINIO_ACCESS_KEY: z.string().min(3).default('kyber_local'),
  MINIO_SECRET_KEY: z.string().min(8).default('kyber_local_secret'),
  MINIO_BUCKET: z.string().min(3).default('kyber-private'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().min(1).default('.data/uploads'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: booleanValue,
  SMTP_REQUIRE_TLS: booleanValue,
  REQUIRE_EMAIL_VERIFICATION: booleanValue,
  MAIL_FROM_AUTH: z.string().min(3).default('Kyber Local <no-reply@joinkyber.local>'),
  MAIL_FROM_CAREERS: z.string().min(3).default('Kyber Careers <careers@joinkyber.local>'),
  APP_ORIGIN: z.string().url().default('http://localhost:4174'),
  WEBSITE_ORIGIN: z.string().url().default('http://localhost:4173'),
  API_ORIGIN: z.string().url().default('http://localhost:4175'),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  TOKEN_PEPPER: z.string().min(24).default(localPepper),
  KYBER_SEED_REGISTRATION_CODE: z.string().min(8).default('KYBER-LOCAL-2026'),
  CLAMAV_HOST: z.string().min(1).default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_ENABLED: booleanValue,
  TRUSTED_PROXIES: z.string().default('').transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  RUN_MIGRATIONS_ON_START: z.enum(['true', 'false']).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return
  const reject = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message })
  if (value.TOKEN_PEPPER === localPepper || value.TOKEN_PEPPER.length < 32) reject('TOKEN_PEPPER', 'Production requires a unique secret of at least 32 characters.')
  if (value.STORAGE_DRIVER !== 's3') reject('STORAGE_DRIVER', 'Production requires private S3-compatible storage.')
  if (!value.CLAMAV_ENABLED) reject('CLAMAV_ENABLED', 'Production requires malware scanning.')
  if (value.MINIO_ACCESS_KEY === 'kyber_local' || value.MINIO_SECRET_KEY === 'kyber_local_secret') reject('MINIO_SECRET_KEY', 'Production storage credentials must not use local defaults.')
  if (value.DATABASE_URL.includes('kyber_local_only')) reject('DATABASE_URL', 'Production database credentials must not use local defaults.')
  if (!value.DATABASE_SSL) reject('DATABASE_SSL', 'Production database connections must verify TLS.')
  if (value.REDIS_URL.startsWith('redis://')) reject('REDIS_URL', 'Production Redis connections must use TLS (rediss://).')
  if (!value.S3_SECURE) reject('S3_SECURE', 'Production object-storage connections must use HTTPS.')
  if (['localhost', '127.0.0.1'].includes(value.MINIO_ENDPOINT)) reject('MINIO_ENDPOINT', 'Production object storage must not use a loopback endpoint.')
  if (!value.SMTP_REQUIRE_TLS) reject('SMTP_REQUIRE_TLS', 'Production SMTP connections must require TLS.')
  if (!value.REQUIRE_EMAIL_VERIFICATION) reject('REQUIRE_EMAIL_VERIFICATION', 'Production registration requires email ownership verification.')
  if (['localhost', '127.0.0.1'].includes(value.SMTP_HOST)) reject('SMTP_HOST', 'Production SMTP must not use a loopback endpoint.')
  if (!value.APP_ORIGIN.startsWith('https://') || !value.WEBSITE_ORIGIN.startsWith('https://') || !value.API_ORIGIN.startsWith('https://')) reject('API_ORIGIN', 'Production origins must use HTTPS.')
  if (value.MAIL_FROM_AUTH.includes('.local') || value.MAIL_FROM_CAREERS.includes('.local')) reject('MAIL_FROM_AUTH', 'Production sender addresses must use a deliverable domain.')
  if (value.COOKIE_DOMAIN) reject('COOKIE_DOMAIN', 'Production uses a host-only __Host- session cookie; COOKIE_DOMAIN must be unset.')
  if (value.RUN_MIGRATIONS_ON_START === 'true') reject('RUN_MIGRATIONS_ON_START', 'Run production migrations as a separate deployment step.')
  if (!value.METRICS_TOKEN) reject('METRICS_TOKEN', 'Production metrics require a dedicated bearer token.')
})

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(environment)
  return {
    ...parsed,
    RUN_MIGRATIONS_ON_START: parsed.RUN_MIGRATIONS_ON_START
      ? parsed.RUN_MIGRATIONS_ON_START === 'true'
      : parsed.NODE_ENV !== 'production',
  }
}

export const config = loadConfig()
export const isProduction = config.NODE_ENV === 'production'
