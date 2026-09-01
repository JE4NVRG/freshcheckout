import { createHash, randomUUID } from "node:crypto";

import type { CanonicalGitHubRepository } from "./github-url.js";
import {
  RECEIPT_DISCLAIMER,
  STAGES,
  type LogEntry,
  type RunMode,
  type RunReceipt,
  type RunSource,
  type StageName,
  type StageStatus,
  type Verdict,
} from "./model.js";

export const EXECUTION_POLICY = Object.freeze({
  version: "node-web/v1" as const,
  secretsInjected: false as const,
  sandboxIdleTimeoutMs: 600_000,
  maxLogBytes: 64_000,
});

export const EXECUTION_POLICY_HASH = createHash("sha256")
  .update(JSON.stringify(EXECUTION_POLICY))
  .digest("hex");

const DEMO_STAGE_LABELS: Record<StageName, string> = {
  resolve: "Resolve demo fixture",
  sandbox: "Simulate sandbox allocation",
  clone: "Load fixture commit",
  inspect: "Simulate checkout contract",
  install: "Simulate declared install",
  test: "Simulate declared tests",
  build: "Simulate declared build",
  preview: "Open local fixture preview",
  browser: "Simulate browser assertion",
  receipt: "Generate demo receipt",
  cleanup: "Confirm no cloud resources",
};

export function createInitialReceipt(repository: CanonicalGitHubRepository, mode: RunMode): RunReceipt {
  const now = new Date().toISOString();
  const source: RunSource = {
    inputUrl: repository.inputUrl,
    canonicalUrl: repository.canonicalUrl,
    owner: repository.owner,
    repository: repository.repository,
  };

  return {
    schemaVersion: "freshcheckout.receipt/v1",
    id: randomUUID(),
    mode,
    status: "queued",
    verdict: mode === "demo" ? "demo" : "pending",
    source,
    policy: {
      ...EXECUTION_POLICY,
      hash: EXECUTION_POLICY_HASH,
    },
    stages: STAGES.map((stage) => ({
      ...stage,
      label: mode === "demo" ? DEMO_STAGE_LABELS[stage.name] : stage.label,
      status: "pending",
    })),
    logs: [],
    browser: {},
    createdAt: now,
    updatedAt: now,
    disclaimer: RECEIPT_DISCLAIMER,
  };
}

function serializedLogBytes(logs: LogEntry[]): number {
  return new TextEncoder().encode(JSON.stringify(logs)).byteLength;
}

export function appendReceiptLogs(receipt: RunReceipt, entries: LogEntry[]): RunReceipt {
  const logs = [...receipt.logs, ...entries];
  while (logs.length > 0 && serializedLogBytes(logs) > EXECUTION_POLICY.maxLogBytes) {
    logs.shift();
  }
  return {
    ...receipt,
    logs,
    updatedAt: new Date().toISOString(),
  };
}

export function setStage(
  receipt: RunReceipt,
  name: StageName,
  status: StageStatus,
  details: { summary?: string; exitCode?: number | null } = {},
): RunReceipt {
  const now = new Date().toISOString();
  return {
    ...receipt,
    updatedAt: now,
    stages: receipt.stages.map((stage) => {
      if (stage.name !== name) return stage;
      const startedAt = stage.startedAt ?? (status === "running" ? now : undefined);
      const completedAt = ["passed", "failed", "skipped"].includes(status) ? now : undefined;
      const durationMs = startedAt && completedAt
        ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
        : undefined;
      return {
        ...stage,
        status,
        ...(startedAt ? { startedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(details.exitCode !== undefined ? { exitCode: details.exitCode } : {}),
        ...(details.summary ? { summary: details.summary } : {}),
      };
    }),
  };
}

export function completeReceipt(receipt: RunReceipt, verdict: Verdict): RunReceipt {
  const now = new Date().toISOString();
  return {
    ...receipt,
    status: "completed",
    verdict,
    updatedAt: now,
    completedAt: now,
  };
}
