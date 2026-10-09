// led-daemon.js — root-privileged WebSocket daemon for LED strip + sunrise animation
import { WebSocketServer } from 'ws';
import ws281x from 'rpi-ws281x-native';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import fetch from 'node-fetch';

const LEDS = 300;
const CRONTAB_MARKER = '# SUNRISE-ALARM';
const PRESET_PATH = resolve(process.cwd(), 'sunrise-preset.json');

// ── Logging ───────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString(); }
function log(msg)  { console.log(`[${ts()}] ${msg}`); }
function warn(msg) { console.warn(`[${ts()}] WARN  ${msg}`); }
function err(msg)  { console.error(`[${ts()}] ERROR ${msg}`); }

// ── Hardware init ─────────────────────────────────────────────────────────────

log(`Starting led-daemon. PID=${process.pid} CWD=${process.cwd()}`);

const channel = ws281x(LEDS, {
    dma: 10,
    freq: 800000,
    gpio: 10,
    invert: false,
    brightness: 255,
    stripType: ws281x.stripType.WS2812
});

const pixels = channel.array;
log(`ws281x initialised: ${LEDS} LEDs on GPIO 10, DMA 10`);

// ── Sunrise state ─────────────────────────────────────────────────────────────

let sunriseRunning = false;
let sunriseAbort   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function render() {
    // rpi-ws281x-native requires the channel object, not just the pixels array
    ws281x.render(channel);
}

