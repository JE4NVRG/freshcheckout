# FreshCheckout

> Your CI tests the codebase. FreshCheckout tests the first run.

Public demo: **https://freshcheckout.je4ndev.com**. The public service is intentionally demo-only and has no Solari API key.

FreshCheckout executes one repository-declared setup path at an immutable commit inside a clean [Solari](https://getsolari.com) Sandbox. It then opens the declared port in a recorded Solari Browser and creates a bounded checkout receipt.

It answers one question only:

> Can a new contributor run the declared path from a clean checkout right now?

It does **not** certify security, correctness, production readiness, or the whole repository.

## Why

CI often runs with warm caches, hidden environment variables, preinstalled tools, and team knowledge. A new contributor starts with none of that. FreshCheckout turns onboarding into an executable contract and observes it in clean infrastructure.

## Checkout contract

Live runs require `freshcheckout.config.json` at the repository root:

```json
{
  "version": 1,
  "workingDirectory": "apps/freshcheckout",
  "commands": {
    "install": { "executable": "npx", "args": ["--yes", "--package=node@22.22.0", "--package=npm@10.9.4", "npm", "ci"] },
    "test": { "executable": "npx", "args": ["--yes", "--package=node@22.22.0", "--package=npm@10.9.4", "npm", "test"] },
    "build": { "executable": "npx", "args": ["--yes", "--package=node@22.22.0", "--package=npm@10.9.4", "npm", "run", "build"] },
    "start": { "executable": "npx", "args": ["--yes", "--package=node@22.22.0", "node", "node_modules/tsx/dist/cli.mjs", "src/server/index.ts", "--host", "0.0.0.0", "--port", "4317"] }
  },
  "port": 4317,
  "assertion": { "text": "FreshCheckout tests the first run." }
}
```

Commands are executable-plus-argv. README instructions and shell strings are never interpreted.

## Flow

```text
GitHub URL
  -> resolve immutable SHA
  -> create clean Solari Sandbox
  -> shallow clone and verify HEAD
  -> validate + hash checkout contract
  -> install / test / build
  -> start declared port
  -> open Solari preview in recorded Browser
  -> require declared visible text
  -> save public screenshot + private rrweb replay
  -> generate receipt
  -> destroy Browser and Sandbox
```

## Run locally

The full local application, live orchestrator, lint, and browser gates require Node.js `>=22.13.0`.

```bash
cd apps/freshcheckout
npm install
npm run dev
```

Open `http://127.0.0.1:4318`. This is Vite's local UI port; the checkout contract intentionally exposes the isolated application on `4317`.

Without `SOLARI_API_KEY`, the UI offers a deterministic demo. Demo receipts repeatedly state that no Solari cloud execution occurred and are not valid verification evidence.

With a Solari key configured in the server environment, the Live option becomes available. Never expose the key in chat, source control, browser code, or sandbox environment variables.

The historical `e0f4dbc` evidence ran under the provider image's Node `18.20.4` with engine warnings. The canonical contract now pins Node `22.22.0` and npm `10.9.4` through direct `npx` argv inside Solari's headless `base` Sandbox. Its `preinstall` gate rejects unsupported runtimes and logs the observed version. FreshCheckout does not claim general Node 18 support.

## Gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Current verified local baseline:

- 62 unit/integration tests passing
- production build passing
- Playwright desktop and mobile flows passing
- no horizontal overflow at 390 px
- demo success and failure receipts exercised in a real browser

## Security boundaries

- Public `github.com` repositories only
- Exact commit resolved before execution
- Repository size cap
- Required validated checkout contract
- Relative working directory without traversal
- Bare executable plus bounded argv
- No host secrets inherited by the sandbox
- Bounded logs with secret-pattern redaction
- Fixed runtime and output budgets
- Artifact-name allowlist
- 5 MB screenshot and 25 MB replay limits
- Seven-day retention with bounded receipt and artifact counts
- No preview URL or browser session ID in public receipts
- Replay retained privately; only screenshots are publicly addressable
- Cleanup in `finally`

Repository files, logs, rendered pages, and browser output are untrusted data.

## Receipt semantics

- `verified`: the declared path passed at the recorded commit
- `partial`: a declared optional stage was skipped
- `failed`: an observed stage failed
- `demo`: deterministic interface preview, not cloud evidence

Every receipt carries the commit SHA, checkout-contract SHA-256, runtime-policy SHA-256, stages, logs, browser observation, origin hash, and cleanup state. It never publishes a raw preview URL or browser session ID.

## Evidence status

A real Solari Sandbox + Browser run completed with verdict `verified` against canonical `main` commit `b74e6f479f4f3529fe512702d41c44b7f1ef8cba` on 2026-09-01. All 11 declared stages passed, the Browser returned HTTP 200 and observed the declared text with zero console or request failures, screenshot and private replay capture succeeded, the Sandbox was destroyed, and console read-back reported zero active resources.

See [`evidence/b74e6f4`](./evidence/b74e6f4) for the current bounded receipt and screenshot. The real provider-drift failure that led to the template fix remains preserved under [`evidence/de47fed-provider-drift`](./evidence/de47fed-provider-drift). The verified claim remains limited to one checkout contract at one immutable commit.

See [PRODUCT.md](./PRODUCT.md) for scope and acceptance criteria.
