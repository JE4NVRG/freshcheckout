import { z } from "zod";

export const runModeSchema = z.enum(["demo", "solari"]);
export type RunMode = z.infer<typeof runModeSchema>;

export const runStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const verdictSchema = z.enum(["pending", "verified", "partial", "failed", "demo"]);
export type Verdict = z.infer<typeof verdictSchema>;

export const stageNameSchema = z.enum([
  "resolve",
  "sandbox",
  "clone",
  "inspect",
  "install",
  "test",
  "build",
  "preview",
  "browser",
  "receipt",
  "cleanup",
]);
export type StageName = z.infer<typeof stageNameSchema>;

export const stageStatusSchema = z.enum(["pending", "running", "passed", "failed", "skipped"]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const logEntrySchema = z.object({
  at: z.string().datetime(),
  stage: stageNameSchema,
  stream: z.enum(["system", "stdout", "stderr"]),
  message: z.string().max(8_000),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const stageSchema = z.object({
  name: stageNameSchema,
  label: z.string().min(1).max(80),
  status: stageStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  exitCode: z.number().int().nullable().optional(),
  summary: z.string().max(500).optional(),
});
export type RunStage = z.infer<typeof stageSchema>;

export const sourceSchema = z.object({
  kind: z.enum(["repository", "fixture"]).optional(),
  inputUrl: z.string().min(1),
  canonicalUrl: z.string().url(),
  owner: z.string().min(1),
  repository: z.string().min(1),
  defaultBranch: z.string().min(1).optional(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/i).optional(),
});
export type RunSource = z.infer<typeof sourceSchema>;

export const browserEvidenceSchema = z.object({
  title: z.string().max(500).optional(),
  httpReachable: z.boolean().optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  visibleAssertion: z.string().max(500).optional(),
  consoleErrorCount: z.number().int().nonnegative().optional(),
  failedRequestCount: z.number().int().nonnegative().optional(),
  observedOriginHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  screenshotPath: z.string().optional(),
  replayCaptured: z.boolean().optional(),
});
export type BrowserEvidence = z.infer<typeof browserEvidenceSchema>;

export const receiptSchema = z.object({
  schemaVersion: z.literal("freshcheckout.receipt/v1"),
  id: z.string().uuid(),
  mode: runModeSchema,
  status: runStatusSchema,
  verdict: verdictSchema,
  source: sourceSchema,
  policy: z.object({
    version: z.literal("node-web/v1"),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    secretsInjected: z.literal(false),
    sandboxIdleTimeoutMs: z.number().int().positive(),
    maxLogBytes: z.number().int().positive(),
  }),
  checkout: z.object({
    contractPath: z.literal("freshcheckout.config.json"),
    contractHash: z.string().regex(/^[0-9a-f]{64}$/),
    workingDirectory: z.string().min(1).max(200),
    expectedText: z.string().min(1).max(300),
  }).optional(),
  stages: z.array(stageSchema),
  logs: z.array(logEntrySchema),
  browser: browserEvidenceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  disclaimer: z.string().min(1),
});
export type RunReceipt = z.infer<typeof receiptSchema>;

export const createRunRequestSchema = z.object({
  repositoryUrl: z.string().min(1).max(500),
  mode: runModeSchema.default("demo"),
  scenario: z.enum(["pass", "fail"]).default("pass"),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const STAGES: ReadonlyArray<Pick<RunStage, "name" | "label">> = [
  { name: "resolve", label: "Resolve source" },
  { name: "sandbox", label: "Create sandbox" },
  { name: "clone", label: "Clone commit" },
  { name: "inspect", label: "Read checkout contract" },
  { name: "install", label: "Run declared install" },
  { name: "test", label: "Run declared tests" },
  { name: "build", label: "Run declared build" },
  { name: "preview", label: "Expose declared port" },
  { name: "browser", label: "Observe declared text" },
  { name: "receipt", label: "Generate checkout receipt" },
  { name: "cleanup", label: "Destroy sandbox" },
] as const;

export const RECEIPT_DISCLAIMER =
  "This receipt records one declared checkout path observed at one commit. It is not a security audit, endorsement, production-readiness claim, or guarantee.";