function rgbToInt(r, g, b) {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function clamp255(v) {
    v = Number(v);
    return Number.isFinite(v) ? Math.min(255, Math.max(0, Math.round(v))) : 0;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function interpolateRGB(keyframes, pct) {
    let start = keyframes[0];
    let end   = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
        const a = keyframes[i], b = keyframes[i + 1];
        if (pct >= a.time && pct <= b.time) { start = a; end = b; break; }
    }
    if (start === end || end.time === start.time) {
        return { r: start.red, g: start.green, b: start.blue };
    }
    const t = (pct - start.time) / (end.time - start.time);
    return {
        r: Math.round(lerp(start.red,   end.red,   t)),
        g: Math.round(lerp(start.green, end.green, t)),
        b: Math.round(lerp(start.blue,  end.blue,  t))
    };
}

function loadPreset() {
    log(`Loading preset from ${PRESET_PATH}`);
    const raw = JSON.parse(readFileSync(PRESET_PATH, 'utf-8'));
    if (!Array.isArray(raw.rows)) throw new Error('Preset missing rows array');
    const keyframes = raw.rows
        .filter(f => typeof f.time === 'number' && typeof f.red === 'number')
        .map(f => ({
            time:  Math.min(100, Math.max(0, f.time)),
            red:   clamp255(f.red),
            green: clamp255(f.green),
            blue:  clamp255(f.blue)
        }))
        .sort((a, b) => a.time - b.time);
    if (keyframes.length === 0) throw new Error('No valid keyframes in preset');
    if (keyframes[0].time > 0) keyframes.unshift({ ...keyframes[0], time: 0 });
    if (keyframes[keyframes.length - 1].time < 100) keyframes.push({ ...keyframes[keyframes.length - 1], time: 100 });
    const minutes = Number(raw.simulationMinutes) > 0 ? Number(raw.simulationMinutes) : 15;
    log(`Preset loaded: ${keyframes.length} keyframes, ${minutes} minutes`);
    return { keyframes, minutes };
}

// ── Sunrise runner ────────────────────────────────────────────────────────────

async function runSunrise(minutes, delayMs, broadcast) {
    if (sunriseRunning) {
        warn('startSunrise called but already running — ignoring');
        return { ok: false, error: 'already_running' };
    }
    sunriseRunning = true;
    sunriseAbort   = false;

    let keyframes;
    try {
        ({ keyframes } = loadPreset());
    } catch (e) {
        err(`Failed to load preset: ${e.message}`);
        sunriseRunning = false;
        return { ok: false, error: e.message };
    }

    const targetMs   = minutes * 60 * 1000;
    const steps      = Math.max(1, Math.round(targetMs / delayMs));
    const actualDelay = targetMs / steps;
    let audioStarted = false;

    log(`Sunrise starting: ${minutes}min | ${steps} steps | ${actualDelay.toFixed(1)}ms/step`);
    broadcast({ type: 'sunriseStarted', minutes, steps });

    const startTime = Date.now();

    for (let step = 0; step <= steps; step++) {
        if (sunriseAbort) {
            log(`Sunrise aborted at step ${step} (${((step / steps) * 100).toFixed(1)}%)`);
            break;
        }

        const pct = (step / steps) * 100;
        const { r, g, b } = interpolateRGB(keyframes, pct);
        pixels.fill(rgbToInt(r, g, b));
        render();

        // Audio fade-in at 95%
        if (pct > 95 && !audioStarted) {
            audioStarted = true;
            const remainingMs = (steps - step) * actualDelay;
            const durationS   = Math.round(remainingMs / 1000);
            log(`Triggering audio fade-in (${durationS}s remaining)`);
            fetch(`http://sunrise:5000/fadein?duration=${durationS}`)
                .then(res => res.json().catch(() => ({})))
                .then(data => log(`Audio fade-in response: ${JSON.stringify(data)}`))
                .catch(e => warn(`Audio fade-in failed: ${e.message}`));
        }

        // Progress broadcast every ~5%
        if (step % Math.max(1, Math.floor(steps / 20)) === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            log(`Progress: ${pct.toFixed(1)}% | RGB(${r},${g},${b}) | elapsed ${elapsed}s`);
            broadcast({ type: 'sunriseProgress', pct: Math.round(pct), r, g, b });
        }

        if (step < steps) await wait(actualDelay);
    }

    log('Sunrise loop complete — triggering audio fade-out');
    fetch('http://sunrise:5000/fadeout')
        .then(res => res.json().catch(() => ({})))
        .then(data => log(`Audio fade-out response: ${JSON.stringify(data)}`))
        .catch(e => warn(`Audio fade-out failed: ${e.message}`));

    pixels.fill(0);
    render();
    sunriseRunning = false;

    const totalS = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Sunrise done. Total elapsed: ${totalS}s. Aborted: ${sunriseAbort}`);
    broadcast({ type: 'sunriseDone', aborted: sunriseAbort });
    return { ok: true };
}

// ── Crontab helpers ───────────────────────────────────────────────────────────

function writeCrontab(content) {
    const tmp = join(tmpdir(), `sunrise-cron-${process.pid}.txt`);
    try {
        writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
        execSync(`crontab ${tmp}`, { encoding: 'utf8' });
        log('Crontab written successfully');
    } finally {
        try { unlinkSync(tmp); } catch {}
    }
}

function getExistingCrontab() {
    try {
        const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
        return crontab.split('\n').filter(line => !line.includes(CRONTAB_MARKER)).join('\n').trim();
    } catch (e) {
        err('Error reading crontab: ' + e.message);
        return '';
    }
}

function getCurrentAlarm() {
    try {
        const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
        for (const line of crontab.split('\n')) {
            if (line.includes(CRONTAB_MARKER)) {
                const match = line.match(/^(\d+)\s+(\d+)\s+/);
                if (match) {
                    const minute = parseInt(match[1], 10);
                    const hour   = parseInt(match[2], 10);
                    log(`Alarm read: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} enabled`);
                    return { hour, minute, enabled: true };
                }
            }
        }
        return { hour: 7, minute: 0, enabled: false };
    } catch (e) {
        err('Error getting alarm: ' + e.message);
        return { hour: 7, minute: 0, enabled: false };
    }
}

function setAlarm(hour, minute, enabled, command) {
    try {
        let base = getExistingCrontab();
        if (enabled) {
            const line = `${minute} ${hour} * * * ${command} ${CRONTAB_MARKER}`;
            base = base ? `${base}\n${line}` : line;
        }
        if (base && !base.endsWith('\n')) base += '\n';
        writeCrontab(base);
        log(`Alarm ${enabled ? 'set' : 'disabled'}: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
        return { ok: true, hour, minute, enabled };
    } catch (e) {
        err('Error setting alarm: ' + e.message);
        return { ok: false, error: e.message };
    }
}

function deleteAlarm() {
    try {
        const base    = getExistingCrontab();
        const content = base && !base.endsWith('\n') ? base + '\n' : base;
        if (content.trim()) {
            writeCrontab(content);
        } else {
            execSync('crontab -r 2>/dev/null || true', { encoding: 'utf8' });
        }
        log('Alarm deleted');
        return { ok: true, enabled: false };
    } catch (e) {
        err('Error deleting alarm: ' + e.message);
        return { ok: false, error: e.message };
    }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ host: '127.0.0.1', port: 5455 });

