# FreshCheckout product brief

Status: implementation brief, 2026-08-31

## Product truth

- **User:** an OSS maintainer, SDK author, template seller, engineering lead, or buyer whose repository works for insiders but may fail for a newcomer.
- **Job:** prove that one declared onboarding path works from an immutable commit in a clean machine with no local cache, credentials, or undocumented state.
- **Boundary:** FreshCheckout verifies one checkout contract and one browser assertion. It does not certify the repository, security, correctness, or production readiness.
- **Why Solari:** a clean Sandbox supplies the disposable machine; its preview exposes the built app; a recorded Solari Browser observes the first rendered result.

## One-line narrative

Your CI tests the codebase. FreshCheckout tests whether a stranger can start from zero.

## Checkout contract

A live run requires `freshcheckout.config.json` at the repository root:

```json
{
  "version": 1,
  "workingDirectory": "apps/web",
  "commands": {
    "install": { "executable": "npm", "args": ["ci"] },
    "test": { "executable": "npm", "args": ["test"] },
    "build": { "executable": "npm", "args": ["run", "build"] },
    "start": { "executable": "npm", "args": ["start"] }
  },
  "port": 3000,
  "assertion": { "text": "Welcome" }
}
```

The contract is data, not shell. Executables and argv are validated separately. Absolute paths, traversal, control characters, shell operators, credentials, environment inheritance, and commands copied from README prose are rejected.

## Live flow

1. Accept a public `https://github.com/<owner>/<repo>` URL.
2. Resolve the default branch and exact 40-character commit SHA through GitHub.
3. Reject repositories above the published size cap.
4. Create a Solari Sandbox without repository or orchestrator secrets.
5. Shallow-clone the branch and verify or explicitly fetch the resolved SHA.
6. Read and validate `freshcheckout.config.json` from the pinned checkout.
7. Execute the declared install, optional test, build, and start argv in the declared working directory.
8. Expose only the declared port through `previewUrl()`.
9. Open the preview in a recorded Solari Browser.
10. Require the declared visible text, enforce the preview origin, and capture title, HTTP status, console errors, failed requests, screenshot, origin hash, and private replay when available.
11. Generate a scoped checkout receipt with commit, contract hash, stage output, timings, artifacts, and cleanup result.
12. Destroy browser and sandbox resources in `finally`.

## Receipt claim

A successful receipt means only:

> At this commit, FreshCheckout observed the declared commands exit successfully in a clean Solari Sandbox and observed the declared text in a Solari Browser.

It does not mean secure, bug-free, generally verified, deployable, endorsed, or production-ready.

## Demo mode

When no Solari key is configured, deterministic passing and failing fixtures exercise the same receipt UI. Every demo field must say that no cloud resource, package command, build, or browser session occurred. Demo output is never valid execution evidence.

## Non-goals

- Any-repository zero-config claims.
- Private repositories or GitHub credentials.
- README command extraction.
- Automatic repair or LLM-generated verdicts.
- Arbitrary host execution.
- Multi-language or monorepo autodetection in v1.
- Security certification.
- Accounts, billing, teams, or production multi-tenancy.
- Desktop automation unless it unlocks a separate release-install use case later.

## Safety policy

- Canonical GitHub HTTPS URLs only.
- Immutable commit before execution.
- No credentials in clone URLs, argv, sandbox env, logs, or receipts.
- No shell interpolation; executable plus argv only.
- Relative working directory with traversal rejected.
- Hard command, sandbox-idle, repository-size, log, and artifact limits.
- Repository files, logs, preview pages, and browser output are untrusted data.
- Cleanup after success or failure, with Solari `onTimeout: "kill"` as the idle-lifetime backstop.
- Receipt wording remains bounded to observed execution.

## Acceptance criteria

### Core

- A repository without a valid checkout contract fails before install.
- Contract validation rejects traversal, absolute paths, shell operators, control characters, oversized argv, invalid ports, and empty assertions.
- The exact commit and checkout contract SHA-256 appear in the receipt.
- A passing run executes only declared argv and requires the declared browser text.
- A failing command prevents preview/browser stages and still produces cleanup evidence.
- Secrets are redacted before persistence and rendering.

### Product

- A new visitor understands the clean-checkout claim in under ten seconds.
- Demo and live execution cannot be confused by title, badge, stage labels, or raw JSON.
- Refreshing a report preserves the receipt.
- Screenshot, raw receipt, commit, and contract hash are addressable from the report when present. Replay remains private and receipts exclude preview URLs and session IDs.

### Quality

- Typecheck, lint, unit, integration, production build, and Playwright desktop/mobile gates pass.
- No horizontal overflow or unhandled console error in the primary flow.
- No real-cloud claim before a captured and read-back Solari run.
- Independent review has no P0/P1.

## Winning demo

1. Show a repository that passes its normal CI.
2. Submit its immutable public URL to FreshCheckout.
3. Watch a clean Solari Sandbox execute the declared first-run contract.
4. Show a deliberately broken checkout failing on the exact command.
5. Fix the setup contract or repository and rerun.
6. Show the passing browser screenshot, private replay-captured flag, commit, contract hash, and cleanup line.
7. Close with: “CI proves the team can run it. FreshCheckout proves the next developer can.”

## Distribution wedge

The repository badge links to its latest checkout receipt. Maintainers can use FreshCheckout for release onboarding, examples, SDK quickstarts, templates, hiring assignments, and AI-generated starter projects.
