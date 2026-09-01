import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../src/server/artifact-store.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("ArtifactStore limits", () => {
  it("rejects screenshots above 5 MB", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "freshcheckout-artifacts-"));
    const store = new ArtifactStore(root);
    await expect(store.save("11111111-1111-4111-8111-111111111111", "browser.png", new Uint8Array(5 * 1024 * 1024 + 1)))
      .rejects.toThrow("exceeds its 5 MB limit");
  });

  it("prunes artifacts from older runs", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "freshcheckout-artifacts-"));
    const store = new ArtifactStore(root, 1, 60_000);
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    await store.save(first, "browser.png", new Uint8Array([1]));
    await wait(5);
    await store.save(second, "browser.png", new Uint8Array([2]));
    await expect(store.read(first, "browser.png")).rejects.toThrow("was not found");
    await expect(store.read(second, "browser.png")).resolves.toMatchObject({ contentType: "image/png" });
  });
});
