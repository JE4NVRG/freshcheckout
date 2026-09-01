import { readFile } from "node:fs/promises";

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
    ["bare bash executable", { ...VALID, commands: { ...VALID.commands, build: { executable: "bash", args: ["-c", "build"] } } }],
    ["PowerShell executable", { ...VALID, commands: { ...VALID.commands, build: { executable: "pwsh", args: ["-Command", "build"] } } }],
    ["wrapper executable", { ...VALID, commands: { ...VALID.commands, build: { executable: "env", args: ["bash", "-c", "build"] } } }],
    ["inline interpreter code", { ...VALID, commands: { ...VALID.commands, build: { executable: "python", args: ["-c", "print(1)"] } } }],
    ["command substitution", { ...VALID, commands: { ...VALID.commands, build: { executable: "node", args: ["script.js", "$(touch marker)"] } } }],
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

  it("keeps the canonical repository contract on pinned Node 22 tooling", async () => {
    const raw = await readFile(new URL("../../../freshcheckout.config.json", import.meta.url), "utf8");
    const parsed = parseCheckoutContract(JSON.parse(raw) as unknown).contract;

    for (const name of ["install", "test", "build"] as const) {
      expect(parsed.commands[name]?.executable).toBe("npx");
      expect(parsed.commands[name]?.args).toContain("--package=node@22.22.0");
      expect(parsed.commands[name]?.args).toContain("--package=npm@10.9.4");
    }
    expect(parsed.commands.start.executable).toBe("npx");
    expect(parsed.commands.start.args).toContain("--package=node@22.22.0");
  });
});
