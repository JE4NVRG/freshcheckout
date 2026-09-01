# Real Solari provider-drift failure

This directory preserves the sanitized receipt from one explicitly approved live FreshCheckout run against the canonical public repository.

## Identity

- Run ID: `7e293cb1-a7a3-4c72-8f0c-60c6ee14e0fd`
- Repository: `https://github.com/JE4NVRG/freshcheckout`
- Branch: `main`
- Commit: `de47fed3f8a79c8abf097f623e05d14eb680f861`
- Verdict: `failed`
- Cleanup: `passed`

## What failed

Source resolution succeeded and pinned the expected 40-character commit. Sandbox creation then failed because the integration requested Solari template `code`, which is now a Desktop template rather than a headless Sandbox template.

The provider rejected the type mismatch before a remote resource was created. FreshCheckout generated a bounded failure receipt, skipped dependent stages, and recorded cleanup as passed with `No remote resource was created.`

## Remediation

The adapter now uses Solari's documented headless `base` template. A regression test asserts that the Sandbox integration cannot drift back to the Desktop-only `code` template.

This failure is useful product evidence: FreshCheckout did not convert an infrastructure incompatibility into a false success. It stopped at the exact stage, preserved the reason, and closed the lifecycle honestly.

## Artifact

- [`receipt.json`](./receipt.json)

No browser screenshot or replay exists because the run failed before Sandbox allocation and Browser verification.

This receipt records one provider-backed attempt at one immutable commit. It is not a security audit, endorsement, production-readiness claim, or guarantee.
