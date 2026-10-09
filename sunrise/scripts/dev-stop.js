#!/usr/bin/env node
// scripts/dev-stop.js — kill the dev server and mock daemon by port
import { execSync } from 'child_process';

const PORTS = [8080, 8081, 5455];

for (const port of PORTS) {
    try {
        const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
        if (!pids) continue;
        execSync(`kill -9 ${pids.split('\n').join(' ')}`);
        console.log(`killed port ${port} (pid ${pids.replace(/\n/g, ', ')})`);
    } catch {
        console.log(`port ${port} already free`);
    }
}

console.log('done');
