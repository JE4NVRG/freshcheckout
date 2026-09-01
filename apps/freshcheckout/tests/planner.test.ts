import { describe, expect, it } from "vitest";

import { planNodeProject } from "../src/core/planner.js";

describe("planNodeProject", () => {
  it("plans a locked Vite project deterministically", () => {
    const plan = planNodeProject({
      files: ["package.json", "pnpm-lock.yaml"],
      packageManager: "pnpm@11.24.0",
      scripts: { test: "vitest run", build: "vite build", preview: "vite preview" },
      dependencies: { react: "19.2.8" },
      devDependencies: { vite: "8.2.2" },
    });

    expect(plan.packageManager).toBe("pnpm");
    expect(plan.framework).toBe("vite");
    expect(plan.install.args).toEqual(["install", "--frozen-lockfile"]);
    expect(plan.test?.args).toEqual(["run", "test"]);
    expect(plan.start?.args).toEqual(["run", "preview", "--host", "0.0.0.0", "--port", "3000"]);
  });

  it("uses npm ci and Next production start when a lockfile exists", () => {
    const plan = planNodeProject({
      files: ["package.json", "package-lock.json"],
      scripts: { test: "echo no test specified", build: "next build", start: "next start" },
      dependencies: { next: "16.3.4" },
      devDependencies: {},
    });

    expect(plan.install.executable).toBe("npm");
    expect(plan.install.args[0]).toBe("ci");
    expect(plan.test).toBeUndefined();
    expect(plan.start?.args).toContain("--hostname");
  });

  it("does not invent a start command", () => {
    const plan = planNodeProject({
      files: ["package.json"],
      scripts: {},
      dependencies: {},
      devDependencies: {},
    });

    expect(plan.start).toBeUndefined();
  });
});
