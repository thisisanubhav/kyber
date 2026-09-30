# Production release checklist

## Ownership and policy

- [ ] Product confirms invite-only registration and owns the access-request path.
- [ ] Recruiting confirms whether the optional one-minute video remains optional.
- [ ] Legal approves Privacy, Cookie Policy, and Terms content.
- [ ] Security reporting uses a monitored private channel instead of the placeholder in `SECURITY.md`.
- [ ] An incident commander, rollback owner, and customer-communications owner are named.

## Infrastructure

- [ ] Production domains, TLS, DNS, registry, runtime, database, Redis, SMTP, object storage, ClamAV, and secret manager are provisioned.
- [ ] Database point-in-time recovery, object versioning, retention, encryption, and isolated restore drills are enabled.
- [ ] Least-privilege service identities, network boundaries, egress rules, and credential rotation are reviewed.
- [ ] Metrics are private; dashboards, paging routes, and alert thresholds are tested.
- [ ] Capacity and failure tests cover API replicas, worker concurrency, database limits, queue backlog, and storage failures.

## Release candidate

- [ ] CI and CodeQL pass on the exact release commit.
- [ ] Dependabot and scanner findings have no unaccepted high or critical risk.
- [ ] Unit, build, integration, load smoke, and backup/restore gates pass.
- [ ] The manual image workflow publishes a non-`latest` tag and records all three image digests.
- [ ] SBOMs, provenance, and attestations can be verified from the deployment environment.
- [ ] Staging uses the exact image digests proposed for production.

## Staging acceptance

- [ ] Desktop and 390 px mobile regression paths pass with keyboard and screen-reader spot checks.
- [ ] A staging-only chat, booking, registration, recovery, upload, scan, and application journey is completed safely.
- [ ] Email delivery, bounce handling, malware rejection, rate limiting, token expiry, and session revocation are exercised.
- [ ] Direct links, refresh, Back, cookie preferences, mailto, Trust Center, and external links are verified.
- [ ] Logs contain no passwords, tokens, cookies, private uploads, or unnecessary personal data.
- [ ] Rollback and database-compatibility procedures are rehearsed.

## Promotion and observation

- [ ] Run migrations as a one-off job before rolling application replicas.
- [ ] Deploy only digest-pinned images and record the release manifest and approver.
- [ ] Verify readiness, synthetic login/recovery, queues, outbox, email, and upload scanning.
- [ ] Observe error rate, latency, saturation, delivery failures, and support channels through the agreed soak window.
- [ ] Record final go/no-go and rollback decisions in the release log.
