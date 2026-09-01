import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { receiptSchema, type RunReceipt } from "../core/model.js";

const REPLACE_ATTEMPTS = 8;
const RETRYABLE_REPLACE_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);

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

  public constructor(directory = path.resolve(process.cwd(), ".freshcheckout", "runs")) {
    this.directory = directory;
  }

  public async save(receipt: RunReceipt): Promise<RunReceipt> {
    await mkdir(this.directory, { recursive: true });
    const parsed = receiptSchema.parse(receipt);
    const target = this.pathFor(parsed.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, target);
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
}
