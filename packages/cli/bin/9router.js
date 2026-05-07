#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const packageRoot = path.resolve(__dirname, '..');
const appDir = path.join(packageRoot, 'app');
const serverFile = path.join(appDir, 'server.js');
const DEFAULT_PORT = '20128';
const DEFAULT_HOSTNAME = '0.0.0.0';

function getDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '9router');
  }
  return path.join(os.homedir(), '.9router');
}

const dataDir = getDataDir();
const runtimeDir = path.join(dataDir, 'runtime');
const pidFile = path.join(runtimeDir, '9router.pid');
const logFile = path.join(runtimeDir, '9router.log');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out([
    'Usage: 9router [start|stop|status|log] [options]',
    '',
    'Commands:',
    '  start              Start 9Router in the background',
    '  stop               Stop the background service',
    '  status             Show service status',
    '  log                Print service logs',
    '',
    'Log options:',
    '  --lines <n>        Number of lines to print (default: 80)',
    '  --follow, -f       Follow appended log output',
    '',
    'Environment:',
    `  PORT               Service port (default: ${DEFAULT_PORT})`,
    `  HOSTNAME           Bind host (default: ${DEFAULT_HOSTNAME})`,
    `  DATA_DIR           Data, pid, and log directory (default: ${dataDir})`,
  ].join('\n'));
  process.exit(exitCode);
}

function ensureRuntimeDir() { fs.mkdirSync(runtimeDir, { recursive: true }); }
function readPid() {
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}
function writePid(pid) { ensureRuntimeDir(); fs.writeFileSync(pidFile, `${pid}\n`); }
function removePid() { try { fs.unlinkSync(pidFile); } catch { } }
function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error && error.code === 'EPERM'; }
}
function cleanupStalePid() { const pid = readPid(); if (pid && !isRunning(pid)) removePid(); }
function getPort() { return String(process.env.PORT || DEFAULT_PORT); }
function getHostname() { return String(process.env.HOSTNAME || DEFAULT_HOSTNAME); }
function getBaseUrl(port) { return process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${port}`; }
function assertBuiltApp() {
  if (fs.existsSync(serverFile)) return;
  console.error(`9Router app bundle not found: ${serverFile}`);
  console.error('Run `npm run build && npm --prefix packages/cli run prepare:app` before packing locally.');
  process.exit(1);
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: Number(port), host: '127.0.0.1' });
    const done = (ok) => { socket.removeAllListeners(); socket.destroy(); resolve(ok); };
    socket.setTimeout(300);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function start() {
  assertBuiltApp();
  cleanupStalePid();
  const existing = readPid();
  if (existing && isRunning(existing)) {
    console.log(`9Router is already running (pid ${existing}).`);
    console.log(`Dashboard: http://localhost:${getPort()}/dashboard`);
    return;
  }

  ensureRuntimeDir();
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');
  const port = getPort();
  const hostname = getHostname();
  const baseUrl = getBaseUrl(port);
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
    PORT: port,
    HOSTNAME: hostname,
    DATA_DIR: dataDir,
    NEXT_PUBLIC_BASE_URL: baseUrl,
    BASE_URL: process.env.BASE_URL || baseUrl,
  };

  fs.appendFileSync(logFile, `\n[9router] starting ${new Date().toISOString()} port=${port} hostname=${hostname}\n`);
  const child = spawn(process.execPath, [serverFile], { cwd: appDir, env, detached: true, stdio: ['ignore', out, err] });
  child.unref();
  writePid(child.pid);

  await wait(700);
  if (!isRunning(child.pid)) {
    removePid();
    console.error(`9Router failed to stay running. See log: ${logFile}`);
    process.exit(1);
  }

  const reachable = await canConnect(port);
  console.log(`9Router started (pid ${child.pid}).`);
  console.log(`Dashboard: http://localhost:${port}/dashboard`);
  console.log(`Log: ${logFile}`);
  if (!reachable) console.log('Service process is running; the port is not reachable yet. Check `9router log` if it does not become available.');
}

async function stop() {
  const pid = readPid();
  if (!pid) { console.log('9Router is not running.'); return; }
  if (!isRunning(pid)) { removePid(); console.log('9Router is not running. Removed stale pid file.'); return; }
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) { removePid(); console.log(`9Router stopped (pid ${pid}).`); return; }
    await wait(250);
  }
  try { process.kill(pid, 'SIGKILL'); } catch { }
  removePid();
  console.log(`9Router did not stop after SIGTERM; sent SIGKILL to pid ${pid}.`);
}

function status() {
  cleanupStalePid();
  const pid = readPid();
  if (pid && isRunning(pid)) {
    console.log('Status: running');
    console.log(`PID: ${pid}`);
    console.log(`Port: ${getPort()}`);
    console.log(`Dashboard: http://localhost:${getPort()}/dashboard`);
    console.log(`Log: ${logFile}`);
    return;
  }
  console.log('Status: stopped');
  console.log(`PID file: ${pidFile}`);
  console.log(`Log: ${logFile}`);
}

function parseLogArgs(args) {
  let lines = 80;
  let follow = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--follow' || arg === '-f') follow = true;
    else if (arg === '--lines') {
      const next = args[i + 1];
      if (!next || Number.isNaN(Number(next))) { console.error('--lines requires a numeric value.'); process.exit(1); }
      lines = Math.max(0, Number(next));
      i += 1;
    } else if (arg.startsWith('--lines=')) {
      const value = arg.slice('--lines='.length);
      if (Number.isNaN(Number(value))) { console.error('--lines requires a numeric value.'); process.exit(1); }
      lines = Math.max(0, Number(value));
    } else { console.error(`Unknown log option: ${arg}`); usage(1); }
  }
  return { lines, follow };
}
function tailText(text, lines) {
  if (lines === 0) return '';
  const parts = text.split(/\r?\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  const output = parts.slice(-lines).join('\n');
  return output ? `${output}\n` : '';
}
function readLogTail(lines) { return fs.existsSync(logFile) ? tailText(fs.readFileSync(logFile, 'utf8'), lines) : ''; }
function followLog(startPosition) {
  let position = startPosition;
  setInterval(() => {
    fs.stat(logFile, (statError, stat) => {
      if (statError) return;
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const stream = fs.createReadStream(logFile, { start: position, end: stat.size - 1 });
      position = stat.size;
      stream.pipe(process.stdout, { end: false });
    });
  }, 500);
}
function showLog(args) {
  const options = parseLogArgs(args);
  ensureRuntimeDir();
  const output = readLogTail(options.lines);
  if (output) process.stdout.write(output);
  else console.log(`No log output yet: ${logFile}`);
  if (options.follow) {
    let position = 0;
    try { position = fs.statSync(logFile).size; } catch { position = 0; }
    followLog(position);
  }
}

async function main() {
  const [command = 'start', ...args] = process.argv.slice(2);
  if (command === '-h' || command === '--help' || command === 'help') usage(0);
  if (command === 'start') return start();
  if (command === 'stop') return stop();
  if (command === 'status') return status();
  if (command === 'log') return showLog(args);
  console.error(`Unknown command: ${command}`);
  usage(1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
