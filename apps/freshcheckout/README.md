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
    "install": { "executable": "npm", "args": ["ci"] },
    "test": { "executable": "npm", "args": ["test"] },
    "build": { "executable": "npm", "args": ["run", "build"] },
    "start": { "executable": "node", "args": ["node_modules/tsx/dist/cli.mjs", "src/server/index.ts", "--host", "0.0.0.0", "--port", "4317"] }
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

Open `http://127.0.0.1:4318`.

Without `SOLARI_API_KEY`, the UI offers a deterministic demo. Demo receipts repeatedly state that no Solari cloud execution occurred and are not valid verification evidence.

With a Solari key configured in the server environment, the Live option becomes available. Never expose the key in chat, source control, browser code, or sandbox environment variables.

The verified checkout evidence used the Solari `code` template's Node `18.20.4` only for the bounded, keyless `npm ci` / test / build / start contract inside the Sandbox. That observed path is not a claim of general Node 18 support for the live orchestrator or developer toolchain.

## Gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Current verified local baseline:

- 55 unit/integration tests passing
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

A real Solari Sandbox + Browser run completed with verdict `verified` against commit `e0f4dbce78ec2d0db4a683d3a647f41e1ff0b1e4` on 2026-09-01. All declared stages passed, the Browser returned HTTP 200 and observed the declared text with zero console or request failures, screenshot and private replay capture succeeded, and cleanup read-back reported zero active Sandboxes.

See [`evidence/e0f4dbc`](./evidence/e0f4dbc) for the bounded receipt and screenshot. The claim remains limited to one checkout contract at that immutable commit.

See [PRODUCT.md](./PRODUCT.md) for scope and acceptance criteria.
