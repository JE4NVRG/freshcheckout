import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";

import type { Solari as SolariBrowserClient } from "@solarisdk/browser";
import { SolariClient, type CommandHandle, type Sandbox } from "@solarisdk/sdk";

import { parseCheckoutContract, type ParsedCheckoutContract } from "../core/checkout-contract.js";
import { boundLog } from "../core/redact.js";
import type { CommandSpec } from "../core/planner.js";
import type {
  BrowserObservation,
  CommandOutput,
  LiveRunnerDependencies,
  PreviewResult,
  RemoteSandbox,
} from "./runner-contract.js";
import { GitHubSourceResolver } from "./github-resolver.js";
import type { ArtifactStore } from "./artifact-store.js";

const WORK_DIRECTORY = "/workspace/repository";
const PREVIEW_ATTEMPTS = 35;
const COMMAND_OUTPUT_LIMIT_BYTES = 64_000;

export class SolariSandboxAdapter implements RemoteSandbox {
  private workingDirectory = WORK_DIRECTORY;
  private previewHandle: CommandHandle | undefined;
  private previewExit: Promise<number> | undefined;

  public constructor(private readonly sandbox: Sandbox) {}

  public async clonePinned(repositoryUrl: string, defaultBranch: string, commitSha: string): Promise<void> {
    await this.sandbox.git.clone(repositoryUrl, {
      path: WORK_DIRECTORY,
      branch: defaultBranch,
      depth: 1,
    });

    let [head] = await this.sandbox.git.log({ cwd: WORK_DIRECTORY, maxCount: 1 });
    if (head?.hash.toLowerCase() !== commitSha) {
      const fetched = await this.sandbox.commands.run("git", {
        args: ["fetch", "--depth", "1", "origin", commitSha],
        cwd: WORK_DIRECTORY,
        timeoutMs: 60_000,
      });
      if (fetched.exitCode !== 0) throw new Error(`Could not fetch pinned commit: ${boundLog(fetched.stderr, 500)}`);
      await this.sandbox.git.checkout(commitSha, { cwd: WORK_DIRECTORY });
      [head] = await this.sandbox.git.log({ cwd: WORK_DIRECTORY, maxCount: 1 });
    }

    if (head?.hash.toLowerCase() !== commitSha) {
      throw new Error("Observed repository HEAD does not match the resolved commit.");
    }
  }

  public async readCheckoutContract(): Promise<ParsedCheckoutContract> {
    let raw: string;
    try {
      raw = await this.sandbox.files.readText(`${WORK_DIRECTORY}/freshcheckout.config.json`);
    } catch {
      throw new Error("Live verification requires freshcheckout.config.json at the repository root.");
    }
    if (raw.length > 64_000) throw new Error("freshcheckout.config.json exceeds the 64 KB contract limit.");
    let input: unknown;
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("freshcheckout.config.json is not valid JSON.");
    }
    const parsed = parseCheckoutContract(input);
    this.workingDirectory = parsed.contract.workingDirectory === "."
      ? WORK_DIRECTORY
      : `${WORK_DIRECTORY}/${parsed.contract.workingDirectory}`;
    return parsed;
  }

  public async run(command: CommandSpec): Promise<CommandOutput> {
    const handle = await this.sandbox.commands.start(command.executable, {
      args: command.args,
      cwd: this.workingDirectory,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let overflow = false;
    let timedOut = false;
    let killPromise: Promise<void> | undefined;
    const requestKill = () => {
      killPromise ??= handle.kill().catch(() => undefined);
      return killPromise;
    };

    handle.onData((chunk) => {
      if (overflow || !chunk.data) return;
      const bytes = Buffer.from(chunk.data, "utf8");
      const remaining = Math.max(0, COMMAND_OUTPUT_LIMIT_BYTES - outputBytes);
      const acceptedBytes = bytes.subarray(0, remaining);
      const accepted = acceptedBytes.toString("utf8");
      outputBytes += acceptedBytes.byteLength;
      if (chunk.stream === "stdout") stdout += accepted;
      else stderr += accepted;
      if (bytes.byteLength > remaining) {
        overflow = true;
        void requestKill();
      }
    });

    const exit = handle.wait();
    void exit.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        void requestKill();
        reject(new Error(`Declared command exceeded its ${command.timeoutMs} ms timeout.`));
      }, command.timeoutMs);
    });

    try {
      const exitCode = await Promise.race([exit, timeout]);
      if (overflow) throw new Error("Declared command output exceeded the 64 KB limit.");
      return { exitCode, stdout, stderr };
    } catch (error) {
      if (overflow) throw new Error("Declared command output exceeded the 64 KB limit.", { cause: error });
      if (timedOut) throw new Error(`Declared command exceeded its ${command.timeoutMs} ms timeout.`, { cause: error });
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (killPromise) await killPromise;
    }
  }

  public async startPreview(command: CommandSpec, port: number): Promise<PreviewResult> {
    const handle: CommandHandle = await this.sandbox.commands.start(command.executable, {
      args: command.args,
      cwd: this.workingDirectory,
    });
    this.previewHandle = handle;
    this.previewExit = handle.wait();
    void this.previewExit.catch(() => undefined);

    try {
      for (let attempt = 0; attempt < PREVIEW_ATTEMPTS; attempt += 1) {
        const probe = await this.sandbox.commands.run("node", {
          args: [
            "-e",
            `const net=require('node:net');const s=net.createConnection({host:'127.0.0.1',port:${port}},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1500)`,
          ],
          cwd: this.workingDirectory,
          timeoutMs: 3_000,
        });
        if (probe.exitCode === 0) return this.sandbox.previewUrl(port);
        await wait(1_000);
      }
      throw new Error(`Preview did not listen on port ${port} within the bounded startup window.`);
    } catch (error) {
      await this.stopPreview();
      throw error;
    }
  }

  public async kill(): Promise<void> {
    await this.stopPreview();
    await this.sandbox.kill();
  }

  private async stopPreview(): Promise<void> {
    const handle = this.previewHandle;
    const exit = this.previewExit;
    this.previewHandle = undefined;
    this.previewExit = undefined;
    if (!handle) return;

    await handle.kill().catch(() => undefined);
    if (exit) {
      await Promise.race([exit.catch(() => undefined), wait(5_000)]);
    }
  }
}

