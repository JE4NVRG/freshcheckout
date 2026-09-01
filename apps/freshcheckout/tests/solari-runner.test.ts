import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canonicalizeGitHubRepository } from "../src/core/github-url.js";
import { createInitialReceipt } from "../src/core/receipt.js";
import type { ParsedCheckoutContract } from "../src/core/checkout-contract.js";
import type { CommandSpec } from "../src/core/command-spec.js";
import type {
  ArtifactWriter,
  BrowserObservation,
  CommandOutput,
  LiveRunnerDependencies,
  PreviewResult,
  RemoteSandbox,
} from "../src/server/runner-contract.js";
import { RunStore } from "../src/server/run-store.js";
import { SolariRunner } from "../src/server/solari-runner.js";

const SHA = "a".repeat(40);
const REPOSITORY_URL = "https://github.com/solari-sdk/solari-cookbook";

class MemoryArtifacts implements ArtifactWriter {
  public readonly saved: string[] = [];

  public save(runId: string, name: "browser.png" | "browser-replay.ndjson", data: Uint8Array): Promise<string> {
    expect(data.byteLength).toBeGreaterThan(0);
    this.saved.push(name);
    return Promise.resolve(`/api/runs/${runId}/artifacts/${name}`);
  }

  public read(): Promise<{ bytes: Uint8Array; contentType: string }> {
    return Promise.reject(new Error("Not used by the runner test."));
  }
}

class FakeSandbox implements RemoteSandbox {
  public readonly id = "sandbox-test-1";
  public readonly commands: CommandSpec[] = [];
  public killed = false;
  public cloned = false;
  public failPurpose: CommandSpec["purpose"] | undefined;

  public clonePinned(repositoryUrl: string, defaultBranch: string, commitSha: string): Promise<void> {
    expect(repositoryUrl).toBe(REPOSITORY_URL);
    expect(defaultBranch).toBe("main");
    expect(commitSha).toBe(SHA);
    this.cloned = true;
    return Promise.resolve();
  }

  public readCheckoutContract(): Promise<ParsedCheckoutContract> {
    return Promise.resolve({
      hash: "b".repeat(64),
      contract: {
        version: 1,
        workingDirectory: "apps/web",
        commands: {
          install: { executable: "pnpm", args: ["install", "--frozen-lockfile"] },
          test: { executable: "pnpm", args: ["test"] },
          build: { executable: "pnpm", args: ["build"] },
          start: { executable: "pnpm", args: ["start"] },
        },
        port: 3_000,
        assertion: { text: "It works" },
      },
    });
  }

  public run(command: CommandSpec): Promise<CommandOutput> {
    this.commands.push(command);
    if (command.purpose === this.failPurpose) {
      return Promise.resolve({ exitCode: 1, stdout: "", stderr: "slr_live_should_never_leak" });
    }
    return Promise.resolve({
      exitCode: 0,
      stdout: command.purpose === "install" ? "SOLARI_API_KEY=slr_live_should_never_leak" : `${command.purpose} ok`,
      stderr: "",
    });
  }

  public startPreview(command: CommandSpec, port: number): Promise<PreviewResult> {
    this.commands.push(command);
    expect(port).toBe(3000);
    return Promise.resolve({ url: "https://preview.example.test" });
  }

  public kill(): Promise<void> {
    this.killed = true;
    return Promise.resolve();
  }
}

function browserObservation(): BrowserObservation {
  return {
    finalUrl: "https://preview.example.test/",
    title: "Known-good app",
    httpReachable: true,
    httpStatus: 200,
    visibleAssertion: "It works",
    consoleErrorCount: 0,
    failedRequestCount: 0,
    observedOriginHash: "c".repeat(64),
    sessionId: "browser-test-1",
    screenshot: new Uint8Array([137, 80, 78, 71]),
    replay: new TextEncoder().encode("{\"type\":\"meta\"}\n"),
  };
}

