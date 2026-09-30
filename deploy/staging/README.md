# Staging deployment

This definition runs the Kyber API and worker from the same immutable backend
image while keeping PostgreSQL, Redis, object storage, malware scanning, SMTP,
TLS, and backups outside the application containers.

## Release order

1. Build and scan `backend/Dockerfile`, `website/Dockerfile`, and
   `app/Dockerfile`; push them to a private registry and set all three image
   variables to immutable digests rather than mutable tags. Build both frontend
   images with `VITE_API_URL=https://api-staging.joinkyber.com`.
2. Copy `.env.example` to `.env` in the deployment environment and source every
   secret from the platform's secret manager. Do not commit `.env`.
   Materialize it with mode `0600`, then run the secret-safe preflight before
   Docker Compose reads it:

   ```bash
   chmod 600 .env
   npm run deploy:preflight -- "$PWD/.env"
   ```
3. Run the migration as a one-off release job:

   ```bash
   docker compose --profile release run --rm migrate
   ```

4. Start or roll the API, wait for `/health/ready`, then start the worker and
   frontend containers:

   ```bash
   docker compose up -d api
   docker compose up -d worker website app
   ```

5. Put ports 4173, 4174, and 4175 behind the corresponding HTTPS hostnames on
   the private reverse proxy or load balancer.
6. Run `npm run test:integration --workspace backend` against staging using
   staging-only registration and email inbox credentials.
7. Run the non-mutating public-route check from a network outside the cluster:

   ```bash
   npm run staging:smoke -- \
     --website https://staging.joinkyber.com \
     --app https://app-staging.joinkyber.com \
     --api https://api-staging.joinkyber.com
   ```

   The equivalent manually dispatched GitHub workflow uses the protected
   `staging` environment. It does not submit forms or mutate staging data.

## Required platform controls

- Terminate TLS at a load balancer that overwrites forwarded headers. Set
  `TRUSTED_PROXIES` to only that private network or exact proxy addresses.
- Keep the API metrics route private. Scrape it with
  `Authorization: Bearer $METRICS_TOKEN`.
- Enable PostgreSQL point-in-time recovery and daily snapshots, Redis
  persistence appropriate to queue durability, and object versioning with a
  lifecycle policy on the private bucket.
- Alert on readiness failures, API 5xx rate, latency, failed BullMQ jobs,
  outbox rows that remain unpublished, application scans in `failed`, storage
  capacity, database connections, and backup failures.
- Test restoration into an isolated environment before approving production.

Starter Prometheus alert rules are provided at
`deploy/observability/alerts.yml`. Tune their thresholds from staging evidence
before promoting them unchanged to production.

## Local release gates

Before building a release candidate:

```bash
npm test
npm run build
npm run test:integration
npm run load:smoke
npm run backup:verify
npm run sbom --silent > kyber-sbom.spdx.json
npm run release:manifest --silent > release-manifest.json
```

The restore script creates an isolated temporary database, restores a custom
PostgreSQL dump, compares schema and user counts, checks the outbox table, and
removes the temporary database and dump on exit.

The compose file intentionally does not bundle production databases, Redis,
SMTP, S3, or ClamAV. Their endpoints and operational guarantees are deployment
decisions, not application-container concerns.

Use the repository-level [`release checklist`](../RELEASE_CHECKLIST.md) for
approval, staging acceptance, promotion, observation, and rollback gates.
