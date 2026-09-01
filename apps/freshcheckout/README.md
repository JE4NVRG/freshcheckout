# FreshCheckout

> Your CI tests the codebase. FreshCheckout tests the first run.

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

```bash
cd apps/freshcheckout
npm install
npm run dev
```

Open `http://127.0.0.1:4318`.

Without `SOLARI_API_KEY`, the UI offers a deterministic demo. Demo receipts repeatedly state that no Solari cloud execution occurred and are not valid verification evidence.

With a Solari key configured in the server environment, the Live option becomes available. Never expose the key in chat, source control, browser code, or sandbox environment variables.

## Gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Current verified local baseline:

- 51 unit/integration tests passing
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

The real Solari adapter and state machine are implemented and covered with injected-provider tests. A public claim of live execution remains blocked until a real Solari Sandbox + Browser run is captured, read back, and its cleanup is verified.

See [PRODUCT.md](./PRODUCT.md) for scope and acceptance criteria.
