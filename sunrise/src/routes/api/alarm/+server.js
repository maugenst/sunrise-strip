// src/routes/api/alarm/+server.js
import { json } from '@sveltejs/kit';
import { getAlarm, setAlarm, deleteAlarm, getStatus } from '$lib/server/ledClient.js';

/**
 * GET /api/alarm - Get current alarm settings
 */
export async function GET() {
    try {
        const alarm = await getAlarm();
        return json({ ok: true, ...alarm, status: getStatus() });
    } catch (e) {
        return json({ ok: false, error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/alarm - Set or update alarm
 * Body: { hour: number, minute: number, enabled?: boolean, command?: string }
 */
export async function POST({ request }) {
    let body = {};
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { hour, minute, enabled = true, command } = body;

    if (typeof hour !== 'number' || typeof minute !== 'number') {
        return json(
            { ok: false, error: 'Missing or invalid hour/minute' },
            { status: 400 }
        );
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return json(
            { ok: false, error: 'Hour must be 0-23, minute must be 0-59' },
            { status: 400 }
        );
    }

    try {
        const result = await setAlarm(hour, minute, enabled, command);
        return json({ ok: true, ...result, status: getStatus() });
    } catch (e) {
        return json({ ok: false, error: e.message }, { status: 500 });
    }
}

/**
 * DELETE /api/alarm - Remove alarm from crontab
 */
export async function DELETE() {
    try {
        const result = await deleteAlarm();
        return json({ ok: true, ...result, status: getStatus() });
    } catch (e) {
        return json({ ok: false, error: e.message }, { status: 500 });
    }
}