# Security

Automated checks and defensive review reduce risk; they do not certify an installation
as secure or production-ready. The default preview does not authenticate users, send
messages or take payment.

## Reporting a concern

Use **Security → Report a vulnerability** in this repository when private reporting is
available. Include the affected revision, relevant files, expected boundary, observed
behavior and a minimal description using synthetic data. Do not test accounts or
infrastructure that you do not own or have permission to assess.

Do not post credentials, personal records or sensitive proof in a public issue. If
private reporting is unavailable, open a general issue asking for a private reporting
channel without disclosing the sensitive details. No response-time guarantee is made.

## Credentials and installations

- Supply your own provider accounts and server-side secrets through ignored local
  environment files or a host secret store. Never place secrets in `NEXT_PUBLIC_*`.
- Examples and CI database credentials are deliberately synthetic. Do not reuse them
  for a real installation or expose the disposable fixture database to a network.
- If a real credential is disclosed, revoke/rotate it at its provider. Removing the
  current file does not remove a credential from Git history or prior copies.
- Review the [provider setup](docs/provider-setup.md), [operations](docs/operations.md)
  and [release](docs/release.md) guidance before activating integrations.
- Use the latest reviewed revision. Dependency alerts and scanner results require
  triage; a passing scan does not establish that every vulnerability is absent.

## Repository checks

CI uses read-only repository permissions, pinned actions, disposable PostgreSQL,
synthetic identities and no provider secrets. It checks logic, real database and HTTP
boundaries, browser journeys, dependency advisories and the public Git history with
Gitleaks. Review the exact revision's Actions result rather than assuming a workflow
file means the checks passed. Deployment is intentionally not automatic.
