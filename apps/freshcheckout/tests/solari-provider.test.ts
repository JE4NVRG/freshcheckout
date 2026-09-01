import { describe, expect, it, vi } from "vitest";

import { connectSandboxOrKill } from "../src/server/solari-provider.js";

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
