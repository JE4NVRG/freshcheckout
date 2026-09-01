import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalizeGitHubRepository } from "../src/core/github-url.js";
import { createInitialReceipt } from "../src/core/receipt.js";
import { RunStore } from "../src/server/run-store.js";

let directory = "";
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe("RunStore retention", () => {
  it("keeps only the newest configured receipts", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "freshcheckout-runs-"));
    const store = new RunStore(directory, 2, 60_000);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const receipt = createInitialReceipt(canonicalizeGitHubRepository("https://github.com/owner/repo"), "demo");
      ids.push((await store.save(receipt)).id);
      await wait(5);
    }
    await expect(store.get(ids[0] ?? "")).rejects.toThrow("was not found");
    await expect(store.get(ids[1] ?? "")).resolves.toBeDefined();
    await expect(store.get(ids[2] ?? "")).resolves.toBeDefined();
  });
});
