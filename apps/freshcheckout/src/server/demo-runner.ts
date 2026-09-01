import { boundLog } from "../core/redact.js";
import { appendReceiptLogs, completeReceipt, setStage } from "../core/receipt.js";
import type { LogEntry, RunReceipt, StageName } from "../core/model.js";
import type { RunStore } from "./run-store.js";

const DEFAULT_STEP_DELAY_MS = Number(process.env.FRESHCHECKOUT_DEMO_DELAY_MS ?? 180);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


function log(receipt: RunReceipt, stage: StageName, message: string, stream: LogEntry["stream"] = "system"): RunReceipt {
  return appendReceiptLogs(receipt, [{
    at: new Date().toISOString(),
    stage,
    stream,
    message: boundLog(message, 8_000),
  }]);
}

export class DemoRunner {
  private readonly stepDelayMs: number;

  public constructor(private readonly store: RunStore, stepDelayMs = DEFAULT_STEP_DELAY_MS) {
    this.stepDelayMs = stepDelayMs;
  }

  public async execute(id: string, scenario: "pass" | "fail"): Promise<void> {
    await this.store.update(id, (receipt) => ({ ...receipt, status: "running", updatedAt: new Date().toISOString() }));

    await this.pass(id, "resolve", "Built-in demo fixture selected. No repository was fetched or resolved.");
    await this.pass(id, "sandbox", "Simulated isolated Solari Sandbox allocated. No cloud resource was created.");
    await this.pass(id, "clone", "Built-in fixture loaded from application memory. No Git clone occurred.");
    await this.pass(id, "inspect", "Built-in fixture contract loaded. No freshcheckout.config.json was read from a repository.");
    await this.pass(id, "install", "Simulated npm install event. No package command was executed.", undefined, 0);
    await this.pass(id, "test", "Built-in fixture test stage marked passed before build evaluation.", undefined, 0);

    if (scenario === "fail") {
      await this.fail(id, "build", "Built-in failing fixture: the declared build step returned exit code 1.", 1);
      await this.skip(id, "preview", "Skipped because the build failed.");
      await this.skip(id, "browser", "Skipped because no preview was produced.");
      await this.pass(id, "receipt", "Failure fixture recorded in a demo receipt. Not valid verification evidence.");
      await this.pass(id, "cleanup", "Simulated sessions destroyed. No cloud resource existed.");
      await this.store.update(id, (receipt) => ({ ...completeReceipt(receipt, "failed"), status: "failed" }));
      return;
    }

    await this.pass(id, "build", "Simulated production build event marked successful.", undefined, 0);
    await this.pass(id, "preview", "Deterministic fixture exposed on the local demo route.");
    await this.pass(id, "browser", "Simulated Solari Browser assertion completed. This is demo evidence, not a cloud run.", (receipt) => ({
      ...receipt,
      browser: {
        ...receipt.browser,
        title: "Built-in passing fixture",
        visibleAssertion: "FreshCheckout tests the first run.",
        consoleErrorCount: 0,
        failedRequestCount: 0,
        replayCaptured: false,
      },
    }));
    await this.pass(id, "receipt", "Demo receipt generated. Not valid verification evidence.");
    await this.pass(id, "cleanup", "Simulated sessions destroyed. No cloud resource existed.");
    await this.store.update(id, (receipt) => completeReceipt(receipt, "demo"));
  }

  private async pass(
    id: string,
    stage: StageName,
    summary: string,
    mutate?: (receipt: RunReceipt) => RunReceipt,
    exitCode?: number,
  ): Promise<void> {
    await this.store.update(id, (receipt) => log(setStage(receipt, stage, "running"), stage, `DEMO: ${summary}`));
    await wait(this.stepDelayMs);
    await this.store.update(id, (receipt) => {
      const changed = mutate ? mutate(receipt) : receipt;
      return setStage(changed, stage, "passed", { summary, ...(exitCode !== undefined ? { exitCode } : {}) });
    });
  }

  private async fail(id: string, stage: StageName, summary: string, exitCode: number): Promise<void> {
    await this.store.update(id, (receipt) => log(setStage(receipt, stage, "running"), stage, `DEMO STDERR: ${summary}`, "stderr"));
    await wait(this.stepDelayMs);
    await this.store.update(id, (receipt) => setStage(receipt, stage, "failed", { summary, exitCode }));
  }

  private async skip(id: string, stage: StageName, summary: string): Promise<void> {
    await this.store.update(id, (receipt) => setStage(log(receipt, stage, `DEMO: ${summary}`), stage, "skipped", { summary }));
  }
}
