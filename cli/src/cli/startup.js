const net = require("net");

const UPDATE_CHECK_DISABLE_ENV = [
  "NINEROUTER_NO_UPDATE_CHECK",
  "NINEROUTER_DISABLE_UPDATE_CHECK",
  "NO_UPDATE_CHECK"
];

function isTruthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function shouldSkipUpdateCheck(env = process.env, skipUpdateFlag = false) {
  return skipUpdateFlag || UPDATE_CHECK_DISABLE_ENV.some((name) => isTruthyEnv(env[name]));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect({ host, port, timeoutMs }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForServerReady({ host = "127.0.0.1", port, timeoutMs = 10000, intervalMs = 100 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect({ host, port, timeoutMs: Math.min(intervalMs, 250) })) return true;
    await wait(intervalMs);
  }
  return false;
}

module.exports = {
  shouldSkipUpdateCheck,
  waitForServerReady
};
