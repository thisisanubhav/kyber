import { performance } from 'node:perf_hooks'

const origin = process.env.LOAD_TEST_ORIGIN ?? 'http://127.0.0.1:4175'
const totalRequests = Number(process.env.LOAD_TEST_REQUESTS ?? 300)
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 15)
const maximumP95 = Number(process.env.LOAD_TEST_MAX_P95_MS ?? 500)
const maximumErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? 0.01)
const paths = ['/health/live', '/health/ready', '/v1/jobs']

if (!Number.isInteger(totalRequests) || totalRequests < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('LOAD_TEST_REQUESTS and LOAD_TEST_CONCURRENCY must be positive integers')
}

const durations = []
let failures = 0
let nextRequest = 0

async function worker() {
  while (true) {
    const index = nextRequest
    nextRequest += 1
    if (index >= totalRequests) return
    const started = performance.now()
    try {
      const response = await fetch(`${origin}${paths[index % paths.length]}`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) failures += 1
      await response.arrayBuffer()
    } catch {
      failures += 1
    } finally {
      durations.push(performance.now() - started)
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()))
durations.sort((left, right) => left - right)
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)]
const errorRate = failures / totalRequests
const result = {
  origin,
  requests: totalRequests,
  concurrency,
  failures,
  errorRate,
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number(durations.at(-1).toFixed(2)),
  },
  thresholds: { maximumP95, maximumErrorRate },
}
console.log(JSON.stringify(result, null, 2))

if (result.latencyMs.p95 > maximumP95 || errorRate > maximumErrorRate) process.exitCode = 1
