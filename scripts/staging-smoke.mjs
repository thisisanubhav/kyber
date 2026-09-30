import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    website: { type: 'string' },
    app: { type: 'string' },
    api: { type: 'string' },
  },
})

const origins = {
  website: values.website || process.env.KYBER_WEBSITE_ORIGIN,
  app: values.app || process.env.KYBER_APP_ORIGIN,
  api: values.api || process.env.KYBER_API_ORIGIN,
}

for (const [name, origin] of Object.entries(origins)) {
  if (!origin || !origin.startsWith('https://')) {
    throw new Error(`${name} origin is required and must use HTTPS.`)
  }
}

const routes = [
  ...['/', '/industries/aviation', '/industries/other', '/team', '/careers', '/privacy', '/cookies', '/terms']
    .map((path) => ({ name: `website ${path}`, url: `${origins.website}${path}`, type: 'html' })),
  ...['/login', '/register', '/reset-password', '/verify-email']
    .map((path) => ({ name: `app ${path}`, url: `${origins.app}${path}`, type: 'html' })),
  { name: 'API liveness', url: `${origins.api}/health/live`, type: 'json', expectedStatus: 'ok' },
  { name: 'API readiness', url: `${origins.api}/health/ready`, type: 'json', expectedStatus: 'ready' },
]

const failures = []
for (const route of routes) {
  try {
    const response = await fetch(route.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'kyber-staging-smoke/1.0' },
    })
    if (response.status !== 200) throw new Error(`returned HTTP ${response.status}`)
    if (response.headers.get('x-content-type-options') !== 'nosniff') {
      throw new Error('is missing X-Content-Type-Options: nosniff')
    }
    if (route.type === 'html') {
      if (!response.headers.get('content-security-policy')) throw new Error('is missing Content-Security-Policy')
      const body = await response.text()
      if (!/<html/i.test(body) || !/Kyber/i.test(body)) throw new Error('did not return the Kyber application shell')
    } else {
      const body = await response.json()
      if (body.status !== route.expectedStatus) throw new Error(`reported status ${String(body.status)}`)
    }
    console.log(`PASS ${route.name}`)
  } catch (error) {
    failures.push(`${route.name}: ${error.message}`)
  }
}

if (failures.length) {
  console.error(`Staging smoke failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Staging smoke passed for ${routes.length} non-mutating checks.`)
}
