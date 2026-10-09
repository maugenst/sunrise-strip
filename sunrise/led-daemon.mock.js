// led-daemon.mock.js — sandbox version of led-daemon.js for local development
// Replaces rpi-ws281x-native with a plain Uint32Array and broadcasts pixel state
// to all WebSocket clients so the browser visualizer can render it live.
// Audio calls and crontab management are stubbed (no-op).
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const LEDS = 300;
const PRESET_PATH = resolve(process.cwd(), 'sunrise-preset.json');

// ── Mock LED hardware ─────────────────────────────────────────────────────────
// Plain Uint32Array — same shape as rpi-ws281x-native's channel.array.
// Each element: 0x00RRGGBB packed integer.

const pixels = new Uint32Array(LEDS);

function mockRender() {
    broadcastPixels();
}

function mockReset() {
    pixels.fill(0);
    broadcastPixels();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    let end = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
        const a = keyframes[i], b = keyframes[i + 1];
        if (pct >= a.time && pct <= b.time) { start = a; end = b; break; }
    }
    if (start === end || end.time === start.time) {
        return { r: start.red, g: start.green, b: start.blue };
    }
    const t = (pct - start.time) / (end.time - start.time);
    return {
        r: Math.round(lerp(start.red, end.red, t)),
        g: Math.round(lerp(start.green, end.green, t)),
        b: Math.round(lerp(start.blue, end.blue, t))
    };
}

function loadPreset() {
    const raw = JSON.parse(readFileSync(PRESET_PATH, 'utf-8'));
    if (!Array.isArray(raw.rows)) throw new Error('Preset missing rows');
    const keyframes = raw.rows
        .filter(f => typeof f.time === 'number' && typeof f.red === 'number')
        .map(f => ({ time: Math.min(100, Math.max(0, f.time)), red: clamp255(f.red), green: clamp255(f.green), blue: clamp255(f.blue) }))
        .sort((a, b) => a.time - b.time);
    if (keyframes.length === 0) throw new Error('No valid keyframes');
    if (keyframes[0].time > 0) keyframes.unshift({ ...keyframes[0], time: 0 });
    if (keyframes[keyframes.length - 1].time < 100) keyframes.push({ ...keyframes[keyframes.length - 1], time: 100 });
    const minutes = Number(raw.simulationMinutes) > 0 ? Number(raw.simulationMinutes) : 15;
    return { keyframes, minutes };
}

// ── Sunrise runner ────────────────────────────────────────────────────────────

let sunriseRunning = false;
let sunriseAbort = false;

async function runSunrise(minutes, delayMs, broadcast) {
    if (sunriseRunning) return { ok: false, error: 'already_running' };
    sunriseRunning = true;
    sunriseAbort = false;

    let keyframes;
    try {
        ({ keyframes } = loadPreset());
    } catch (e) {
        sunriseRunning = false;
        return { ok: false, error: e.message };
    }

    const targetMs = minutes * 60 * 1000;
    const steps = Math.max(1, Math.round(targetMs / delayMs));
    const actualDelay = targetMs / steps;
    let audioStarted = false;

    console.log(`[mock] sunrise starting: ${minutes}min, ${steps} steps, ${actualDelay.toFixed(1)}ms/step`);
    broadcast({ type: 'sunriseStarted', minutes, steps });

    for (let step = 0; step <= steps; step++) {
        if (sunriseAbort) {
            console.log('[mock] sunrise aborted');
            break;
        }

        const pct = (step / steps) * 100;
        const { r, g, b } = interpolateRGB(keyframes, pct);
        pixels.fill(rgbToInt(r, g, b));
        mockRender();

        if (pct > 80 && !audioStarted) {
            audioStarted = true;
            const remainingMs = (steps - step) * actualDelay;
            // Ensure at least 10s fade-in so it's audible even on short test runs
            const durationS = Math.max(10, Math.round(remainingMs / 1000));
            console.log(`[mock] audio fadein — broadcasting to browser (duration: ${durationS}s)`);
            broadcast({ type: 'audioFadeIn', durationS });
        }

        if (step % Math.max(1, Math.floor(steps / 20)) === 0) {
            broadcast({ type: 'sunriseProgress', pct: Math.round(pct), r, g, b });
        }

        if (step < steps) await wait(actualDelay);
    }

    console.log('[mock] audio fadeout — broadcasting to browser');
    broadcast({ type: 'audioFadeOut' });
    pixels.fill(0);
    mockRender();
    sunriseRunning = false;
    broadcast({ type: 'sunriseDone', aborted: sunriseAbort });
    console.log('[mock] sunrise done');
    return { ok: true };
}

