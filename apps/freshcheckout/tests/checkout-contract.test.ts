import { describe, expect, it } from "vitest";

import { contractCommand, parseCheckoutContract } from "../src/core/checkout-contract.js";

const VALID = {
  version: 1,
  workingDirectory: "apps/web",
  commands: {
    install: { executable: "pnpm", args: ["install", "--frozen-lockfile"] },
    test: { executable: "pnpm", args: ["test"] },
    build: { executable: "pnpm", args: ["build"] },
    start: { executable: "pnpm", args: ["start"] },
  },
  port: 3_000,
  assertion: { text: "Welcome" },
} as const;

describe("FreshCheckout contract", () => {
  it("parses a bounded declared checkout and produces a stable hash", () => {
    const first = parseCheckoutContract(VALID);
    const second = parseCheckoutContract(structuredClone(VALID));

    expect(first.contract.workingDirectory).toBe("apps/web");
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(second.hash);
    expect(contractCommand(first.contract, "build")).toEqual({
      executable: "pnpm",
      args: ["build"],
      purpose: "build",
      timeoutMs: 180_000,
    });
  });

  it.each([
    ["absolute path", { ...VALID, workingDirectory: "/workspace" }],
    ["windows path", { ...VALID, workingDirectory: "C:\\repo" }],
    ["traversal", { ...VALID, workingDirectory: "apps/../secret" }],
    ["shell executable", { ...VALID, commands: { ...VALID.commands, build: { executable: "sh -c", args: ["build"] } } }],
    ["shell operator", { ...VALID, commands: { ...VALID.commands, build: { executable: "pnpm", args: ["build", "&&", "curl"] } } }],
    ["low port", { ...VALID, port: 80 }],
    ["empty assertion", { ...VALID, assertion: { text: "" } }],
  ])("rejects %s", (_label, candidate) => {
    expect(() => parseCheckoutContract(candidate)).toThrow();
  });

  it("allows root working directory and an omitted test command", () => {
    const commands = { ...VALID.commands };
    delete (commands as Partial<typeof commands>).test;
    const parsed = parseCheckoutContract({ ...VALID, workingDirectory: ".", commands });

    expect(parsed.contract.workingDirectory).toBe(".");
    expect(contractCommand(parsed.contract, "test")).toBeUndefined();
  });
});
