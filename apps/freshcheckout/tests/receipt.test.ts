import { describe, expect, it } from "vitest";

import { canonicalizeGitHubRepository } from "../src/core/github-url.js";
import { receiptSchema, type LogEntry } from "../src/core/model.js";
import { appendReceiptLogs, createInitialReceipt, EXECUTION_POLICY } from "../src/core/receipt.js";

describe("receipt log budget", () => {
  it("keeps serialized persisted logs within the declared byte cap", () => {
    let receipt = createInitialReceipt(
      canonicalizeGitHubRepository("https://github.com/owner/repository"),
      "solari",
    );

    for (let index = 0; index < 200; index += 1) {
      const entry: LogEntry = {
        at: new Date(1_700_000_000_000 + index).toISOString(),
        stage: "build",
        stream: "stdout",
        message: `${String(index).padStart(3, "0")}:${"x".repeat(7_900)}`,
      };
      receipt = appendReceiptLogs(receipt, [entry]);
    }

    const bytes = new TextEncoder().encode(JSON.stringify(receipt.logs)).byteLength;
    expect(bytes).toBeLessThanOrEqual(EXECUTION_POLICY.maxLogBytes);
    expect(receipt.logs.at(-1)?.message.startsWith("199:")).toBe(true);
    expect(receipt.logs.length).toBeLessThan(200);
    expect(() => receiptSchema.parse(receipt)).not.toThrow();
  });
});
