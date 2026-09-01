export interface CommandSpec {
  executable: string;
  args: string[];
  purpose: "install" | "test" | "build" | "start";
  timeoutMs: number;
}
