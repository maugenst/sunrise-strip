#!/usr/bin/env node
// scripts/deploy.js — deploy latest main from Mac to the Pi
//
// Usage (from repo root or sunrise/):
//   node scripts/deploy.js
//   node scripts/deploy.js --restart   also restarts Pi services after pull
//
// What it does:
//   1. Ensures the local repo is committed and pushed
//   2. SSHes to the Pi, commits any local edits there (e.g. preset changes)
//   3. Pulls from origin/main
//   4. Runs npm install if package.json changed
//   5. Optionally restarts systemd services

import { execSync, spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PI_HOST   = 'sunrise';
const PI_DIR    = '~/github/sunrise-strip';
const SERVICES  = ['led-daemon', 'sunrise-server'];

const restart = process.argv.includes('--restart');

// ── helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
    console.log(`\n» ${cmd}`);
    const result = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
    if (result.status !== 0) {
        console.error(`\n✖ Command failed (exit ${result.status}): ${cmd}`);
        process.exit(result.status ?? 1);
    }
}

function capture(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}

function ssh(cmd) {
    run(`ssh ${PI_HOST} "${cmd.replace(/"/g, '\\"')}"`);
}

function sshCapture(cmd) {
    return capture(`ssh ${PI_HOST} "${cmd.replace(/"/g, '\\"')}"`);
}

// ── 1. Check local repo is clean and pushed ───────────────────────────────────

console.log('\n── Step 1: Check local state ──────────────────────────────────');

process.chdir(REPO_ROOT);

const localDirty = capture('git status --porcelain');
if (localDirty) {
    console.error('✖ You have uncommitted local changes. Commit or stash them first.');
    console.error(localDirty);
    process.exit(1);
}

const localBranch = capture('git rev-parse --abbrev-ref HEAD');
if (localBranch !== 'main') {
    console.error(`✖ Local branch is "${localBranch}", expected "main". Switch first.`);
    process.exit(1);
}

// Ensure we're up to date with origin
run('git fetch origin main --quiet');
const behind = capture('git rev-list HEAD..origin/main --count');
if (parseInt(behind) > 0) {
    console.error(`✖ Local is ${behind} commit(s) behind origin/main. Run git pull first.`);
    process.exit(1);
}

const ahead = capture('git rev-list origin/main..HEAD --count');
if (parseInt(ahead) > 0) {
    console.log(`  Pushing ${ahead} local commit(s) to origin…`);
    run('git push origin main');
}

const localSHA = capture('git rev-parse --short HEAD');
console.log(`  Local HEAD: ${localSHA} ✓`);

// ── 2. Commit any dirty files on the Pi ──────────────────────────────────────

console.log('\n── Step 2: Commit Pi local changes ────────────────────────────');

const piDirty = sshCapture(`cd ${PI_DIR} && git status --porcelain`);
if (piDirty) {
    console.log('  Pi has uncommitted changes — committing them:');
    console.log(piDirty.split('\n').map(l => '    ' + l).join('\n'));
    ssh(`cd ${PI_DIR} && git add -A && git commit -m "Pi: auto-commit local changes before deploy"`);
    // Push Pi's commit so it doesn't diverge
    ssh(`cd ${PI_DIR} && git push origin main`);
    // Pull it back locally so Mac stays in sync
    run('git pull --ff-only origin main');
    console.log('  Pi changes committed and synced back to Mac ✓');
} else {
    console.log('  Pi working tree is clean ✓');
}

// ── 3. Pull on Pi ─────────────────────────────────────────────────────────────

console.log('\n── Step 3: Pull on Pi ──────────────────────────────────────────');
ssh(`cd ${PI_DIR} && git pull --ff-only origin main`);

const piSHA = sshCapture(`cd ${PI_DIR} && git rev-parse --short HEAD`);
console.log(`  Pi HEAD: ${piSHA} ✓`);

// ── 4. npm install if package.json changed ────────────────────────────────────

console.log('\n── Step 4: Check if npm install needed ─────────────────────────');

const pkgChanged = sshCapture(
    `cd ${PI_DIR} && git diff HEAD~1 HEAD --name-only 2>/dev/null | grep 'sunrise/package.json' || true`
);
if (pkgChanged) {
    console.log('  package.json changed — running npm install on Pi…');
    ssh(`cd ${PI_DIR}/sunrise && npm install`);
} else {
    console.log('  package.json unchanged — skipping npm install ✓');
}

// ── 5. Restart services ───────────────────────────────────────────────────────

if (restart) {
    console.log('\n── Step 5: Restart services on Pi ──────────────────────────────');
    for (const svc of SERVICES) {
        ssh(`sudo systemctl restart ${svc}`);
        console.log(`  ${svc} restarted ✓`);
    }
} else {
    console.log('\n── Step 5: Services ─────────────────────────────────────────────');
    console.log('  Skipped (pass --restart to restart services automatically)');
    console.log(`  Manual restart: ssh ${PI_HOST} "sudo systemctl restart ${SERVICES.join(' ')}"`)
}

// ── Done ──────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────────────────────────────');
console.log(`✓ Deploy complete. Pi is at ${piSHA}.`);
