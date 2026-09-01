export interface ServerAddress { host: string; port: number }

export function resolveServerAddress(
  args: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): ServerAddress {
  const read = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    return value;
  };
  const host = read("--host") ?? env.FRESHCHECKOUT_HOST ?? "127.0.0.1";
  if (!host.trim() || [...host].some((character) => character.charCodeAt(0) < 32)) {
    throw new Error("Server host is invalid.");
  }
  const port = Number(read("--port") ?? env.FRESHCHECKOUT_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Server port is invalid.");
  return { host, port };
}