describe("SolariRunner", () => {
  let directory: string;
  let store: RunStore;
  let sandbox: FakeSandbox;
  let artifacts: MemoryArtifacts;
  let verifyPreview: ReturnType<typeof vi.fn<(url: string, expectedText: string) => Promise<BrowserObservation>>>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "freshcheckout-runner-"));
    store = new RunStore(directory);
    sandbox = new FakeSandbox();
    artifacts = new MemoryArtifacts();
    verifyPreview = vi.fn<(url: string, expectedText: string) => Promise<BrowserObservation>>().mockResolvedValue(browserObservation());
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function createRunner(): Promise<{ runner: SolariRunner; id: string }> {
    const receipt = await store.save(createInitialReceipt(
      canonicalizeGitHubRepository(REPOSITORY_URL),
      "solari",
    ));
    const dependencies: LiveRunnerDependencies = {
      resolveSource: () => Promise.resolve({ defaultBranch: "main", commitSha: SHA, sizeKb: 42 }),
      createSandbox: () => Promise.resolve(sandbox),
      verifyPreview,
      artifacts,
    };
    return { runner: new SolariRunner(store, dependencies), id: receipt.id };
  }

  it("produces verified evidence and destroys the sandbox", async () => {
    const { runner, id } = await createRunner();
    await runner.execute(id);

    const receipt = await store.get(id);
    expect(receipt.status).toBe("completed");
    expect(receipt.verdict).toBe("verified");
    expect(receipt.source.commitSha).toBe(SHA);
    expect(receipt.stages.every((stage) => stage.status === "passed")).toBe(true);
    expect(sandbox.cloned).toBe(true);
    expect(sandbox.killed).toBe(true);
    expect(sandbox.commands.map((command) => command.purpose)).toEqual(["install", "test", "build", "start"]);
    expect(verifyPreview).toHaveBeenCalledWith("https://preview.example.test", "It works");
    expect(receipt.checkout?.contractHash).toBe("b".repeat(64));
    expect(artifacts.saved).toEqual(["browser.png", "browser-replay.ndjson"]);
    expect(receipt.browser.screenshotPath).toContain("browser.png");
    expect(receipt.browser.replayCaptured).toBe(true);
    expect(receipt.browser.observedOriginHash).toBe("c".repeat(64));
    expect("sessionId" in receipt.browser).toBe(false);
    expect("finalUrl" in receipt.browser).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(sandbox.id);
    expect(receipt.logs.some((entry) => entry.message.includes("slr_live_should_never_leak"))).toBe(false);
    expect(receipt.logs.some((entry) => entry.message.includes("[REDACTED]"))).toBe(true);
  });

  it("rejects an HTTP error observation even when the browser provider returns text", async () => {
    verifyPreview.mockResolvedValue({
      ...browserObservation(),
      httpReachable: false,
      httpStatus: 500,
    });
    const { runner, id } = await createRunner();
    await runner.execute(id);

    const receipt = await store.get(id);
    expect(receipt.verdict).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "browser")?.status).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "cleanup")?.status).toBe("passed");
    expect(receipt.browser.screenshotPath).toBeUndefined();
    expect(sandbox.killed).toBe(true);
  });

  it("propagates browser cleanup failure into the receipt verdict", async () => {
    verifyPreview.mockRejectedValue(new Error("Browser cleanup failed."));
    const { runner, id } = await createRunner();
    await runner.execute(id);

    const receipt = await store.get(id);
    expect(receipt.verdict).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "browser")?.status).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "cleanup")?.status).toBe("passed");
    expect(receipt.logs.some((entry) => entry.message.includes("Browser cleanup failed"))).toBe(true);
    expect(sandbox.killed).toBe(true);
  });

  it("records a failed build, skips dependent stages, and still destroys the sandbox", async () => {
    sandbox.failPurpose = "build";
    const { runner, id } = await createRunner();
    await runner.execute(id);

    const receipt = await store.get(id);
    expect(receipt.status).toBe("failed");
    expect(receipt.verdict).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "build")?.status).toBe("failed");
    expect(receipt.stages.find((stage) => stage.name === "preview")?.status).toBe("skipped");
    expect(receipt.stages.find((stage) => stage.name === "browser")?.status).toBe("skipped");
    expect(receipt.stages.find((stage) => stage.name === "receipt")?.status).toBe("passed");
    expect(receipt.stages.find((stage) => stage.name === "cleanup")?.status).toBe("passed");
    expect(sandbox.killed).toBe(true);
    expect(verifyPreview).not.toHaveBeenCalled();
    expect(receipt.logs.some((entry) => entry.message.includes("slr_live_should_never_leak"))).toBe(false);
  });
});
