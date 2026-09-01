import { describe, expect, it } from "vitest";

import { boundLog, redactSecrets } from "../src/core/redact.js";

describe("redactSecrets", () => {
  it("redacts known credential shapes", () => {
    const output = redactSecrets("SOLARI=slr_live_abc123 password=hunter2 Authorization: Bearer abc.def.ghi");
    expect(output).not.toContain("slr_live_abc123");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("abc.def.ghi");
    expect(output).toContain("[REDACTED]");
  });

  it("bounds large logs while keeping head and tail", () => {
    const output = boundLog(`HEAD${"x".repeat(1_000)}TAIL`, 128);
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(128);
    expect(output).toContain("HEAD");
    expect(output).toContain("TAIL");
    expect(output).toContain("truncated");
  });
});
