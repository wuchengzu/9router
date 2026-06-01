import { createRequire } from "module";
import net from "net";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

describe("CLI runtime dependency install", () => {
  it("persists runtime dependencies instead of installing them as no-save extraneous packages", () => {
    const { buildNpmInstallArgs } = require("../../cli/hooks/sqliteRuntime.js");

    expect(buildNpmInstallArgs(["better-sqlite3@12.6.2"])).toEqual([
      "install",
      "better-sqlite3@12.6.2",
      "--no-audit",
      "--no-fund",
      "--prefer-online"
    ]);
  });
});

describe("CLI update check", () => {
  it("can be disabled by environment variable", () => {
    const { shouldSkipUpdateCheck } = require("../../cli/src/cli/startup.js");

    expect(shouldSkipUpdateCheck({ NINEROUTER_NO_UPDATE_CHECK: "1" }, false)).toBe(true);
    expect(shouldSkipUpdateCheck({ NINEROUTER_NO_UPDATE_CHECK: "true" }, false)).toBe(true);
    expect(shouldSkipUpdateCheck({ NO_UPDATE_CHECK: "1" }, false)).toBe(true);
    expect(shouldSkipUpdateCheck({}, true)).toBe(true);
    expect(shouldSkipUpdateCheck({}, false)).toBe(false);
  });
});

describe("CLI server readiness", () => {
  it("resolves as soon as the TCP port accepts connections", async () => {
    const { waitForServerReady } = require("../../cli/src/cli/startup.js");
    const server = net.createServer();
    const started = new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await started;

    const port = server.address().port;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await expect(waitForServerReady({ host: "127.0.0.1", port, timeoutMs: 1000, intervalMs: 50 })).resolves.toBe(true);
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 3000);

    setTimeoutSpy.mockRestore();
    server.close();
  });
});
