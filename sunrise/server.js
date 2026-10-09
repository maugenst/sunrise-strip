// server.js — Fastify HTTP server replacing SvelteKit
import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
    setColor, turnOff, getStatus,
    getAlarm, setAlarm, deleteAlarm,
    stopSunrise, getSunriseStatus, startSunrise,
    onBroadcast
} from './server/ledClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESET_PATH = path.join(__dirname, 'sunrise-preset.json');

const app = Fastify({ logger: { level: 'info' } });

// ── static files ─────────────────────────────────────────────────────────────

app.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/'
});

// Serve birds.mp3 from sunrise-audio/ for the browser audio sandbox
app.get('/birds.mp3', async (req, reply) => {
    const audioPath = path.join(__dirname, '..', 'sunrise-audio', 'birds.mp3');
    return reply.sendFile('birds.mp3', path.join(__dirname, '..', 'sunrise-audio'));
});

// ── alarm routes ─────────────────────────────────────────────────────────────

app.get('/api/alarm', async (req, reply) => {
    try {
        const alarm = await getAlarm();
        return { ok: true, ...alarm, status: getStatus() };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

app.post('/api/alarm', async (req, reply) => {
    const body = req.body ?? {};
    let { hour, minute, time, enabled = true, command } = body;

    if (typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time)) {
        const [hh, mm] = time.split(':').map(Number);
        hour = hh;
        minute = mm;
    }

    if (typeof hour !== 'number' || typeof minute !== 'number') {
        return reply.code(400).send({ ok: false, error: 'Missing or invalid hour/minute' });
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return reply.code(400).send({ ok: false, error: 'Hour must be 0-23, minute must be 0-59' });
    }

    try {
        const result = await setAlarm(hour, minute, enabled, command);
        return { ok: true, ...result, status: getStatus() };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

app.delete('/api/alarm', async (req, reply) => {
    try {
        const result = await deleteAlarm();
        return { ok: true, ...result, status: getStatus() };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

// ── LED routes ────────────────────────────────────────────────────────────────

app.post('/api/led', async (req, reply) => {
    const body = req.body ?? {};

    if (body.cmd === 'off') {
        turnOff();
        return { ok: true, action: 'off', status: getStatus() };
    }

    const { r, g, b } = body;
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') {
        return reply.code(400).send({ ok: false, error: 'Missing or invalid r,g,b' });
    }

    setColor(r, g, b);
    return { ok: true, action: 'set', status: getStatus() };
});

app.get('/api/led', async () => {
    return { ok: true, status: getStatus() };
});

// ── preset routes ─────────────────────────────────────────────────────────────

app.get('/api/preset', async (req, reply) => {
    try {
        const content = await fs.readFile(PRESET_PATH, 'utf-8');
        const preset = JSON.parse(content);
        return { ok: true, ...preset };
    } catch {
        return { ok: false, error: 'no_preset', rows: [], simulationMinutes: 15 };
    }
});

app.post('/api/preset', async (req, reply) => {
    const body = req.body ?? {};
    const { rows, simulationMinutes } = body;

    if (!Array.isArray(rows)) {
        return reply.code(400).send({ ok: false, error: 'rows must be an array' });
    }

    const cleanedRows = rows.map(r => ({
        time: Number(r.time) || 0,
        red: Number(r.red) || 0,
        green: Number(r.green) || 0,
        blue: Number(r.blue) || 0
    }));

    const preset = {
        simulationMinutes: Number(simulationMinutes) || 15,
        rows: cleanedRows
    };

    try {
        await fs.writeFile(PRESET_PATH, JSON.stringify(preset, null, 2), 'utf-8');
        return { ok: true };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: 'write_failed', message: String(e) });
    }
});

// ── sunrise start/stop routes ─────────────────────────────────────────────────

app.post('/api/sunrise', async (req, reply) => {
    try {
        const { minutes, delayMs } = req.body ?? {};
        const result = await startSunrise(minutes, delayMs);
        return { ok: true, ...result };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

// ── stop / sunrise-status routes ──────────────────────────────────────────────

app.get('/api/stop', async (req, reply) => {
    try {
        const status = await getSunriseStatus();
        return { ok: true, running: status.running ?? false };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

app.post('/api/stop', async (req, reply) => {
    try {
        const result = await stopSunrise();
        return { ok: true, ...result };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

app.delete('/api/stop', async (req, reply) => {
    try {
        const result = await stopSunrise();
        return { ok: true, ...result };
    } catch (e) {
        return reply.code(500).send({ ok: false, error: e.message });
    }
});

// ── SPA routing: /simulation → simulation.html ────────────────────────────────

app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/simulation')) {
        return reply.sendFile('simulation.html');
    }
    if (req.url.startsWith('/visualizer')) {
        return reply.sendFile('visualizer.html');
    }
    return reply.code(404).send({ error: 'Not found' });
});

// ── start ─────────────────────────────────────────────────────────────────────

try {
    await app.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Sunrise server running on http://0.0.0.0:8080');
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

// ── WebSocket event proxy on port 8081 ────────────────────────────────────────
// Bridges daemon events (sunriseStarted/Progress/Done) to browser clients.
// Browsers connect to ws://[host]:8081/events — safe to expose on LAN since
// it only forwards read-only broadcast events (no LED control commands).

const eventWss = new WebSocketServer({ port: 8081, host: '0.0.0.0' });

eventWss.on('listening', () => console.log('Event proxy WS on ws://0.0.0.0:8081'));

eventWss.on('connection', (client) => {
    // no-op: clients only receive, they don't send commands here
    client.on('error', () => {});
});

// Register a broadcast listener in ledClient — called whenever the daemon
// sends a message. We forward sunrise events to all browser clients.
onBroadcast((msg) => {
    const FORWARD = new Set(['sunriseStarted', 'sunriseProgress', 'sunriseDone',
                             'sunriseStopping', 'sunriseQueued', 'sunriseStatus']);
    if (!FORWARD.has(msg.type)) return;
    const raw = JSON.stringify(msg);
    for (const client of eventWss.clients) {
        if (client.readyState === 1) {
            try { client.send(raw); } catch {}
        }
    }
});
