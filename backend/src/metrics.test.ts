import { describe, expect, it } from 'vitest'
import { recordHttpRequest, renderMetrics } from './metrics.js'

describe('metrics', () => {
  it('exports bounded route labels and aggregate request timing', () => {
    recordHttpRequest('GET', '/health/ready', 200, 25)
    recordHttpRequest('GET', '/health/ready', 200, 75)

    const output = renderMetrics()
    expect(output).toContain('kyber_http_requests_total{method="GET",route="/health/ready",status_code="200"} 2')
    expect(output).toContain('kyber_http_request_duration_seconds_count{method="GET",route="/health/ready",status_code="200"} 2')
    expect(output).not.toContain('token=')
  })
})
