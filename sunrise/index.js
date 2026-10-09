// index.js — cron-invoked sunrise trigger.
// Connects to the already-running led-daemon via WebSocket and sends startSunrise.
// Waits for sunriseDone before exiting so the cron log captures the full run.

import WebSocket from 'ws';

const DAEMON_URL = 'ws://127.0.0.1:5455';

function ts()   { return new Date().toISOString(); }
function log(m) { console.log(`[${ts()}] ${m}`); }
function err(m) { console.error(`[${ts()}] ERROR ${m}`); }

function parseArgs() {
    const args   = process.argv.slice(2);
    const result = { help: false };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--help' || a === '-h') { result.help = true; }
        else if ((a === '--minutes' || a === '-m') && args[i + 1]) {
            const v = Number(args[++i]);
            if (Number.isFinite(v) && v > 0) result.minutes = v;
        } else if ((a === '--delay' || a === '-d') && args[i + 1]) {
            const v = Number(args[++i]);
            if (Number.isFinite(v) && v > 0) result.delayMs = v;
        }
    }
    return result;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Sunrise trigger — sends startSunrise to led-daemon.
  --minutes, -m <n>   Override animation duration in minutes
  --delay,   -d <ms>  Override step delay in ms
  --help,    -h       Show this help
`);
    process.exit(0);
}

const cli     = parseArgs();
const minutes = cli.minutes ?? (Number(process.env.SUNRISE_MINUTES) || undefined);
const delayMs = cli.delayMs ?? (Number(process.env.SUNRISE_DELAY_MS) || 40);

log(`index.js started. PID=${process.pid} minutes=${minutes ?? 'from preset'} delayMs=${delayMs}`);

const ws = new WebSocket(DAEMON_URL);

// Give up after 10 seconds if we can't connect
const connectTimeout = setTimeout(() => {
    err(`Timed out connecting to daemon at ${DAEMON_URL} — is led-daemon running?`);
    process.exit(1);
}, 10000);

ws.on('error', (e) => {
    err(`WebSocket error: ${e.message}`);
    err(`Make sure led-daemon.js is running as root (sudo systemctl start led-daemon)`);
    clearTimeout(connectTimeout);
    process.exit(1);
});

ws.on('open', () => {
    clearTimeout(connectTimeout);
    const cmd = { cmd: 'startSunrise', delayMs };
    if (minutes) cmd.minutes = minutes;
    log(`Connected to daemon. Sending: ${JSON.stringify(cmd)}`);
    ws.send(JSON.stringify(cmd));
});

ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    log(`Daemon → ${JSON.stringify(msg)}`);

    if (msg.type === 'sunriseQueued') {
        log(`Sunrise queued for ${msg.minutes} minutes. Waiting for completion...`);
    } else if (msg.type === 'sunriseProgress') {
        // logged by daemon — no action needed here
    } else if (msg.type === 'sunriseDone') {
        log(`Sunrise complete. Aborted=${msg.aborted}. Exiting.`);
        ws.close();
        process.exit(0);
    } else if (msg.ok === false) {
        err(`Daemon error: ${msg.error}`);
        ws.close();
        process.exit(1);
    }
});

ws.on('close', () => {
    log('Connection to daemon closed.');
});

// Safety exit after 20 minutes regardless — prevents cron job from hanging forever
setTimeout(() => {
    err('Safety timeout reached (20min) — forcing exit');
    process.exit(1);
}, 20 * 60 * 1000);
