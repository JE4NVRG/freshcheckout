import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const verifier = fileURLToPath(new URL("../scripts/verify-node-version.mjs", import.meta.url));

describe("Node runtime policy", () => {
  it("accepts the supported runtime used by local verification", () => {
    const result = spawnSync(process.execPath, [verifier], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Observed runtime ${process.version}`);
    expect(result.stderr).toBe("");
  });
});
