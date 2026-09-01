export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface CommandSpec {
  executable: string;
  args: string[];
  purpose: "install" | "test" | "build" | "start";
  timeoutMs: number;
}

export interface NodeProjectInventory {
  files: string[];
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  packageManager?: string;
}

export interface NodeExecutionPlan {
  packageManager: PackageManager;
  framework: "next" | "vite" | "generic";
  install: CommandSpec;
  test?: CommandSpec;
  build?: CommandSpec;
  start?: CommandSpec;
  port: number;
}

function hasFile(files: string[], name: string): boolean {
  return files.some((file) => file.toLowerCase() === name.toLowerCase());
}

function hasDependency(inventory: NodeProjectInventory, name: string): boolean {
  return name in inventory.dependencies || name in inventory.devDependencies;
}

function choosePackageManager(inventory: NodeProjectInventory): PackageManager {
  if (hasFile(inventory.files, "pnpm-lock.yaml") || inventory.packageManager?.startsWith("pnpm@")) return "pnpm";
  if (hasFile(inventory.files, "yarn.lock") || inventory.packageManager?.startsWith("yarn@")) return "yarn";
  if (hasFile(inventory.files, "bun.lock") || hasFile(inventory.files, "bun.lockb") || inventory.packageManager?.startsWith("bun@")) return "bun";
  return "npm";
}

function runScript(manager: PackageManager, script: string, purpose: CommandSpec["purpose"], timeoutMs: number, extra: string[] = []): CommandSpec {
  if (manager === "npm") return { executable: "npm", args: ["run", script, "--", ...extra], purpose, timeoutMs };
  if (manager === "yarn") return { executable: "yarn", args: [script, ...extra], purpose, timeoutMs };
  if (manager === "bun") return { executable: "bun", args: ["run", script, ...extra], purpose, timeoutMs };
  return { executable: "pnpm", args: ["run", script, ...extra], purpose, timeoutMs };
}

export function planNodeProject(inventory: NodeProjectInventory): NodeExecutionPlan {
  const packageManager = choosePackageManager(inventory);
  const framework = hasDependency(inventory, "next") ? "next" : hasDependency(inventory, "vite") ? "vite" : "generic";
  const hasLock = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].some((name) => hasFile(inventory.files, name));

  const install: CommandSpec = packageManager === "npm"
    ? { executable: "npm", args: hasLock ? ["ci", "--no-audit", "--fund=false"] : ["install", "--no-audit", "--fund=false"], purpose: "install", timeoutMs: 180_000 }
    : packageManager === "pnpm"
      ? { executable: "pnpm", args: ["install", ...(hasLock ? ["--frozen-lockfile"] : [])], purpose: "install", timeoutMs: 180_000 }
      : packageManager === "yarn"
        ? { executable: "yarn", args: ["install", ...(hasLock ? ["--immutable"] : [])], purpose: "install", timeoutMs: 180_000 }
        : { executable: "bun", args: ["install", ...(hasLock ? ["--frozen-lockfile"] : [])], purpose: "install", timeoutMs: 180_000 };

  const testScript = inventory.scripts.test && !/no test specified/i.test(inventory.scripts.test) ? "test" : undefined;
  const buildScript = inventory.scripts.build ? "build" : undefined;
  const port = 3000;

  let start: CommandSpec | undefined;
  if (framework === "next" && inventory.scripts.start) {
    start = runScript(packageManager, "start", "start", 30_000, ["--hostname", "0.0.0.0", "--port", String(port)]);
  } else if (framework === "vite" && inventory.scripts.preview && buildScript) {
    start = runScript(packageManager, "preview", "start", 30_000, ["--host", "0.0.0.0", "--port", String(port)]);
  } else if (inventory.scripts.start) {
    start = runScript(packageManager, "start", "start", 30_000);
  } else if (inventory.scripts.dev) {
    start = runScript(packageManager, "dev", "start", 30_000, ["--host", "0.0.0.0", "--port", String(port)]);
  }

  return {
    packageManager,
    framework,
    install,
    ...(testScript ? { test: runScript(packageManager, testScript, "test", 120_000) } : {}),
    ...(buildScript ? { build: runScript(packageManager, buildScript, "build", 180_000) } : {}),
    ...(start ? { start } : {}),
    port,
  };
}
