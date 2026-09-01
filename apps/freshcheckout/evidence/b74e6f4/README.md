# Canonical verified Solari run

This directory preserves the public artifacts from the current canonical FreshCheckout live run.

## Identity

- Run ID: `3f19c13f-cdeb-45dc-878b-b76cde7cf6d7`
- Repository: `https://github.com/JE4NVRG/freshcheckout`
- Branch: `main`
- Commit: `b74e6f479f4f3529fe512702d41c44b7f1ef8cba`
- Mode: `solari`
- Verdict: `verified`
- Stages passed: `11 / 11`

## Observed checkout

- Contract: `freshcheckout.config.json`
- Working directory: `apps/freshcheckout`
- Install: passed in a clean checkout
- Tests: passed
- Production build: passed
- Declared port `4317`: reachable through Solari preview
- Browser title: `FreshCheckout | Test the first run`
- Visible assertion: `Your CI tests the codebase`
- HTTP status: `200`
- Console errors: `0`
- Failed requests: `0`
- Sandbox cleanup: `passed`
- Cleanup summary: `Solari Sandbox destroyed.`

## Artifacts

- [`receipt.json`](./receipt.json): machine-readable sanitized execution receipt
- [`browser.png`](./browser.png): full-page screenshot captured by Solari Browser

A private replay was captured by the provider but is intentionally not committed or served publicly. The public receipt records only `replayCaptured: true`.

## Safety

- No repository secret was injected into the Sandbox.
- The one-time Solari API key remained in the local orchestrator, was never written to this repository, and was revoked after the run.
- Gitleaks found no secret in the receipt or screenshot artifact set.
- Active-resource read-back after the run reported zero Browser Sessions, zero Sandboxes, and zero total active instances.

This evidence covers one declared checkout path at one immutable commit. It is not a security audit, endorsement, production-readiness claim, or guarantee.
