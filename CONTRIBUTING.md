# Contributing to FreshCheckout

FreshCheckout is a focused pre-1.0 developer tool. Contributions should improve the declared clean-checkout path, evidence quality, safety boundary, or user clarity without turning the project into a general-purpose remote shell.

## Prerequisites

- Node.js `>=22.13.0`
- npm
- Chromium installed by Playwright for browser acceptance tests

No Solari credential is required for the default test suite.

## Local verification

```bash
cd apps/freshcheckout
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Expected baseline:

- 54 unit and contract tests passing;
- desktop and mobile Chromium acceptance flows passing;
- one intentional desktop skip for the mobile-only viewport assertion;
- no live Solari resource created.

## Pull-request expectations

- Keep the change bounded and explain the user or safety outcome.
- Add a regression test for behavior changes.
- Preserve honest `demo` versus `solari` labeling.
- Never commit API keys, tokens, browser profiles, replays, `.env` files, or private receipts.
- Do not weaken command allowlists, size limits, timeouts, redaction, rate limits, or cleanup behavior without explicit rationale and tests.
- Do not trigger a paid Solari run as part of CI.
- Update the README or product brief when a public contract changes.

## Security reports

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
