// File: src/routes/api/stop/+server.js
import { access, writeFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';

const STOP_PATH = process.env.STOP_FILE_PATH || 'STOP';
const headers = { 'content-type': 'application/json' };

export async function GET() {
    try {
        await access(STOP_PATH, constants.F_OK);
        return new Response(JSON.stringify({ ok: true, exists: true }), { headers });
    } catch {
        return new Response(JSON.stringify({ ok: true, exists: false }), { headers });
    }
}

export async function POST() {
    try {
        await writeFile(STOP_PATH, `STOP created at ${new Date().toISOString()}\n`);
        return new Response(JSON.stringify({ ok: true, created: true }), { headers });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers });
    }
}

export async function DELETE() {
    try {
        await unlink(STOP_PATH);
        return new Response(JSON.stringify({ ok: true, deleted: true }), { headers });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers });
    }
}