function broadcast(msg) {
    const raw     = JSON.stringify(msg);
    let   sent    = 0;
    for (const client of wss.clients) {
        if (client.readyState === 1 /* OPEN */) {
            try { client.send(raw); sent++; } catch {}
        }
    }
    if (msg.type !== 'sunriseProgress') {
        log(`Broadcast [${msg.type}] → ${sent} client(s)`);
    }
}

wss.on('listening', () => log('WS daemon listening on ws://127.0.0.1:5455'));

wss.on('connection', (client, req) => {
    log(`New connection from ${req.socket.remoteAddress} (total: ${wss.clients.size})`);

    client.on('message', async (buf) => {
        let msg;
        try { msg = JSON.parse(buf.toString()); }
        catch {
            client.send(JSON.stringify({ ok: false, error: 'bad_json' }));
            return;
        }

        const { cmd } = msg;
        log(`CMD: ${cmd}${cmd === 'set' ? ` RGB(${msg.r},${msg.g},${msg.b})` : ''}`);

        if (cmd === 'set') {
            const r = Math.max(0, Math.min(255, msg.r | 0));
            const g = Math.max(0, Math.min(255, msg.g | 0));
            const b = Math.max(0, Math.min(255, msg.b | 0));
            pixels.fill(rgbToInt(r, g, b));
            render();
            client.send(JSON.stringify({ ok: true, type: 'set', r, g, b }));

        } else if (cmd === 'off') {
            pixels.fill(0);
            render();
            client.send(JSON.stringify({ ok: true, type: 'off' }));

        } else if (cmd === 'ping') {
            client.send(JSON.stringify({ ok: true, type: 'pong' }));

        } else if (cmd === 'startSunrise') {
            const minutes = Number(msg.minutes) > 0 ? Number(msg.minutes) : undefined;
            const delayMs = Number(msg.delayMs)  > 0 ? Number(msg.delayMs)  : 40;
            let preset;
            try { preset = loadPreset(); }
            catch (e) {
                err(`loadPreset failed: ${e.message}`);
                client.send(JSON.stringify({ ok: false, error: e.message }));
                return;
            }
            const mins = minutes ?? preset.minutes;
            log(`startSunrise: ${mins}min @ ${delayMs}ms/step`);
            client.send(JSON.stringify({ ok: true, type: 'sunriseQueued', minutes: mins }));
            runSunrise(mins, delayMs, broadcast).catch(e => err(`runSunrise exception: ${e.stack}`));

        } else if (cmd === 'stopSunrise') {
            log('stopSunrise requested');
            sunriseAbort = true;
            client.send(JSON.stringify({ ok: true, type: 'sunriseStopping' }));

        } else if (cmd === 'sunriseStatus') {
            client.send(JSON.stringify({ ok: true, type: 'sunriseStatus', running: sunriseRunning }));

        } else if (cmd === 'getAlarm') {
            const alarm = getCurrentAlarm();
            client.send(JSON.stringify({ ok: true, type: 'alarm', ...alarm }));

        } else if (cmd === 'setAlarm') {
            const hour    = parseInt(msg.hour,   10);
            const minute  = parseInt(msg.minute, 10);
            const enabled = msg.enabled !== false;
            const command = msg.command || 'cd /home/marius/github/sunrise-strip/sunrise && node led-client-runner.js';
            if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                err(`setAlarm invalid time: ${msg.hour}:${msg.minute}`);
                client.send(JSON.stringify({ ok: false, error: 'invalid_time' }));
                return;
            }
            const result = setAlarm(hour, minute, enabled, command);
            client.send(JSON.stringify({ type: 'alarmSet', ...result }));

        } else if (cmd === 'deleteAlarm') {
            const result = deleteAlarm();
            client.send(JSON.stringify({ type: 'alarmDeleted', ...result }));

        } else {
            warn(`Unknown command: ${cmd}`);
            client.send(JSON.stringify({ ok: false, error: 'unknown_cmd' }));
        }
    });

    client.on('close',  () => log(`Connection closed (remaining: ${wss.clients.size})`));
    client.on('error',  e  => err(`Client error: ${e.message}`));
});

wss.on('error', e => err(`WS server error: ${e.message}`));

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
    log(`Received ${signal} — shutting down`);
    sunriseAbort = true;
    pixels.fill(0);
    render();
    ws281x.reset();
    process.exit(0);
}
