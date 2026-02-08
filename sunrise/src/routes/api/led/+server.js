// src/routes/api/led/+server.js
import { json } from '@sveltejs/kit';
import { setColor, turnOff, getStatus } from '$lib/server/ledClient.js';

export async function POST({ request }) {
    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    if (body.cmd === 'off') {
        turnOff();
        return json({ ok: true, action: 'off', status: getStatus() });
    }

    const { r, g, b } = body;
    if (
        typeof r !== 'number' ||
        typeof g !== 'number' ||
        typeof b !== 'number'
    ) {
        return json(
            { ok: false, error: 'Missing or invalid r,g,b' },
            { status: 400 }
        );
    }

    setColor(r, g, b);
    return json({ ok: true, action: 'set', status: getStatus() });
}

export async function GET() {
    // allow UI to query status if you ever want it
    return json({ ok: true, status: getStatus() });
}

