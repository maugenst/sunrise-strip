// src/routes/api/preset/+server.js
import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';

const PRESET_PATH = path.join(process.cwd(), 'sunrise-preset.json');

async function loadPresetFromFile() {
    try {
        const content = await fs.readFile(PRESET_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        // file missing or invalid -> return null so caller can fallback
        return null;
    }
}

async function savePresetToFile(preset) {
    const content = JSON.stringify(preset, null, 2);

    console.log("Writing preset to file:", content);
    console.log("At path:", PRESET_PATH);

    await fs.writeFile(PRESET_PATH, content, 'utf-8');
}

export async function GET() {
    const preset = await loadPresetFromFile();
    if (!preset) {
        return json(
            {
                ok: false,
                error: 'no_preset',
                rows: [],
                simulationMinutes: 1
            },
            { status: 200 }
        );
    }
    return json({ ok: true, ...preset });
}

export async function POST({ request }) {
    let body = {};
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const { rows, simulationMinutes } = body;

    if (!Array.isArray(rows)) {
        return json({ ok: false, error: 'rows must be an array' }, { status: 400 });
    }

    // very light validation
    const cleanedRows = rows.map((r) => ({
        time: Number(r.time) || 0,
        red: Number(r.red) || 0,
        green: Number(r.green) || 0,
        blue: Number(r.blue) || 0
    }));

    const minutesNum = Number(simulationMinutes) || 1;

    const preset = {
        simulationMinutes: minutesNum,
        rows: cleanedRows
    };

    console.log("Saving preset:", preset);

    try {
        await savePresetToFile(preset);
        return json({ ok: true });
    } catch (e) {
        return json(
            { ok: false, error: 'write_failed', message: String(e) },
            { status: 500 }
        );
    }
}
