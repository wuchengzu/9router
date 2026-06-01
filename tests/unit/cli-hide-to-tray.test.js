import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

describe("CLI hide to tray handoff", () => {
  it("starts tray mode as a detached background process", () => {
    const { spawnTrayBackgroundProcess } = require("../../cli/src/cli/backgroundHandoff.js");
    const child = { pid: 12345, unref: vi.fn() };
    const spawnImpl = vi.fn(() => child);

    const result = spawnTrayBackgroundProcess({
      spawnImpl,
      nodePath: "/usr/local/bin/node",
      scriptPath: "/opt/9router/cli.js",
      port: 20128,
      env: { PATH: "/usr/bin" }
    });

    expect(result).toBe(child);
    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(spawnImpl).toHaveBeenCalledWith(
      "/usr/local/bin/node",
      ["/opt/9router/cli.js", "--tray", "--skip-update", "-p", "20128"],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { PATH: "/usr/bin" }
      }
    );
  });

  it("restores interactive stdin before the foreground CLI exits", () => {
    const { releaseInteractiveStdin } = require("../../cli/src/cli/backgroundHandoff.js");
    const stdin = {
      isTTY: true,
      setRawMode: vi.fn(),
      pause: vi.fn()
    };

    releaseInteractiveStdin(stdin);

    expect(stdin.setRawMode).toHaveBeenCalledWith(false);
    expect(stdin.pause).toHaveBeenCalledTimes(1);
  });
});
