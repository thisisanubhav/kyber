# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Send a private report
to `security@joinkyber.com` with the affected component, reproduction steps,
impact, and any suggested mitigation. Do not include real customer data.

The production owner must replace this placeholder process with a monitored
security inbox or a private vulnerability-reporting feature before launch and
publish acknowledgement and remediation targets.

## Supported versions

Until the first production release, only the current `main` branch is
supported. After launch, document supported release lines here and promptly
remove unsupported images from deployment environments.

## Automated controls

Changes to `main` are checked with tests, npm audit, Trivy filesystem and
container scans, and CodeQL. Repository vulnerability alerts remain enabled,
but automated dependency pull requests are disabled; upgrades are tested and
committed directly under the repository's direct-update policy. Release images
include SBOM and provenance metadata and are published with digest attestations.
