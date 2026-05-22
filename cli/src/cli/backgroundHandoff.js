const { spawn } = require("child_process");

function buildTrayProcessArgs(scriptPath, port) {
  return [scriptPath, "--tray", "--skip-update", "-p", String(port)];
}

function spawnTrayBackgroundProcess({
  spawnImpl = spawn,
  nodePath = process.execPath,
  scriptPath,
  port,
  env = process.env
}) {
  const child = spawnImpl(nodePath, buildTrayProcessArgs(scriptPath, port), {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...env }
  });

  if (child && typeof child.unref === "function") {
    child.unref();
  }

  return child;
}

function releaseInteractiveStdin(stdin = process.stdin) {
  if (!stdin) return;
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    try { stdin.setRawMode(false); } catch {}
  }
  if (typeof stdin.pause === "function") {
    try { stdin.pause(); } catch {}
  }
}

module.exports = {
  buildTrayProcessArgs,
  releaseInteractiveStdin,
  spawnTrayBackgroundProcess
};
