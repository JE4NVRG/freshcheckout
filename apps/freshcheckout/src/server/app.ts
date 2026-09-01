import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError } from "zod";

import { canonicalizeGitHubRepository, RepositoryUrlError } from "../core/github-url.js";
import { createRunRequestSchema } from "../core/model.js";
import { boundLog } from "../core/redact.js";
import { createInitialReceipt } from "../core/receipt.js";
import { ArtifactNotFoundError, ArtifactStore } from "./artifact-store.js";
import { DemoRunner } from "./demo-runner.js";
import { RunNotFoundError, RunStore } from "./run-store.js";
import { createLiveDependencies } from "./solari-provider.js";
import { SolariRunner } from "./solari-runner.js";

interface RunExecutor {
  execute(id: string): Promise<void>;
}

interface BuildAppOptions {
  logger?: boolean;
  store?: RunStore;
  demoDelayMs?: number;
  artifacts?: ArtifactStore;
  solariApiKey?: string | null;
  liveRunToken?: string | null;
  verifiedRunId?: string | null;
  liveRunner?: RunExecutor;
  staticRoot?: string | null;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 16_384 });
  const store = options.store ?? new RunStore();
  const artifacts = options.artifacts ?? new ArtifactStore();
  const demoRunner = new DemoRunner(store, options.demoDelayMs);
  const configuredKey = options.solariApiKey === undefined ? process.env.SOLARI_API_KEY : options.solariApiKey;
  const configuredLiveToken = options.liveRunToken === undefined ? process.env.FRESHCHECKOUT_LIVE_TOKEN : options.liveRunToken;
  const liveRunToken = configuredLiveToken && configuredLiveToken.length >= 32 ? configuredLiveToken : null;
  const configuredVerifiedRunId = options.verifiedRunId === undefined ? process.env.FRESHCHECKOUT_VERIFIED_RUN_ID : options.verifiedRunId;
  const verifiedRunId = configuredVerifiedRunId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuredVerifiedRunId)
    ? configuredVerifiedRunId
    : null;
  const liveRunner = options.liveRunner ?? (configuredKey
    ? new SolariRunner(store, createLiveDependencies(configuredKey, artifacts))
    : undefined);
  const maxLiveConcurrency = 1;
  let activeLiveRuns = 0;

  app.get("/api/health", () => ({
    status: "ok",
    service: "freshcheckout",
    version: "0.1.1",
    capabilities: { solari: Boolean(liveRunner && liveRunToken), maxLiveConcurrency },
  }));

  app.post("/api/runs", async (request, reply) => {
    try {
      const input = createRunRequestSchema.parse(request.body);
      if (input.mode === "solari" && (!liveRunner || !liveRunToken)) {
        return reply.code(409).send({
          error: "solari_not_configured",
          message: "Real Solari mode and its control token are not configured on this server.",
        });
      }
      if (input.mode === "solari" && request.headers["x-freshcheckout-live-token"] !== liveRunToken) {
        return reply.code(401).send({
          error: "live_authorization_required",
          message: "Live checkout authorization is required.",
        });
      }
      if (input.mode === "solari" && activeLiveRuns >= maxLiveConcurrency) {
        return reply.code(429).send({
          error: "live_concurrency_limit",
          message: "A live checkout is already running. Wait for it to finish before starting another.",
        });
      }

      const requestedRepository = canonicalizeGitHubRepository(input.repositoryUrl);
      const repository = input.mode === "demo"
        ? canonicalizeGitHubRepository("https://github.com/JE4NVRG/freshcheckout")
        : requestedRepository;
      const receipt = await store.save(createInitialReceipt(repository, input.mode));
      if (input.mode === "solari") activeLiveRuns += 1;
      const execution = input.mode === "demo"
        ? demoRunner.execute(receipt.id, input.scenario)
        : liveRunner!.execute(receipt.id);
      void execution
        .catch((error: unknown) => {
          const message = boundLog(error instanceof Error ? error.message : "Unknown runner failure.", 1_000);
          app.log.error({ error: message, runId: receipt.id, mode: input.mode }, "Runner failed");
        })
        .finally(() => {
          if (input.mode === "solari") activeLiveRuns = Math.max(0, activeLiveRuns - 1);
        });

      return reply.code(202).send({ run: receipt });
    } catch (error) {
      if (error instanceof RepositoryUrlError) {
        return reply.code(400).send({ error: error.code, message: error.message });
      }
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", message: "Run request is not valid.", issues: error.issues });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    try {
      return { run: await store.get(request.params.id) };
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        return reply.code(404).send({ error: "run_not_found", message: error.message });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id/receipt.json", async (request, reply) => {
    try {
      const receipt = await store.get(request.params.id);
      return reply.header("content-disposition", `attachment; filename=freshcheckout-${receipt.id}.json`).send(receipt);
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        return reply.code(404).send({ error: "run_not_found", message: error.message });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string; name: string } }>("/api/runs/:id/artifacts/:name", async (request, reply) => {
    try {
      if (request.params.name !== "browser.png") {
        return reply.code(404).send({ error: "artifact_not_found", message: "Public artifact not found." });
      }
      await store.get(request.params.id);
      const artifact = await artifacts.read(request.params.id, request.params.name);
      return reply.type(artifact.contentType).send(Buffer.from(artifact.bytes));
    } catch (error) {
      if (error instanceof RunNotFoundError || error instanceof ArtifactNotFoundError) {
        return reply.code(404).send({ error: "artifact_not_found", message: error.message });
      }
      throw error;
    }
  });

  app.get("/demo-fixture", (_request, reply) => reply
    .type("text/html; charset=utf-8")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FreshCheckout built-in fixture</title><style>body{font:18px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0a0d0c;color:#f3f0e8}main{border:1px solid #394137;padding:3rem;max-width:38rem}strong{color:#b8f34a}</style></head><body><main><p>Built-in passing fixture</p><h1>FreshCheckout tests the first run.</h1><p><strong>SIMULATED PASS</strong> This local page exists only for deterministic demo and browser tests.</p></main></body></html>`));

  async function resolveVerifiedRun(reply: FastifyReply): Promise<string | null> {
    if (!verifiedRunId) {
      await reply.code(404).send({ error: "verified_run_not_found", message: "No canonical verified run is configured." });
      return null;
    }
    try {
      const receipt = await store.get(verifiedRunId);
      if (receipt.mode !== "solari" || receipt.verdict !== "verified" || receipt.status !== "completed") {
        await reply.code(404).send({ error: "verified_run_not_found", message: "The configured run is not verified." });
        return null;
      }
      return receipt.id;
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        await reply.code(404).send({ error: "verified_run_not_found", message: "The configured verified run does not exist." });
        return null;
      }
      throw error;
    }
  }

  app.get("/runs/verified", async (_request, reply) => {
    const id = await resolveVerifiedRun(reply);
    if (!id) return reply;
    return reply.code(302).header("location", `/runs/${encodeURIComponent(id)}`).send();
  });

  app.get("/runs/verified/receipt.json", async (_request, reply) => {
    const id = await resolveVerifiedRun(reply);
    if (!id) return reply;
    return reply.code(302).header("location", `/api/runs/${encodeURIComponent(id)}/receipt.json`).send();
  });

  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const staticRoot = options.staticRoot === undefined
    ? path.resolve(currentDirectory, "../../dist/client")
    : options.staticRoot;
  if (staticRoot && existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && !request.url.startsWith("/assets/")) {
        return reply.type("text/html; charset=utf-8").sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found", message: "Route not found." });
    });
  }

  return app;
}
