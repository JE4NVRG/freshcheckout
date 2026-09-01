import { contractCommand } from "../core/checkout-contract.js";
import { boundLog } from "../core/redact.js";
import { appendReceiptLogs, completeReceipt, setStage } from "../core/receipt.js";
import type { CommandSpec } from "../core/planner.js";
import type { LogEntry, RunReceipt, StageName, Verdict } from "../core/model.js";
import type { LiveRunnerDependencies, RemoteSandbox } from "./runner-contract.js";
import type { RunStore } from "./run-store.js";

interface StageResult<T> {
  value: T;
  summary: string;
  mutate?: (receipt: RunReceipt, value: T) => RunReceipt;
}

function safeError(error: unknown): string {
  return boundLog(error instanceof Error ? error.message : "Unknown runner failure.", 500);
}

function appendLog(
  receipt: RunReceipt,
  stage: StageName,
  stream: LogEntry["stream"],
  message: string,
): RunReceipt {
  return appendReceiptLogs(receipt, [{
    at: new Date().toISOString(),
    stage,
    stream,
    message: boundLog(message, 8_000),
  }]);
}

function commandLogs(receipt: RunReceipt, stage: StageName, stdout: string, stderr: string): RunReceipt {
  const entries: Array<[LogEntry["stream"], string]> = [
    ...stdout.split(/\r?\n/).filter(Boolean).slice(-30).map((line): ["stdout", string] => ["stdout", line]),
    ...stderr.split(/\r?\n/).filter(Boolean).slice(-30).map((line): ["stderr", string] => ["stderr", line]),
  ];
  return appendReceiptLogs(receipt, entries.slice(-50).map(([stream, line]) => ({
    at: new Date().toISOString(),
    stage,
    stream,
    message: boundLog(line, 8_000),
  })));
}

export class SolariRunner {
  public constructor(
    private readonly store: RunStore,
    private readonly dependencies: LiveRunnerDependencies,
  ) {}

  public async execute(id: string): Promise<void> {
    let sandbox: RemoteSandbox | undefined;
    let failed = false;

    await this.store.update(id, (receipt) => ({ ...receipt, status: "running", updatedAt: new Date().toISOString() }));

    try {
      const initial = await this.store.get(id);
      const source = await this.stage(id, "resolve", async () => {
        const resolved = await this.dependencies.resolveSource(initial.source.owner, initial.source.repository);
        return {
          value: resolved,
          summary: `Pinned ${resolved.defaultBranch} at ${resolved.commitSha.slice(0, 12)} (${resolved.sizeKb} KB).`,
          mutate: (receipt: RunReceipt) => ({
            ...receipt,
            source: {
              ...receipt.source,
              defaultBranch: resolved.defaultBranch,
              commitSha: resolved.commitSha,
            },
          }),
        };
      });

      sandbox = await this.stage(id, "sandbox", async () => {
        const created = await this.dependencies.createSandbox(id);
        return { value: created, summary: "Solari Sandbox connected with a kill-on-timeout lifecycle." };
      });

      await this.stage(id, "clone", async () => {
        await sandbox?.clonePinned(initial.source.canonicalUrl, source.defaultBranch, source.commitSha);
        return { value: undefined, summary: `Observed HEAD matches pinned commit ${source.commitSha.slice(0, 12)}.` };
      });

      const checkout = await this.stage(id, "inspect", async () => {
        if (!sandbox) throw new Error("Sandbox was not created.");
        const declared = await sandbox.readCheckoutContract();
        return {
          value: declared,
          summary: `Loaded declared checkout contract ${declared.hash.slice(0, 12)} from ${declared.contract.workingDirectory}.`,
          mutate: (receipt: RunReceipt) => ({
            ...receipt,
            checkout: {
              contractPath: "freshcheckout.config.json",
              contractHash: declared.hash,
              workingDirectory: declared.contract.workingDirectory,
              expectedText: declared.contract.assertion.text,
            },
          }),
        };
      });
      const install = contractCommand(checkout.contract, "install");
      const test = contractCommand(checkout.contract, "test");
      const build = contractCommand(checkout.contract, "build");
      const start = contractCommand(checkout.contract, "start");
      if (!install || !build || !start) throw new Error("Checkout contract is missing a required command.");

      await this.commandStage(id, "install", sandbox, install, "Declared install command passed in a clean checkout.");
      if (test) {
        await this.commandStage(id, "test", sandbox, test, "Declared test command passed.");
      } else {
        await this.skip(id, "test", "Checkout contract does not declare a test command.");
      }

      await this.commandStage(id, "build", sandbox, build, "Declared build command passed.");

      const preview = await this.stage(id, "preview", async () => {
        if (!sandbox) throw new Error("Sandbox was not created.");
        const started = await sandbox.startPreview(start, checkout.contract.port);
        return { value: started, summary: `Declared port ${checkout.contract.port} is reachable through Solari preview.` };
      });

      await this.stage(id, "browser", async () => {
        const observation = await this.dependencies.verifyPreview(preview.url, checkout.contract.assertion.text);
        if (!observation.httpReachable || (observation.httpStatus !== undefined && observation.httpStatus >= 400)) {
          throw new Error(`Browser observation failed with HTTP ${observation.httpStatus ?? "no response"}.`);
        }
        const screenshotPath = await this.dependencies.artifacts.save(id, "browser.png", observation.screenshot);
        const replayCaptured = Boolean(observation.replay);
        if (observation.replay) {
          await this.dependencies.artifacts.save(id, "browser-replay.ndjson", observation.replay);
        }
        return {
          value: observation,
          summary: `Rendered “${observation.title || "untitled page"}” with ${observation.consoleErrorCount} console errors.`,
          mutate: (receipt: RunReceipt) => ({
            ...receipt,
            browser: {
              title: observation.title,
              httpReachable: observation.httpReachable,
              ...(observation.httpStatus ? { httpStatus: observation.httpStatus } : {}),
              visibleAssertion: observation.visibleAssertion,
              consoleErrorCount: observation.consoleErrorCount,
              failedRequestCount: observation.failedRequestCount,
              observedOriginHash: observation.observedOriginHash,
              screenshotPath,
              replayCaptured,
            },
          }),
        };
      });

      await this.stage(id, "receipt", () => Promise.resolve({
        value: undefined,
        summary: "Machine-readable execution receipt generated from observed stages.",
      }));
    } catch (error) {
      failed = true;
      const message = safeError(error);
      await this.markPendingSkipped(id, message);
      await this.ensureReceiptStage(id, `Failure receipt generated: ${message}`);
    } finally {
      try {
        await this.cleanup(id, sandbox);
      } catch {
        failed = true;
      }

      const receipt = await this.store.get(id);
      const hasFailedStage = receipt.stages.some((stage) => stage.status === "failed");
      const hasSkippedStage = receipt.stages.some((stage) => stage.status === "skipped" && stage.name !== "test");
      const verdict: Verdict = failed || hasFailedStage ? "failed" : hasSkippedStage ? "partial" : "verified";
      await this.store.save(completeReceipt(receipt, verdict));
    }
  }

