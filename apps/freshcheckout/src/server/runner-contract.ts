import type { ParsedCheckoutContract } from "../core/checkout-contract.js";
import type { CommandSpec } from "../core/planner.js";

export interface ResolvedSource {
  defaultBranch: string;
  commitSha: string;
  sizeKb: number;
}

export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BrowserObservation {
  finalUrl: string;
  title: string;
  httpReachable: boolean;
  httpStatus?: number;
  visibleAssertion: string;
  consoleErrorCount: number;
  failedRequestCount: number;
  observedOriginHash: string;
  sessionId: string;
  screenshot: Uint8Array;
  replay?: Uint8Array;
}

export interface PreviewResult {
  url: string;
}

export interface RemoteSandbox {
  clonePinned(repositoryUrl: string, defaultBranch: string, commitSha: string): Promise<void>;
  readCheckoutContract(): Promise<ParsedCheckoutContract>;
  run(command: CommandSpec): Promise<CommandOutput>;
  startPreview(command: CommandSpec, port: number): Promise<PreviewResult>;
  kill(): Promise<void>;
}

export interface ArtifactWriter {
  save(runId: string, name: "browser.png" | "browser-replay.ndjson", data: Uint8Array): Promise<string>;
  read(runId: string, name: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export interface LiveRunnerDependencies {
  resolveSource(owner: string, repository: string): Promise<ResolvedSource>;
  createSandbox(runId: string): Promise<RemoteSandbox>;
  verifyPreview(url: string, expectedText: string): Promise<BrowserObservation>;
  artifacts: ArtifactWriter;
}
