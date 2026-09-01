import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArtifactWriter } from "./runner-contract.js";
import { RunNotFoundError } from "./run-store.js";

const ARTIFACT_TYPES = new Map<string, string>([
  ["browser.png", "image/png"],
  ["browser-replay.ndjson", "application/x-ndjson; charset=utf-8"],
]);
const ARTIFACT_LIMITS = new Map<string, number>([
  ["browser.png", 5 * 1024 * 1024],
  ["browser-replay.ndjson", 25 * 1024 * 1024],
]);
const DEFAULT_MAX_RUNS = 100;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export class ArtifactNotFoundError extends Error {
  public constructor(runId: string, name: string) {
    super(`Artifact ${name} for run ${runId} was not found.`);
    this.name = "ArtifactNotFoundError";
  }
}

export class ArtifactTooLargeError extends Error {
  public constructor(name: string, limit: number) {
    super(`Artifact ${name} exceeds its ${Math.round(limit / 1024 / 1024)} MB limit.`);
    this.name = "ArtifactTooLargeError";
  }
}

export class ArtifactStore implements ArtifactWriter {
  private pruneQueue = Promise.resolve();

  public constructor(
    private readonly root = path.resolve(process.cwd(), ".freshcheckout", "artifacts"),
    private readonly maxRuns = DEFAULT_MAX_RUNS,
    private readonly maxAgeMs = DEFAULT_MAX_AGE_MS,
  ) {}

  public async save(
    runId: string,
    name: "browser.png" | "browser-replay.ndjson",
    data: Uint8Array,
  ): Promise<string> {
    this.assertRunId(runId);
    if (!ARTIFACT_TYPES.has(name)) throw new ArtifactNotFoundError(runId, name);
    const limit = ARTIFACT_LIMITS.get(name);
    if (limit === undefined || data.byteLength > limit) throw new ArtifactTooLargeError(name, limit ?? 0);
    const directory = path.join(this.root, runId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), data, { flag: "wx" });
    await this.queuePrune();
    return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`;
  }

  public async read(runId: string, name: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    this.assertRunId(runId);
    const contentType = ARTIFACT_TYPES.get(name);
    if (!contentType) throw new ArtifactNotFoundError(runId, name);
    try {
      const bytes = await readFile(path.join(this.root, runId, name));
      return { bytes: new Uint8Array(bytes), contentType };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        throw new ArtifactNotFoundError(runId, name);
      }
      throw error;
    }
  }

  private assertRunId(runId: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new RunNotFoundError(runId);
  }

  private async queuePrune(): Promise<void> {
    this.pruneQueue = this.pruneQueue.then(() => this.prune(), () => this.prune());
    await this.pruneQueue;
  }

  private async prune(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true });
    const directories = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const target = path.join(this.root, entry.name);
      return { target, modifiedAt: (await stat(target)).mtimeMs };
    }));
    directories.sort((left, right) => right.modifiedAt - left.modifiedAt);
    const now = Date.now();
    await Promise.all(directories.map(async (directory, index) => {
      if (index < this.maxRuns && now - directory.modifiedAt <= this.maxAgeMs) return;
      await rm(directory.target, { recursive: true, force: true });
    }));
  }
}