  private async stage<T>(id: string, name: StageName, action: () => Promise<StageResult<T>>): Promise<T> {
    await this.store.update(id, (receipt) => appendLog(setStage(receipt, name, "running"), name, "system", `Starting ${name}.`));
    try {
      const result = await action();
      await this.store.update(id, (receipt) => {
        const changed = result.mutate ? result.mutate(receipt, result.value) : receipt;
        return appendLog(setStage(changed, name, "passed", { summary: result.summary }), name, "system", result.summary);
      });
      return result.value;
    } catch (error) {
      const message = safeError(error);
      await this.store.update(id, (receipt) => appendLog(
        setStage(receipt, name, "failed", { summary: message }),
        name,
        "stderr",
        message,
      ));
      throw error;
    }
  }

  private async commandStage(
    id: string,
    name: StageName,
    sandbox: RemoteSandbox,
    command: CommandSpec,
    summary: string,
  ): Promise<void> {
    await this.stage(id, name, async () => {
      const output = await sandbox.run(command);
      await this.store.update(id, (receipt) => commandLogs(receipt, name, output.stdout, output.stderr));
      if (output.exitCode !== 0) throw new Error(`${name} exited with code ${output.exitCode}.`);
      return { value: undefined, summary, mutate: (receipt: RunReceipt) => receipt };
    });
  }

  private async skip(id: string, name: StageName, summary: string): Promise<void> {
    await this.store.update(id, (receipt) => appendLog(
      setStage(receipt, name, "skipped", { summary }),
      name,
      "system",
      summary,
    ));
  }

  private async markPendingSkipped(id: string, failure: string): Promise<void> {
    await this.store.update(id, (receipt) => ({
      ...receipt,
      updatedAt: new Date().toISOString(),
      stages: receipt.stages.map((stage) => stage.status === "pending" && !["receipt", "cleanup"].includes(stage.name)
        ? { ...stage, status: "skipped" as const, completedAt: new Date().toISOString(), summary: `Skipped after failure: ${failure}` }
        : stage),
    }));
  }

  private async ensureReceiptStage(id: string, summary: string): Promise<void> {
    const receipt = await this.store.get(id);
    const stage = receipt.stages.find((candidate) => candidate.name === "receipt");
    if (stage?.status === "pending") {
      await this.store.update(id, (current) => appendLog(setStage(current, "receipt", "passed", { summary }), "receipt", "system", summary));
    }
  }

  private async cleanup(id: string, sandbox?: RemoteSandbox): Promise<void> {
    await this.store.update(id, (receipt) => setStage(receipt, "cleanup", "running"));
    try {
      if (sandbox) await sandbox.kill();
      const summary = sandbox ? "Solari Sandbox destroyed." : "No remote resource was created.";
      await this.store.update(id, (receipt) => appendLog(setStage(receipt, "cleanup", "passed", { summary }), "cleanup", "system", summary));
    } catch (error) {
      const message = `Cleanup failed: ${safeError(error)}`;
      await this.store.update(id, (receipt) => appendLog(setStage(receipt, "cleanup", "failed", { summary: message }), "cleanup", "stderr", message));
      throw error;
    }
  }
}
