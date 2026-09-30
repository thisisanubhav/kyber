type Metric = { count: number; durationSeconds: number }

const startedAt = Date.now()
const requests = new Map<string, Metric>()

function escapeLabel(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMilliseconds: number) {
  const key = JSON.stringify([method, route, String(statusCode)])
  const metric = requests.get(key) ?? { count: 0, durationSeconds: 0 }
  metric.count += 1
  metric.durationSeconds += durationMilliseconds / 1000
  requests.set(key, metric)
}

export function renderMetrics() {
  const lines = [
    '# HELP kyber_process_uptime_seconds API process uptime in seconds.',
    '# TYPE kyber_process_uptime_seconds gauge',
    `kyber_process_uptime_seconds ${Math.max(0, (Date.now() - startedAt) / 1000)}`,
    '# HELP kyber_http_requests_total Completed HTTP requests.',
    '# TYPE kyber_http_requests_total counter',
    '# HELP kyber_http_request_duration_seconds_sum Total time spent serving HTTP requests.',
    '# TYPE kyber_http_request_duration_seconds_sum counter',
    '# HELP kyber_http_request_duration_seconds_count Completed requests included in the duration sum.',
    '# TYPE kyber_http_request_duration_seconds_count counter',
  ]
  for (const [key, metric] of requests) {
    const [method, route, statusCode] = JSON.parse(key) as string[]
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_code="${escapeLabel(statusCode)}"`
    lines.push(`kyber_http_requests_total{${labels}} ${metric.count}`)
    lines.push(`kyber_http_request_duration_seconds_sum{${labels}} ${metric.durationSeconds}`)
    lines.push(`kyber_http_request_duration_seconds_count{${labels}} ${metric.count}`)
  }
  return `${lines.join('\n')}\n`
}