export async function connectSandboxOrKill<T extends { connect(): Promise<unknown>; kill(): Promise<void> }>(sandbox: T): Promise<T> {
  try {
    await sandbox.connect();
    return sandbox;
  } catch (connectionError) {
    try {
      await sandbox.kill();
    } catch (cleanupError) {
      throw new AggregateError(
        [connectionError, cleanupError],
        "Solari Sandbox connection failed and immediate cleanup also failed.",
        { cause: cleanupError },
      );
    }
    throw new Error("Solari Sandbox connection failed; the created resource was destroyed.", {
      cause: connectionError,
    });
  }
}

async function verifyWithSolariBrowser(apiKey: string, url: string, expectedText: string): Promise<BrowserObservation> {
  const { Solari } = await import("@solarisdk/browser");
  const client = new Solari({ apiKey, timeoutMs: 90_000 });
  let browser: Awaited<ReturnType<SolariBrowserClient["launch"]>> | undefined;
  let sessionId = "";
  let replay: Uint8Array | undefined;
  let observation: Omit<BrowserObservation, "replay"> | undefined;
  let operationError: unknown;
  const cleanupErrors: Error[] = [];

  try {
    browser = await client.launch({ recording: true, retries: 1, probe: true });
    sessionId = browser.id;
    const expectedOrigin = new URL(url).origin;
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      try {
        const parsed = new URL(requestUrl);
        if (parsed.origin === expectedOrigin || parsed.protocol === "data:" || parsed.protocol === "blob:") {
          await route.continue();
          return;
        }
      } catch {
        // Invalid and non-standard URLs fail closed.
      }
      await route.abort("blockedbyclient");
    });

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(boundLog(message.text(), 500));
    });
    page.on("pageerror", (error) => consoleErrors.push(boundLog(error.message, 500)));
    page.on("requestfailed", (request) => failedRequests.push(boundLog(request.url(), 500)));

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_000);
    if (!response || response.status() >= 400) {
      throw new Error(`Preview returned HTTP ${response?.status() ?? "no response"}.`);
    }
    if (new URL(page.url()).origin !== expectedOrigin) {
      throw new Error("Browser left the Solari preview origin.");
    }
    const title = await page.title();
    const bodyText = boundLog(await page.locator("body").innerText(), 2_000).trim();
    if (!bodyText) throw new Error("Browser reached the preview, but the rendered body was empty.");
    if (!bodyText.includes(expectedText)) {
      throw new Error("Browser reached the preview, but the declared visible text was not observed.");
    }
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });

    observation = {
      finalUrl: page.url(),
      title,
      httpReachable: true,
      httpStatus: response.status(),
      visibleAssertion: expectedText,
      consoleErrorCount: consoleErrors.length,
      failedRequestCount: failedRequests.length,
      observedOriginHash: createHash("sha256").update(expectedOrigin).digest("hex"),
      sessionId,
      screenshot: new Uint8Array(screenshot),
    };
  } catch (error) {
    operationError = error;
  } finally {
    if (browser) {
      let browserReleased = false;
      try {
        await browser.close();
        browserReleased = true;
      } catch {
        cleanupErrors.push(new Error("Solari Browser session release failed."));
      }
      if (browserReleased && sessionId) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          try {
            replay = await client.sessions.downloadReplay(sessionId);
            break;
          } catch {
            await wait(1_500);
          }
        }
      }
    }
    try {
      await client.close();
    } catch {
      cleanupErrors.push(new Error("Solari Browser client proxy cleanup failed."));
    }
  }

  if (operationError && cleanupErrors.length > 0) {
    throw new AggregateError([operationError, ...cleanupErrors], "Browser verification and cleanup failed.");
  }
  if (operationError instanceof Error) throw operationError;
  if (operationError !== undefined) throw new Error("Browser verification failed with a non-error value.");
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "Browser cleanup failed.");
  if (!observation) throw new Error("Browser verification did not produce an observation.");
  return { ...observation, ...(replay ? { replay } : {}) };
}

export function createLiveDependencies(apiKey: string, artifacts: ArtifactStore): LiveRunnerDependencies {
  const client = new SolariClient({ apiKey, callTimeoutMs: 90_000 });
  const resolver = new GitHubSourceResolver();

  return {
    resolveSource: (owner, repository) => resolver.resolve(owner, repository),
    createSandbox: async (runId) => {
      const sandbox = await client.sandboxes.create({
        template: "code",
        cpu: 1,
        memMb: 2_048,
        diskGb: 10,
        timeoutMs: 600_000,
        lifecycle: { onTimeout: "kill" },
        metadata: { app: "freshcheckout", runId },
      });
      return new SolariSandboxAdapter(await connectSandboxOrKill(sandbox));
    },
    verifyPreview: (url, expectedText) => verifyWithSolariBrowser(apiKey, url, expectedText),
    artifacts,
  };
}
