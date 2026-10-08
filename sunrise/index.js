// index.js — cron-invoked sunrise trigger.
// Sends a startSunrise command to the already-running led-daemon via WebSocket.
// The daemon owns GPIO and runs the full animation; this process just waits for completion.

import WebSocket from 'ws';

const DAEMON_URL = 'ws://127.0.0.1:5455';

function parseArgs() {
    const args = process.argv.slice(2);
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

const cli = parseArgs();

const minutes = cli.minutes ?? Number(process.env.SUNRISE_MINUTES) || undefined;
const delayMs = cli.delayMs ?? Number(process.env.SUNRISE_DELAY_MS) || 40;

const ws = new WebSocket(DAEMON_URL);

ws.on('error', (e) => {
    console.error('Failed to connect to led-daemon:', e.message);
    console.error('Make sure led-daemon.js is running as root.');
    process.exit(1);
});

ws.on('open', () => {
    const cmd = { cmd: 'startSunrise', delayMs };
    if (minutes) cmd.minutes = minutes;
    console.log('Connected to daemon. Sending startSunrise:', JSON.stringify(cmd));
    ws.send(JSON.stringify(cmd));
});

ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    console.log('[daemon]', JSON.stringify(msg));

    if (msg.type === 'sunriseQueued') {
        console.log(`Sunrise queued for ${msg.minutes} minutes. Waiting for completion...`);
    } else if (msg.type === 'sunriseDone') {
        console.log('Sunrise complete.', msg.aborted ? '(aborted)' : '');
        ws.close();
        process.exit(0);
    } else if (msg.ok === false) {
        console.error('Daemon error:', msg.error);
        ws.close();
        process.exit(1);
    }
});

ws.on('close', () => {
    console.log('Connection to daemon closed.');
});
