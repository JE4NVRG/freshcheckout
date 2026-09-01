import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { RunReceipt, StageStatus } from "../core/model";

const DEFAULT_REPOSITORY = "https://github.com/JE4NVRG/freshcheckout";
const VERIFIED_RUN_URL = "/runs/verified";

interface CreateRunResponse {
  run: RunReceipt;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function usePathname(): string {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = (): void => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return pathname;
}

function Wordmark(): ReactNode {
  return (
    <a
      className="wordmark"
      href="/"
      onClick={(event) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      <span className="wordmark-mark" aria-hidden="true">
        FC
      </span>
      <span>FreshCheckout</span>
    </a>
  );
}

function SiteHeader(): ReactNode {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Primary navigation">
          <a href="/#method">Method</a>
          <a href="/#security">Safety</a>
          <a href="https://github.com/JE4NVRG/freshcheckout" rel="noreferrer" target="_blank">
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <a href={VERIFIED_RUN_URL}>Verified run</a>
        </nav>
      </header>
    </>
  );
}

function ArrowIcon(): ReactNode {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function LockIcon(): ReactNode {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <rect height="9" rx="2" stroke="currentColor" strokeWidth="1.5" width="12" x="4" y="8" />
      <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StageGlyph({ status }: { status: StageStatus }): ReactNode {
  const symbol: Record<StageStatus, string> = {
    pending: "·",
    running: "↻",
    passed: "✓",
    failed: "×",
    skipped: "–",
  };
  return (
    <span aria-label={status} className={`stage-glyph stage-glyph-${status}`} role="img">
      {symbol[status]}
    </span>
  );
}

function EmptyReceiptPreview(): ReactNode {
  return (
    <div className="receipt-shell receipt-empty" aria-label="No demo receipt generated yet">
      <div className="receipt-paper">
        <div className="receipt-topline">
          <span>FRESHCHECKOUT / PREVIEW</span>
          <span>NOT RUN</span>
        </div>
        <div className="receipt-verdict">
          <span className="receipt-stamp">EMPTY RECEIPT</span>
          <strong>No run yet</strong>
          <small>No repository, commit, Browser result, or evidence exists yet.</small>
        </div>
        <div className="receipt-empty-lines" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <p className="receipt-caption">A receipt appears only after an explicit run.</p>
      </div>
    </div>
  );
}

function HomePage(): ReactNode {
  const [scenario, setScenario] = useState<"pass" | "fail">("pass");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl: DEFAULT_REPOSITORY, mode: "demo", scenario }),
      });
      const body = (await response.json()) as CreateRunResponse | ApiErrorResponse;
      if (!response.ok || !("run" in body)) {
        throw new Error("message" in body && body.message ? body.message : "Could not start the fresh checkout.");
      }
      navigate(`/runs/${body.run.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the fresh checkout.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span>Developer onboarding verification</span><span>Clean-room execution</span></p>
            <h1><em>FreshCheckout tests the first run.</em></h1>
            <p className="hero-lede">
              Preview the workflow with a built-in sample, or inspect a recorded repository-backed run. The sample never fetches
              a repository, creates cloud resources, or produces verification evidence.
            </p>

            <form className="run-form" onSubmit={(event) => void submit(event)}>
              <div className="demo-disclosure" role="note">
                <div className="disclosure-copy">
                  <strong>Built-in simulation</strong>
                  <span>Uses a bundled fixture. No repository, Sandbox, Browser session, or verification evidence is created.</span>
                </div>
                <div className="disclosure-actions">
                  <span className="scenario-label">Choose simulated outcome</span>
                  <div className="scenario-picker" role="group" aria-label="Expected fixture outcome">
                    <button aria-pressed={scenario === "pass"} className={scenario === "pass" ? "active" : ""} onClick={() => setScenario("pass")} type="button">Simulate pass</button>
                    <button aria-pressed={scenario === "fail"} className={scenario === "fail" ? "active" : ""} onClick={() => setScenario("fail")} type="button">Simulate failure</button>
                  </div>
                  <button className="disclosure-run" disabled={submitting} type="submit">
                    {submitting ? "Starting…" : "Run built-in fixture"}
                    {!submitting && <ArrowIcon />}
                  </button>
                  <a href={VERIFIED_RUN_URL}>View verified repository-backed run ↗</a>
                </div>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </form>

            <div className="trust-strip" aria-label="Simulation boundaries">
              <span><LockIcon /> Built-in sample only</span>
              <span>No repository fetched</span>
              <span>No cloud evidence</span>
            </div>
          </div>
          <EmptyReceiptPreview />
        </section>

        <section className="method-section" id="method">
          <div className="section-heading">
            <p className="eyebrow">The first-run proof</p>
            <h2>One declared path.<br />Four observable facts.</h2>
          </div>
          <ol className="method-grid">
            <li>
              <span>01 / Resolve</span>
              <h3>Pin the source</h3>
              <p>Canonicalize the GitHub URL, resolve the exact commit, and hash the declared checkout contract.</p>
            </li>
            <li>
              <span>02 / Execute</span>
              <h3>Build in isolation</h3>
              <p>Run only the declared executable and argv inside a disposable Solari Sandbox with no local state.</p>
            </li>
            <li>
              <span>03 / Observe</span>
              <h3>Use the product</h3>
              <p>Expose the declared port and require the declared visible text in a recorded Solari Browser.</p>
            </li>
            <li>
              <span>04 / Receipt</span>
              <h3>Show your work</h3>
              <p>Return commit, contract hash, sanitized logs, timings, screenshot, replay, and cleanup state.</p>
            </li>
          </ol>
        </section>

        <section className="safety-section" id="security">
          <div>
            <p className="eyebrow">Designed for hostile input</p>
            <h2>The code is untrusted.<br />The execution is bounded.</h2>
          </div>
          <div className="safety-ledger">
            <div><b>01</b><span><strong>No shell interpolation</strong>Commands are executable-plus-argv, never copied from README instructions.</span></div>
            <div><b>02</b><span><strong>No secret inheritance</strong>The Solari key remains in the orchestrator and is never injected into the sandbox.</span></div>
            <div><b>03</b><span><strong>Bounded by policy</strong>Commands, sandbox idle lifetime, logs, repository size, and output are capped.</span></div>
            <div><b>04</b><span><strong>Fail-closed cleanup</strong>VM destruction runs after success or failure, with kill-on-timeout as backstop.</span></div>
          </div>
        </section>
      </main>
      <footer>
        <Wordmark />
        <p><a href={VERIFIED_RUN_URL}>Inspect the recorded repository-backed evidence ↗</a></p>
      </footer>
    </div>
  );
}

function elapsedLabel(milliseconds?: number): string {
  if (milliseconds === undefined) return "";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function ReportPage({ runId }: { runId: string }): ReactNode {
  const [receipt, setReceipt] = useState<RunReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<RunReceipt | null> => {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) {
      const body = (await response.json()) as ApiErrorResponse;
      throw new Error(body.error ?? "Receipt not found.");
    }
    const body = (await response.json()) as { run: RunReceipt };
    setReceipt(body.run);
    return body.run;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async (): Promise<void> => {
      try {
        const next = await load();
        if (!cancelled && next && !["completed", "failed"].includes(next.status)) {
          timer = window.setTimeout(() => void poll(), 450);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Receipt not found.");
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load]);

  const stageTotals = useMemo(
    () => ({
      passed: receipt?.stages.filter((stage) => stage.status === "passed").length ?? 0,
      failed: receipt?.stages.filter((stage) => stage.status === "failed").length ?? 0,
      skipped: receipt?.stages.filter((stage) => stage.status === "skipped").length ?? 0,
    }),
    [receipt],
  );

  if (error) {
    return (
      <div className="page-shell">
        <SiteHeader />
        <main className="empty-state" id="main-content" tabIndex={-1}>
          <p className="eyebrow">Receipt unavailable</p>
          <h1>{error}</h1>
          <button className="text-button" onClick={() => navigate("/")} type="button">Return home</button>
        </main>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="page-shell">
        <SiteHeader />
        <main className="loading-state" id="main-content" tabIndex={-1} aria-live="polite">
          <span className="loader" />
          <p>Loading evidence ledger…</p>
        </main>
      </div>
    );
  }

  const failedStage = receipt.stages.find((stage) => stage.status === "failed");
  const statusTitle = receipt.mode === "demo"
    ? receipt.status === "failed"
      ? "Built-in failing fixture failed"
      : receipt.status === "completed" ? "Demo fixture passed" : "Running demo fixture"
    : receipt.status === "failed" || failedStage
      ? "Fresh checkout failed"
      : receipt.status === "completed" ? "Fresh checkout passed" : "Fresh checkout running";

  return (
    <div className="page-shell report-page">
      <SiteHeader />
      <main className="report-main" id="main-content" tabIndex={-1}>
        <div className="report-breadcrumbs">
          <a href="/">FreshCheckout</a>
          <span>/</span>
          <code>Run {receipt.id.slice(0, 8)}</code>
        </div>

        <section className="report-hero">
          <div>
            <div className="report-badges">
              <span className={`mode-badge mode-${receipt.mode}`}>{receipt.mode === "demo" ? "Simulated fixture" : "Verified Solari run"}</span>
              <span className={`run-state run-state-${receipt.status}`}><i />{receipt.status}</span>
            </div>
            <h1>{statusTitle}</h1>
            {receipt.mode === "demo" ? <p className="fixture-identity">Built-in fixture · no repository fetched</p> : (
              <a href={receipt.source.canonicalUrl} rel="noreferrer" target="_blank">
                {receipt.source.owner} / <strong>{receipt.source.repository}</strong> <span aria-hidden="true">↗</span>
              </a>
            )}
            <div className="report-actions">
              <a className="primary-action" href="/">Run another checkout</a>
              {receipt.mode === "demo" && <a href={VERIFIED_RUN_URL}>Compare with real Solari proof ↗</a>}
            </div>
          </div>
          <div className={`score-block${receipt.status === "failed" ? " score-block-failed" : ""}`}>
            <span>STAGE RESULT</span>
            <strong>{String(stageTotals.passed).padStart(2, "0")}<small> passed / {receipt.stages.length}</small></strong>
            <p>{receipt.status === "failed"
              ? `${stageTotals.failed} failed · ${stageTotals.skipped} skipped`
              : receipt.status === "completed"
                ? receipt.mode === "demo" ? "demo receipt generated" : "receipt generated"
                : receipt.mode === "demo" ? "simulating workflow" : "collecting evidence"}</p>
          </div>
        </section>

        {receipt.mode === "demo" && (
          <div className="demo-notice" role="note">
            <strong>Preview receipt only</strong>
            <span>No Solari cloud execution occurred. This output is not valid verification evidence.</span>
          </div>
        )}

        <div className="report-layout">
          <section className="timeline-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">{receipt.mode === "demo" ? "Demo event ledger" : "Execution ledger"}</p><h2>Every step, accounted for.</h2></div>
              <div className="hash-label"><span>Policy SHA-256</span><code>{receipt.policy.hash.slice(0, 12)}</code></div>
            </div>
            <ol className="stage-timeline">
              {receipt.stages.map((stage, index) => (
                <li className={`stage-item stage-item-${stage.status}`} key={stage.name}>
                  <span className="stage-index">{String(index + 1).padStart(2, "0")}</span>
                  <StageGlyph status={stage.status} />
                  <div>
                    <div className="stage-title"><h3>{stage.label}</h3><time>{receipt.mode === "demo" ? "DEMO" : elapsedLabel(stage.durationMs)}</time></div>
                    <p>{stage.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="evidence-rail">
            {receipt.mode === "demo" ? (
              <section className="source-card">
                <p className="eyebrow">Fixture identity</p>
                <dl>
                  <div><dt>Source</dt><dd>Built into FreshCheckout</dd></div>
                  <div><dt>Repository</dt><dd>Not fetched</dd></div>
                  <div><dt>Commit</dt><dd>Not resolved</dd></div>
                  <div><dt>Run ID</dt><dd><code>{receipt.id.slice(0, 8)}</code></dd></div>
                  <div><dt>Started</dt><dd>{new Date(receipt.createdAt).toLocaleString()}</dd></div>
                </dl>
              </section>
            ) : (
              <section className="source-card">
                <p className="eyebrow">Source identity</p>
                <dl>
                  <div><dt>Repository</dt><dd>{receipt.source.owner}/{receipt.source.repository}</dd></div>
                  <div><dt>Branch</dt><dd>{receipt.source.defaultBranch ?? "resolving"}</dd></div>
                  <div><dt>Commit</dt><dd><code>{receipt.source.commitSha?.slice(0, 12) ?? "pending"}</code></dd></div>
                  <div><dt>Run ID</dt><dd><code>{receipt.id.slice(0, 8)}</code></dd></div>
                  <div><dt>Started</dt><dd>{new Date(receipt.createdAt).toLocaleString()}</dd></div>
                </dl>
              </section>
            )}

            {receipt.mode === "solari" && receipt.checkout && (
              <section className="contract-card">
                <p className="eyebrow">Checkout contract</p>
                <dl>
                  <div><dt>Path</dt><dd>{receipt.checkout.contractPath}</dd></div>
                  <div><dt>Working dir</dt><dd>{receipt.checkout.workingDirectory}</dd></div>
                  <div><dt>SHA-256</dt><dd><code>{receipt.checkout.contractHash.slice(0, 12)}</code></dd></div>
                  <div><dt>Expected text</dt><dd>{receipt.checkout.expectedText}</dd></div>
                </dl>
              </section>
            )}

            <section className="policy-card">
              <p className="eyebrow">Runtime policy</p>
              <dl>
                <div><dt>Sandbox idle TTL</dt><dd>{Math.round(receipt.policy.sandboxIdleTimeoutMs / 60000)} min</dd></div>
                <div><dt>Log cap</dt><dd>{Math.round(receipt.policy.maxLogBytes / 1024)} KB</dd></div>
                <div><dt>Secrets injected</dt><dd>{receipt.policy.secretsInjected ? "yes" : "never"}</dd></div>
                <div><dt>Policy</dt><dd>{receipt.policy.version}</dd></div>
              </dl>
            </section>

            {(receipt.browser.visibleAssertion || receipt.browser.screenshotPath) && (
              <section className="browser-card">
                <p className="eyebrow">{receipt.mode === "demo" ? "Simulated browser output" : "Browser evidence"}</p>
                <div className="browser-status">
                  <span>{receipt.browser.title ?? "Observed preview"}</span>
                  <b>{receipt.mode === "demo"
                    ? "SIMULATED ASSERTION"
                    : receipt.browser.httpReachable
                      ? receipt.browser.httpStatus ? `HTTP ${receipt.browser.httpStatus}` : "REACHABLE"
                      : "NO RESPONSE"}</b>
                </div>
                {receipt.browser.screenshotPath && (
                  <a className="browser-shot" href={receipt.browser.screenshotPath} rel="noreferrer" target="_blank">
                    <img alt="Observed application rendered in Solari Browser" height="2365" loading="lazy" src={receipt.browser.screenshotPath} width="1280" />
                  </a>
                )}
                {receipt.browser.visibleAssertion && <p className="browser-fact">Observed text: “{receipt.browser.visibleAssertion}”</p>}
                {receipt.browser.observedOriginHash && <p className="browser-fact">Origin SHA-256: <code>{receipt.browser.observedOriginHash.slice(0, 12)}</code></p>}
                {receipt.browser.replayCaptured && <p className="browser-fact">Private rrweb replay captured</p>}
              </section>
            )}
          </aside>
        </div>

        <section className="logs-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">{receipt.mode === "demo" ? "Simulated output" : "Sanitized output"}</p><h2>Checkout log</h2></div>
            <a href={`/api/runs/${encodeURIComponent(receipt.id)}/receipt.json`} target="_blank">View {receipt.mode === "demo" ? "demo " : ""}receipt.json ↗</a>
          </div>
          <div className="terminal-window" role="log" aria-live="polite">
            <div className="terminal-chrome"><span /><span /><span /><code>freshcheckout/run-{receipt.id.slice(0, 8)}</code></div>
            <div className="terminal-lines">
              {receipt.logs.length === 0 ? (
                <p><span>··:··:··</span><i>waiting for first event…</i></p>
              ) : receipt.logs.map((entry, index) => (
                <p key={`${entry.at}-${index}`}>
                  <span>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</span>
                  <b className={`stream-${entry.stream}`}>{entry.stream}</b>
                  <code>{entry.message}</code>
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function App(): ReactNode {
  const pathname = usePathname();
  const runMatch = /^\/runs\/([0-9a-f-]+)$/.exec(pathname);

  if (runMatch?.[1]) return <ReportPage runId={runMatch[1]} />;
  if (pathname === "/") return <HomePage />;

  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="empty-state" id="main-content" tabIndex={-1}>
        <p className="eyebrow">404 / no evidence</p>
        <h1>This page was not part of the run.</h1>
        <button className="text-button" onClick={() => navigate("/")} type="button">Return home</button>
      </main>
    </div>
  );
}
