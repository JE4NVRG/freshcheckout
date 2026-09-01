import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { RunMode, RunReceipt, StageStatus } from "../core/model";

const DEFAULT_REPOSITORY = "https://github.com/solari-sdk/solari-cookbook";

interface CreateRunResponse {
  run: RunReceipt;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface HealthResponse {
  capabilities?: {
    solari?: boolean;
  };
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
    <header className="site-header">
      <Wordmark />
      <nav aria-label="Primary navigation">
        <a href="/#method">Method</a>
        <a href="/#security">Safety</a>
        <a href="https://github.com/solari-sdk/solari-cookbook" rel="noreferrer" target="_blank">
          Cookbook <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
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

function MiniReceipt({ mode }: { mode: RunMode }): ReactNode {
  const live = mode === "solari";
  const rows = [
    ["Resolve source", live ? "WAIT" : "DEMO"],
    ["Build in microVM", live ? "WAIT" : "DEMO"],
    ["Browser smoke", live ? "WAIT" : "DEMO"],
    ["Clean up", live ? "WAIT" : "DEMO"],
  ];

  return (
    <div className="receipt-shell" aria-label="Example FreshCheckout receipt">
      <div className="receipt-paper">
        <div className="receipt-topline">
          <span>FRESHCHECKOUT / {live ? "SOLARI LIVE" : "DEMO"}</span>
          <span>#7F31</span>
        </div>
        <div className="receipt-verdict">
          <span className="receipt-stamp">{live ? "READY" : "SIMULATED"}</span>
          <strong>{live ? "Awaiting source" : "Demo flow complete"}</strong>
          <small>solari-sdk / cookbook</small>
        </div>
        <div className="receipt-rows">
          {rows.map(([label, value], index) => (
            <div className="receipt-row" key={label}>
              <span>{String(index + 1).padStart(2, "0")} {label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="receipt-hash">
          <span>POLICY</span>
          <code>73cb9d…3e84</code>
        </div>
        <div className="barcode" aria-hidden="true" />
        <p className="receipt-caption">A clean checkout beats a local promise.</p>
      </div>
    </div>
  );
}

function HomePage(): ReactNode {
  const [repositoryUrl, setRepositoryUrl] = useState(DEFAULT_REPOSITORY);
  const [scenario, setScenario] = useState<"pass" | "fail">("pass");
  const [mode, setMode] = useState<RunMode>("demo");
  const [solariAvailable, setSolariAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/health")
      .then(async (response) => response.ok ? response.json() as Promise<HealthResponse> : undefined)
      .then((health) => {
        if (!active || !health?.capabilities?.solari) return;
        setSolariAvailable(true);
        setMode("solari");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl, mode, scenario }),
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
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span>Solari build challenge</span><span>Clean-room onboarding</span></p>
            <h1>Your CI tests the codebase. <em>FreshCheckout tests the first run.</em></h1>
            <p className="hero-lede">
              Execute one declared setup path at an immutable commit inside a clean Solari Sandbox, then prove the first screen in a recorded Browser.
            </p>

            <form className="run-form" onSubmit={(event) => void submit(event)}>
              <div className="execution-mode" role="group" aria-label="Execution environment">
                <button
                  aria-pressed={mode === "demo"}
                  className={mode === "demo" ? "active" : ""}
                  onClick={() => setMode("demo")}
                  type="button"
                >
                  Demo
                </button>
                <button
                  aria-pressed={mode === "solari"}
                  className={mode === "solari" ? "active" : ""}
                  disabled={!solariAvailable}
                  onClick={() => setMode("solari")}
                  title={solariAvailable ? "Execute with Solari Sandbox and Browser" : "Configure a Solari API key to unlock live runs"}
                  type="button"
                >
                  {solariAvailable ? "Solari live" : "Solari live · locked"}
                </button>
                <span>{solariAvailable ? "Cloud runner ready" : "Live unavailable · API key required"}</span>
              </div>
              <div className="field-label">
                <label htmlFor="repository-url">Repository with freshcheckout.config.json</label>
                <span id="repository-hint">Paste a declared public checkout</span>
              </div>
              <div className="url-control">
                <span aria-hidden="true" className="prompt-mark">$</span>
                <input
                  autoCapitalize="none"
                  autoComplete="url"
                  aria-describedby="repository-hint"
                  id="repository-url"
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="https://github.com/owner/repository"
                  spellCheck="false"
                  title={repositoryUrl}
                  type="url"
                  value={repositoryUrl}
                />
                <button disabled={submitting} type="submit">
                  {submitting ? "Starting…" : mode === "solari" ? "Run fresh checkout" : "Run checkout demo"}
                  {!submitting && <ArrowIcon />}
                </button>
              </div>
              <div className="form-meta">
                {mode === "demo" ? (
                  <div className="scenario-picker" role="group" aria-label="Demo outcome">
                    <button
                      aria-pressed={scenario === "pass"}
                      className={scenario === "pass" ? "active" : ""}
                      onClick={() => setScenario("pass")}
                      type="button"
                    >
                      Passing fixture
                    </button>
                    <button
                      aria-pressed={scenario === "fail"}
                      className={scenario === "fail" ? "active" : ""}
                      onClick={() => setScenario("fail")}
                      type="button"
                    >
                      Failing fixture
                    </button>
                  </div>
                ) : <span className="live-run-label">Isolated Sandbox + recorded Browser</span>}
                <p><span className="status-dot" /> {mode === "solari" ? "Real cloud execution" : "Deterministic demo mode"}</p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </form>

            <div className="trust-strip" aria-label="Runtime guarantees">
              <span><LockIcon /> No repository secrets</span>
              <span>40-char commit pin</span>
              <span>Cleanup is mandatory</span>
            </div>
          </div>
          <MiniReceipt mode={mode} />
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
        <p>Built on Solari Browser + Sandbox. Evidence, not claims.</p>
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
        if (!cancelled && next?.status !== "completed") {
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

  const completedStages = useMemo(
    () => receipt?.stages.filter((stage) => ["passed", "failed", "skipped"].includes(stage.status)).length ?? 0,
    [receipt],
  );

  if (error) {
    return (
      <div className="page-shell">
        <SiteHeader />
        <main className="empty-state">
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
        <main className="loading-state" aria-live="polite">
          <span className="loader" />
          <p>Loading evidence ledger…</p>
        </main>
      </div>
    );
  }

  const failedStage = receipt.stages.find((stage) => stage.status === "failed");
  const statusTitle = receipt.mode === "demo"
    ? receipt.status === "completed"
      ? failedStage
        ? "Demo found a build failure"
        : "Demo flow complete"
      : "Running demo flow"
    : receipt.status === "completed"
      ? failedStage
        ? "Fresh checkout failed"
        : "Fresh checkout passed"
      : "Fresh checkout running";

  return (
    <div className="page-shell report-page">
      <SiteHeader />
      <main className="report-main">
        <div className="report-breadcrumbs">
          <button onClick={() => navigate("/")} type="button">FreshCheckout</button>
          <span>/</span>
          <code>{receipt.id.slice(0, 8)}</code>
        </div>

        <section className="report-hero">
          <div>
            <div className="report-badges">
              <span className={`mode-badge mode-${receipt.mode}`}>{receipt.mode === "demo" ? "Demo environment" : "Solari live"}</span>
              <span className={`run-state run-state-${receipt.status}`}><i />{receipt.status}</span>
            </div>
            <h1>{statusTitle}</h1>
            <a href={receipt.source.canonicalUrl} rel="noreferrer" target="_blank">
              {receipt.source.owner} / <strong>{receipt.source.repository}</strong> <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="score-block">
            <span>STAGE PROGRESS</span>
            <strong>{String(completedStages).padStart(2, "0")}<small> of {receipt.stages.length}</small></strong>
            <p>{receipt.status === "completed"
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

            {receipt.checkout && (
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
                    ? "FIXTURE REACHABLE"
                    : receipt.browser.httpReachable
                      ? receipt.browser.httpStatus ? `HTTP ${receipt.browser.httpStatus}` : "REACHABLE"
                      : "NO RESPONSE"}</b>
                </div>
                {receipt.browser.screenshotPath && (
                  <a className="browser-shot" href={receipt.browser.screenshotPath} rel="noreferrer" target="_blank">
                    <img alt="Observed application rendered in Solari Browser" loading="lazy" src={receipt.browser.screenshotPath} />
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
            <div className="terminal-chrome"><span /><span /><span /><code>freshcheckout/{receipt.id.slice(0, 8)}</code></div>
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
      <main className="empty-state">
        <p className="eyebrow">404 / no evidence</p>
        <h1>This page was not part of the run.</h1>
        <button className="text-button" onClick={() => navigate("/")} type="button">Return home</button>
      </main>
    </div>
  );
}
