# Repository protection settings

Apply these settings to `main` immediately after creating the remote repository:

- require a pull request and at least one approval;
- dismiss stale approvals when new commits are pushed;
- require conversation resolution;
- require the `Kyber CI / test` and `CodeQL / JavaScript and TypeScript analysis` checks;
- require branches to be current before merging;
- block force pushes and deletion;
- prevent bypass by administrators and automation unless explicitly reviewed;
- enable private vulnerability reporting, secret scanning, push protection, and Dependabot alerts.

Create protected `staging` and `release` environments. Restrict `release` to
`main`, require a reviewer, prevent self-review, and store registry credentials
only as environment secrets. Never use a personal registry password when a
short-lived or narrowly scoped automation credential is available.
