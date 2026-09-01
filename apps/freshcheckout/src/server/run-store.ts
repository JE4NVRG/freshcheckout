import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { receiptSchema, type RunReceipt } from "../core/model.js";

const REPLACE_ATTEMPTS = 8;
const RETRYABLE_REPLACE_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function replaceFile(temporary: string, target: string): Promise<void> {
  for (let attempt = 0; attempt < REPLACE_ATTEMPTS; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      const retryable = RETRYABLE_REPLACE_ERRORS.has(errorCode(error) ?? "");
      if (!retryable || attempt === REPLACE_ATTEMPTS - 1) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
      await wait(10 * (2 ** attempt));
    }
  }
}

export class RunNotFoundError extends Error {
  public constructor(id: string) {
    super(`Run ${id} was not found.`);
    this.name = "RunNotFoundError";
  }
}

export class RunStore {
  private readonly directory: string;
  private pruneQueue = Promise.resolve();

  public constructor(
    directory = path.resolve(process.cwd(), ".freshcheckout", "runs"),
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly maxAgeMs = DEFAULT_MAX_AGE_MS,
  ) {
    this.directory = directory;
  }

  public async save(receipt: RunReceipt): Promise<RunReceipt> {
    await mkdir(this.directory, { recursive: true });
    const parsed = receiptSchema.parse(receipt);
    const target = this.pathFor(parsed.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, target);
    await this.queuePrune();
    return parsed;
  }

  public async get(id: string): Promise<RunReceipt> {
    try {
      const raw = await readFile(this.pathFor(id), "utf8");
      return receiptSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        throw new RunNotFoundError(id);
      }
      throw error;
    }
  }

  public async update(id: string, transform: (current: RunReceipt) => RunReceipt): Promise<RunReceipt> {
    const current = await this.get(id);
    return this.save(transform(current));
  }

  private pathFor(id: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new RunNotFoundError(id);
    }
    return path.join(this.directory, `${id}.json`);
  }

  private async queuePrune(): Promise<void> {
    this.pruneQueue = this.pruneQueue.then(() => this.prune(), () => this.prune());
    await this.pruneQueue;
  }

  private async prune(): Promise<void> {
    const names = (await readdir(this.directory)).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name));
    const files = await Promise.all(names.map(async (name) => {
      const target = path.join(this.directory, name);
      return { target, modifiedAt: (await stat(target)).mtimeMs };
    }));
    files.sort((left, right) => right.modifiedAt - left.modifiedAt);
    const now = Date.now();
    await Promise.all(files.map(async (file, index) => {
      if (index < this.maxEntries && now - file.modifiedAt <= this.maxAgeMs) return;
      await unlink(file.target).catch((error: unknown) => {
        if (errorCode(error) !== "ENOENT") throw error;
      });
    }));
  }
}
