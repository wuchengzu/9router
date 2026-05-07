#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');
const appOut = path.join(cliRoot, 'app');

const requiredBuildFile = path.join(repoRoot, '.next', 'standalone', 'server.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) fail(`Required path does not exist: ${source}`);
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function removeIfExists(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

if (!fs.existsSync(requiredBuildFile)) {
  fail([
    'Missing .next/standalone/server.js.',
    'Run `npm run build` from the repository root before preparing the CLI package.',
  ].join('\n'));
}

removeIfExists(appOut);
fs.mkdirSync(appOut, { recursive: true });

copyRecursive(path.join(repoRoot, '.next', 'standalone'), appOut);
copyRecursive(path.join(repoRoot, '.next', 'static'), path.join(appOut, '.next', 'static'));
copyRecursive(path.join(repoRoot, 'public'), path.join(appOut, 'public'));
copyRecursive(path.join(repoRoot, 'open-sse'), path.join(appOut, 'open-sse'));
copyRecursive(path.join(repoRoot, 'src', 'mitm'), path.join(appOut, 'src', 'mitm'));
copyRecursive(path.join(repoRoot, 'src', 'lib', 'updater'), path.join(appOut, 'src', 'lib', 'updater'));

const extraDependency = path.join(repoRoot, 'node_modules', 'node-forge');
if (fs.existsSync(extraDependency)) {
  copyRecursive(extraDependency, path.join(appOut, 'node_modules', 'node-forge'));
}

console.log(`Prepared 9Router app bundle at ${appOut}`);
