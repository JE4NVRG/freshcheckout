import { describe, expect, it, vi } from "vitest";

import type { Sandbox } from "@solarisdk/sdk";

import { connectSandboxOrKill, SolariSandboxAdapter } from "../src/server/solari-provider.js";

function fakeSandbox() {
  return {
    connect: vi.fn<() => Promise<void>>(),
    kill: vi.fn<() => Promise<void>>(),
  };
}

describe("connectSandboxOrKill", () => {
  it("returns a connected sandbox without killing it", async () => {
    const sandbox = fakeSandbox();
    sandbox.connect.mockResolvedValue();

    await expect(connectSandboxOrKill(sandbox)).resolves.toBe(sandbox);
    expect(sandbox.connect).toHaveBeenCalledOnce();
    expect(sandbox.kill).not.toHaveBeenCalled();
  });

  it("kills a created sandbox when connection fails", async () => {
    const sandbox = fakeSandbox();
    const connectionError = new Error("connect failed");
    sandbox.connect.mockRejectedValue(connectionError);
    sandbox.kill.mockResolvedValue();

    const failure = await connectSandboxOrKill(sandbox).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBe(connectionError);
    expect(sandbox.kill).toHaveBeenCalledOnce();
  });

  it("preserves both errors when connection and cleanup fail", async () => {
    const sandbox = fakeSandbox();
    const connectionError = new Error("connect failed");
    const cleanupError = new Error("kill failed");
    sandbox.connect.mockRejectedValue(connectionError);
    sandbox.kill.mockRejectedValue(cleanupError);

    const failure = await connectSandboxOrKill(sandbox).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([connectionError, cleanupError]);
  });
});

describe("SolariSandboxAdapter preview cleanup", () => {
  it("settles the preview wait before closing the sandbox channel", async () => {
    let rejectExit: (reason?: unknown) => void = () => undefined;
    const exit = new Promise<number>((_resolve, reject) => {
      rejectExit = reject;
    });
    const handle = {
      cmdId: "preview-test",
      stdin: vi.fn(),
      onData: vi.fn(),
      wait: vi.fn(() => exit),
      kill: vi.fn(() => {
        rejectExit(new Error("preview terminated"));
        return Promise.resolve();
      }),
    };
    const sandbox = {
      commands: {
        start: vi.fn(() => Promise.resolve(handle)),
        run: vi.fn(() => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })),
      },
      previewUrl: vi.fn(() => Promise.resolve({ url: "https://preview.example" })),
      kill: vi.fn(() => Promise.resolve()),
    };
    const adapter = new SolariSandboxAdapter(sandbox as unknown as Sandbox);

    await adapter.startPreview({
      executable: "npm",
      args: ["start"],
      purpose: "start",
      timeoutMs: 30_000,
    }, 4_317);
    await expect(adapter.kill()).resolves.toBeUndefined();

    expect(handle.wait).toHaveBeenCalledOnce();
    expect(handle.kill).toHaveBeenCalledOnce();
    expect(sandbox.kill).toHaveBeenCalledOnce();
    const previewKillOrder = handle.kill.mock.invocationCallOrder[0];
    const sandboxKillOrder = sandbox.kill.mock.invocationCallOrder[0];
    if (previewKillOrder === undefined || sandboxKillOrder === undefined) {
      throw new Error("Expected both cleanup calls to be recorded.");
    }
    expect(previewKillOrder).toBeLessThan(sandboxKillOrder);
  });
});
