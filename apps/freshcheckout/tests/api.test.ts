import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canonicalizeGitHubRepository } from "../src/core/github-url.js";
import { completeReceipt, createInitialReceipt } from "../src/core/receipt.js";
import { buildApp } from "../src/server/app.js";
import { RunStore } from "../src/server/run-store.js";

const REQUEST = {
  repositoryUrl: "https://github.com/solari-sdk/solari-cookbook",
  mode: "demo",
  scenario: "pass",
} as const;
const LIVE_RUN_TOKEN = "test-live-control-token-1234567890abcdef";
const LIVE_HEADERS = { "x-freshcheckout-live-token": LIVE_RUN_TOKEN };

describe("FreshCheckout HTTP contract", () => {
  let app: FastifyInstance;
  let temporaryDirectory: string;
  let staticRoot: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "freshcheckout-api-"));
    staticRoot = path.join(temporaryDirectory, "static");
    await mkdir(path.join(staticRoot, "assets"), { recursive: true });
    await writeFile(path.join(staticRoot, "index.html"), '<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>');
    await writeFile(path.join(staticRoot, "assets", "app.js"), 'document.querySelector("#root").textContent="FreshCheckout";');
    app = await buildApp({
      logger: false,
      store: new RunStore(path.join(temporaryDirectory, "runs")),
      demoDelayMs: 0,
      solariApiKey: null,
      staticRoot,
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("returns the same run envelope from create and read endpoints", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: REQUEST,
    });

    expect(createResponse.statusCode).toBe(202);
    const created = createResponse.json<{ run: { id: string; source: { canonicalUrl: string; kind?: string; commitSha?: string } } }>();
    expect(created.run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.run.source.canonicalUrl).toBe("https://github.com/JE4NVRG/freshcheckout");
    expect(created.run.source.kind).toBe("fixture");
    expect(created.run.source.commitSha).toBeUndefined();

    let completed: { run: { id: string; status: string } } | undefined;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const readResponse = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
      expect(readResponse.statusCode).toBe(200);
      completed = readResponse.json<{ run: { id: string; status: string } }>();
      if (completed.run.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(completed?.run.id).toBe(created.run.id);
    expect(completed?.run.status).toBe("completed");

    const receiptResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${created.run.id}/receipt.json`,
    });
    expect(receiptResponse.statusCode).toBe(200);
    expect(receiptResponse.headers["content-disposition"]).toContain(created.run.id);
    expect(receiptResponse.json<{ id: string }>().id).toBe(created.run.id);
  });

  it("marks the built-in failing fixture as failed in JSON", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { ...REQUEST, scenario: "fail" },
    });
    const created = createResponse.json<{ run: { id: string } }>();

    let terminal: { run: { status: string; verdict: string; source: { kind?: string; commitSha?: string } } } | undefined;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
      terminal = response.json<typeof terminal>();
      if (terminal?.run.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(terminal?.run.status).toBe("failed");
    expect(terminal?.run.verdict).toBe("failed");
    expect(terminal?.run.source.kind).toBe("fixture");
    expect(terminal?.run.source.commitSha).toBeUndefined();
  });

  it("fails closed for unsupported repository URLs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { ...REQUEST, repositoryUrl: "https://gitlab.com/owner/repository" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("github_only");
  });

  it("returns a stable not-found envelope", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runs/00000000-0000-0000-0000-000000000000",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe("run_not_found");
  });

  it("resolves stable verified links only to a configured verified Solari receipt", async () => {
    const absent = await app.inject({ method: "GET", url: "/runs/verified" });
    expect(absent.statusCode).toBe(404);

    await app.close();
    const store = new RunStore(path.join(temporaryDirectory, "verified-runs"));
    const repository = canonicalizeGitHubRepository("https://github.com/JE4NVRG/freshcheckout");
    const receipt = completeReceipt(createInitialReceipt(repository, "solari"), "verified");
    await store.save(receipt);
    app = await buildApp({ logger: false, store, verifiedRunId: receipt.id, solariApiKey: null, staticRoot });

    const page = await app.inject({ method: "GET", url: "/runs/verified" });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe(`/runs/${receipt.id}`);
    const machine = await app.inject({ method: "GET", url: "/runs/verified/receipt.json" });
    expect(machine.statusCode).toBe(302);
    expect(machine.headers.location).toBe(`/api/runs/${receipt.id}/receipt.json`);
  });

  it("does not start cloud execution without an explicitly configured runner", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { ...REQUEST, mode: "solari" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe("solari_not_configured");
  });

  it("keeps a configured live runner disabled without a separate control token", async () => {
    await app.close();
    const liveRunner = { execute: vi.fn(() => Promise.resolve()) };
    app = await buildApp({
      logger: false,
      store: new RunStore(path.join(temporaryDirectory, "tokenless-live-runs")),
      solariApiKey: null,
      liveRunner,
      staticRoot,
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.json<{ capabilities: { solari: boolean } }>().capabilities.solari).toBe(false);
    const response = await app.inject({ method: "POST", url: "/api/runs", payload: { ...REQUEST, mode: "solari" } });
    expect(response.statusCode).toBe(409);
    expect(liveRunner.execute).not.toHaveBeenCalled();
  });

  it("redacts a runner error before structured logging", async () => {
    await app.close();
    const marker = ["private", "runner", "value"].join("-");
    const liveRunner = { execute: vi.fn(() => Promise.reject(new Error(`SOLARI_API_KEY=${marker}`))) };
    app = await buildApp({
      logger: false,
      store: new RunStore(path.join(temporaryDirectory, "error-log-runs")),
      solariApiKey: null,
      liveRunner,
      liveRunToken: LIVE_RUN_TOKEN,
      staticRoot,
    });
    const errorLog = vi.spyOn(app.log, "error");

    const response = await app.inject({ method: "POST", url: "/api/runs", headers: LIVE_HEADERS, payload: { ...REQUEST, mode: "solari" } });
    expect(response.statusCode).toBe(202);
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());
    const serialized = JSON.stringify(errorLog.mock.calls);
    expect(serialized).not.toContain(marker);
    expect(serialized).toContain("[REDACTED]");
  });

  it("allows only one live checkout at a time", async () => {
    await app.close();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const liveRunner = { execute: vi.fn(() => pending) };
    app = await buildApp({
      logger: false,
      store: new RunStore(path.join(temporaryDirectory, "live-runs")),
      demoDelayMs: 0,
      solariApiKey: null,
      liveRunner,
      liveRunToken: LIVE_RUN_TOKEN,
      staticRoot,
    });

    const unauthorized = await app.inject({ method: "POST", url: "/api/runs", payload: { ...REQUEST, mode: "solari" } });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json<{ error: string }>().error).toBe("live_authorization_required");
    const first = await app.inject({ method: "POST", url: "/api/runs", headers: LIVE_HEADERS, payload: { ...REQUEST, mode: "solari" } });
    const second = await app.inject({ method: "POST", url: "/api/runs", headers: LIVE_HEADERS, payload: { ...REQUEST, mode: "solari" } });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(429);
    expect(second.json<{ error: string }>().error).toBe("live_concurrency_limit");

    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = await app.inject({ method: "POST", url: "/api/runs", headers: LIVE_HEADERS, payload: { ...REQUEST, mode: "solari" } });
    expect(third.statusCode).toBe(202);
  });

  it("does not expose arbitrary artifact names", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runs/11111111-1111-4111-8111-111111111111/artifacts/not-allowed.txt",
    });

    expect(response.statusCode).toBe(404);
  });

  it("serves hashed assets as files and reserves SPA fallback for app routes", async () => {
    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.headers["content-type"]).toContain("text/html");

    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toContain("javascript");
    expect(asset.body).not.toContain("<!doctype html>");

    const appRoute = await app.inject({ method: "GET", url: "/runs/11111111-1111-4111-8111-111111111111" });
    expect(appRoute.statusCode).toBe(200);
    expect(appRoute.body).toContain('<div id="root"></div>');

    const missingAsset = await app.inject({ method: "GET", url: "/assets/missing.js" });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.headers["content-type"]).toContain("application/json");
  });
});
