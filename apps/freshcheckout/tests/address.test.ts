import { describe, expect, it } from "vitest";
import { resolveServerAddress } from "../src/server/address.js";

describe("resolveServerAddress", () => {
  it("defaults to local loopback", () => {
    expect(resolveServerAddress([], {})).toEqual({ host: "127.0.0.1", port: 4317 });
  });
  it("accepts explicit sandbox binding", () => {
    expect(resolveServerAddress(["--host", "0.0.0.0", "--port", "4317"], {}))
      .toEqual({ host: "0.0.0.0", port: 4317 });
  });
  it("keeps CLI precedence over environment", () => {
    expect(resolveServerAddress(["--host", "0.0.0.0"], { FRESHCHECKOUT_HOST: "127.0.0.1" }).host)
      .toBe("0.0.0.0");
  });
  it("rejects missing values and invalid ports", () => {
    expect(() => resolveServerAddress(["--host"], {})).toThrow("requires a value");
    expect(() => resolveServerAddress(["--port", "80"], {})).toThrow("port is invalid");
  });
});
