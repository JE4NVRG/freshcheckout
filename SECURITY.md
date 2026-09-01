# Security policy

## Supported version

FreshCheckout is currently pre-1.0. Security fixes target the latest commit on the default branch.

## Report a vulnerability

Please use GitHub's private vulnerability reporting flow:

https://github.com/JE4NVRG/freshcheckout/security/advisories/new

Do not publish secrets, exploit payloads, private replay data, tokens, or third-party credentials in a public issue.

Include only the information needed to reproduce the problem safely:

- affected commit or receipt ID;
- affected component;
- impact and preconditions;
- minimal reproduction steps;
- suggested mitigation, if known.

No response-time SLA is promised for this pre-1.0 project, but security reports are prioritized over feature requests.

## Public-demo boundary

The deployment at `freshcheckout.je4ndev.com` is intentionally demo-only:

- `SOLARI_API_KEY` is unset explicitly;
- public visitors cannot start billable Solari runs;
- demo receipts are clearly labeled as simulated;
- the linked verified receipt is a sanitized artifact from a completed live run;
- the private browser replay is never published.

## Execution boundary

Repository code is treated as untrusted input. FreshCheckout uses declared executable-plus-argument arrays, bounded output, timeouts, artifact limits, secret redaction, isolated Solari infrastructure, and cleanup in a fail-closed lifecycle.

This reduces risk but is not a security certification or guarantee that a repository is safe.