// ── Alarm stubs (no-op in sandbox) ───────────────────────────────────────────

let mockAlarm = { hour: 7, minute: 0, enabled: false };

function getCurrentAlarm() { return { ...mockAlarm }; }
function setAlarm(hour, minute, enabled) {
    mockAlarm = { hour, minute, enabled };
    console.log(`[mock] alarm set: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} enabled=${enabled}`);
    return { ok: true, hour, minute, enabled };
}
function deleteAlarm() {
    mockAlarm.enabled = false;
    console.log('[mock] alarm deleted');
    return { ok: true, enabled: false };
}

// ── WebSocket server ──────────────────────────────────────────────────────────
// Bind to 0.0.0.0 (not 127.0.0.1) so the browser can connect directly for
// the visualizer without a proxy.

const wss = new WebSocketServer({ host: '0.0.0.0', port: 5455 });

function broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const client of wss.clients) {
        if (client.readyState === 1 /* OPEN */) {
            try { client.send(raw); } catch {}
        }
    }
}

function broadcastPixels() {
    // Serialize Uint32Array to a plain Array for JSON.
    // Clients that don't understand 'ledState' simply ignore it.
    broadcast({ type: 'ledState', pixels: Array.from(pixels) });
}

wss.on('listening', () => {
    console.log('[mock] LED daemon WS listening on ws://0.0.0.0:5455');
    console.log('[mock] Visualizer: open http://localhost:8080/visualizer in your browser');
});

wss.on('connection', (client, req) => {
    console.log('[mock] connection from', req.socket.remoteAddress);

    // Send current pixel state immediately so the visualizer shows
    // the current color on connect without waiting for a change.
    client.send(JSON.stringify({ type: 'ledState', pixels: Array.from(pixels) }));

    client.on('message', async (buf) => {
        let msg;
        try { msg = JSON.parse(buf.toString()); }
        catch { client.send(JSON.stringify({ ok: false, error: 'bad_json' })); return; }

        const { cmd } = msg;

        if (cmd === 'set') {
            const r = Math.max(0, Math.min(255, msg.r | 0));
            const g = Math.max(0, Math.min(255, msg.g | 0));
            const b = Math.max(0, Math.min(255, msg.b | 0));
            pixels.fill(rgbToInt(r, g, b));
            mockRender();
            client.send(JSON.stringify({ ok: true, type: 'set', r, g, b }));

        } else if (cmd === 'off') {
            pixels.fill(0);
            mockRender();
            client.send(JSON.stringify({ ok: true, type: 'off' }));

        } else if (cmd === 'ping') {
            client.send(JSON.stringify({ ok: true, type: 'pong' }));

        } else if (cmd === 'startSunrise') {
            const minutes = Number(msg.minutes) > 0 ? Number(msg.minutes) : undefined;
            const delayMs = Number(msg.delayMs) > 0 ? Number(msg.delayMs) : 40;
            let preset;
            try { preset = loadPreset(); } catch (e) { client.send(JSON.stringify({ ok: false, error: e.message })); return; }
            const mins = minutes ?? preset.minutes;
            client.send(JSON.stringify({ ok: true, type: 'sunriseQueued', minutes: mins }));
            runSunrise(mins, delayMs, broadcast).catch(e => console.error('[mock] sunrise error:', e));

        } else if (cmd === 'stopSunrise') {
            sunriseAbort = true;
            client.send(JSON.stringify({ ok: true, type: 'sunriseStopping' }));

        } else if (cmd === 'sunriseStatus') {
            client.send(JSON.stringify({ ok: true, type: 'sunriseStatus', running: sunriseRunning }));

        } else if (cmd === 'getAlarm') {
            client.send(JSON.stringify({ ok: true, type: 'alarm', ...getCurrentAlarm() }));

        } else if (cmd === 'setAlarm') {
            const hour = parseInt(msg.hour, 10);
            const minute = parseInt(msg.minute, 10);
            const enabled = msg.enabled !== false;
            if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                client.send(JSON.stringify({ ok: false, error: 'invalid_time' }));
                return;
            }
            const result = setAlarm(hour, minute, enabled);
            client.send(JSON.stringify({ type: 'alarmSet', ...result }));

        } else if (cmd === 'deleteAlarm') {
            const result = deleteAlarm();
            client.send(JSON.stringify({ type: 'alarmDeleted', ...result }));

        } else {
            client.send(JSON.stringify({ ok: false, error: 'unknown_cmd' }));
        }
    });

    client.on('close', () => console.log('[mock] client disconnected'));
});

process.on('SIGINT', () => {
    sunriseAbort = true;
    mockReset();
    process.exit(0);
});
