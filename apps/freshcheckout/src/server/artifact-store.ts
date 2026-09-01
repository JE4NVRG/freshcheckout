import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArtifactWriter } from "./runner-contract.js";
import { RunNotFoundError } from "./run-store.js";

const ARTIFACT_TYPES = new Map<string, string>([
  ["browser.png", "image/png"],
  ["browser-replay.ndjson", "application/x-ndjson; charset=utf-8"],
]);

export class ArtifactNotFoundError extends Error {
  public constructor(runId: string, name: string) {
    super(`Artifact ${name} for run ${runId} was not found.`);
    this.name = "ArtifactNotFoundError";
  }
}

export class ArtifactStore implements ArtifactWriter {
  public constructor(private readonly root = path.resolve(process.cwd(), ".freshcheckout", "artifacts")) {}

  public async save(
    runId: string,
    name: "browser.png" | "browser-replay.ndjson",
    data: Uint8Array,
  ): Promise<string> {
    this.assertRunId(runId);
    if (!ARTIFACT_TYPES.has(name)) throw new ArtifactNotFoundError(runId, name);
    const directory = path.join(this.root, runId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), data, { flag: "wx" });
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
}
