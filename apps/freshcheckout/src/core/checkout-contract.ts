import { createHash } from "node:crypto";

import { z } from "zod";

import type { CommandSpec } from "./command-spec.js";

const FORBIDDEN_SHELL_CHARACTERS = /[;&|`><\r\n]/;
const EXECUTABLE_PATTERN = /^[A-Za-z0-9@._+-]{1,80}$/;
const FORBIDDEN_SHELL_EXECUTABLES = new Set([
  "bash", "cmd", "cmd.exe", "dash", "fish", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "sh", "zsh",
]);
const FORBIDDEN_WRAPPER_EXECUTABLES = new Set(["busybox", "env", "xargs"]);
const FORBIDDEN_INLINE_CODE_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set(["-e", "--eval", "-p", "--print"]),
  perl: new Set(["-e"]),
  php: new Set(["-r"]),
  python: new Set(["-c"]),
  python3: new Set(["-c"]),
  ruby: new Set(["-e"]),
};

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

const argumentSchema = z.string().min(1).max(500).superRefine((value, context) => {
  if (containsControlCharacters(value)) {
    context.addIssue({ code: "custom", message: "Arguments cannot contain control characters." });
  }
  if (FORBIDDEN_SHELL_CHARACTERS.test(value)) {
    context.addIssue({ code: "custom", message: "Arguments cannot contain shell operators." });
  }
  if (value.includes("$(") || value.includes("${")) {
    context.addIssue({ code: "custom", message: "Arguments cannot contain command or parameter substitution." });
  }
});

const commandSchema = z.object({
  executable: z.string()
    .regex(EXECUTABLE_PATTERN, "Executable must be a bare program name.")
    .refine((value) => !FORBIDDEN_SHELL_EXECUTABLES.has(value.toLowerCase()), "Shell executables are not allowed."),
  args: z.array(argumentSchema).max(40),
}).strict().superRefine((command, context) => {
  const executable = command.executable.toLowerCase();
  if (FORBIDDEN_WRAPPER_EXECUTABLES.has(executable)) {
    context.addIssue({ code: "custom", path: ["executable"], message: "Command wrapper executables are not allowed." });
  }
  const inlineFlags = FORBIDDEN_INLINE_CODE_FLAGS[executable];
  const inlineFlagIndex = inlineFlags ? command.args.findIndex((argument) => inlineFlags.has(argument)) : -1;
  if (inlineFlagIndex >= 0) {
    context.addIssue({ code: "custom", path: ["args", inlineFlagIndex], message: "Inline interpreter code is not allowed." });
  }
});

const workingDirectorySchema = z.string().min(1).max(200).superRefine((value, context) => {
  if (value === ".") return;
  if (value.startsWith("/") || value.includes("\\") || value.includes(":")) {
    context.addIssue({ code: "custom", message: "Working directory must be a relative POSIX path." });
    return;
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    context.addIssue({ code: "custom", message: "Working directory cannot contain empty, dot, or traversal segments." });
  }
  if (segments.some(containsControlCharacters)) {
    context.addIssue({ code: "custom", message: "Working directory cannot contain control characters." });
  }
});

export const checkoutContractSchema = z.object({
  version: z.literal(1),
  workingDirectory: workingDirectorySchema.default("."),
  commands: z.object({
    install: commandSchema,
    test: commandSchema.optional(),
    build: commandSchema,
    start: commandSchema,
  }).strict(),
  port: z.number().int().min(1_024).max(65_535),
  assertion: z.object({
    text: z.string().trim().min(1).max(300).refine((value) => !containsControlCharacters(value), "Assertion cannot contain control characters."),
  }).strict(),
}).strict();

export type CheckoutContract = z.infer<typeof checkoutContractSchema>;

export interface ParsedCheckoutContract {
  contract: CheckoutContract;
  hash: string;
}

export function parseCheckoutContract(input: unknown): ParsedCheckoutContract {
  const contract = checkoutContractSchema.parse(input);
  const hash = createHash("sha256").update(JSON.stringify(contract)).digest("hex");
  return { contract, hash };
}

const TIMEOUTS: Record<CommandSpec["purpose"], number> = {
  install: 180_000,
  test: 120_000,
  build: 180_000,
  start: 30_000,
};

export function contractCommand(
  contract: CheckoutContract,
  purpose: CommandSpec["purpose"],
): CommandSpec | undefined {
  const declared = contract.commands[purpose];
  if (!declared) return undefined;
  return {
    executable: declared.executable,
    args: [...declared.args],
    purpose,
    timeoutMs: TIMEOUTS[purpose],
  };
}
