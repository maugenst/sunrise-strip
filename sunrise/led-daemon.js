// led-daemon-ws.js
import { WebSocketServer } from 'ws';
import ws281x from 'rpi-ws281x-native';
import { execSync, exec } from 'child_process';

const LEDS = 300;
const CRONTAB_MARKER = '# SUNRISE-ALARM';

const channel = ws281x(LEDS, {
    dma: 10,
    freq: 800000,
    gpio: 10,
    invert: false,
    brightness: 255,
    stripType: ws281x.stripType.WS2812
});

const pixels = channel.array;

function rgbToInt(r, g, b) {
    // 0x00RRGGBB
    return ((0x00 & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Get current crontab entries (excluding our sunrise alarm entry)
 */
function getExistingCrontab() {
    try {
        const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
        // Filter out any existing sunrise alarm entries
        const lines = crontab.split('\n').filter(line => !line.includes(CRONTAB_MARKER));
        return lines.join('\n').trim();
    } catch (e) {
        console.error('Error reading crontab:', e.message);
        return '';
    }
}

/**
 * Get current alarm time from crontab
 */
function getCurrentAlarm() {
    try {
        const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
        const lines = crontab.split('\n');
        for (const line of lines) {
            if (line.includes(CRONTAB_MARKER)) {
                // Parse cron format: minute hour * * * command # SUNRISE-ALARM
                const match = line.match(/^(\d+)\s+(\d+)\s+/);
                if (match) {
                    const minute = parseInt(match[1], 10);
                    const hour = parseInt(match[2], 10);
                    return { hour, minute, enabled: true };
                }
            }
        }
        return { hour: 7, minute: 0, enabled: false };
    } catch (e) {
        console.error('Error getting alarm:', e.message);
        return { hour: 7, minute: 0, enabled: false };
    }
}

/**
 * Set alarm in crontab
 */
function setAlarm(hour, minute, enabled, command) {
    try {
        const existingCrontab = getExistingCrontab();
        
        let newCrontab = existingCrontab;
        
        if (enabled) {
            // Add the sunrise alarm entry
            const alarmLine = `${minute} ${hour} * * * ${command} ${CRONTAB_MARKER}`;
            newCrontab = existingCrontab ? `${existingCrontab}\n${alarmLine}` : alarmLine;
        }
        
        // Ensure newline at end
        if (newCrontab && !newCrontab.endsWith('\n')) {
            newCrontab += '\n';
        }
        
        // Write new crontab
        execSync(`echo "${newCrontab}" | crontab -`, { encoding: 'utf8' });
        
        console.log(`Alarm ${enabled ? 'set' : 'disabled'}: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
        return { ok: true, hour, minute, enabled };
    } catch (e) {
        console.error('Error setting alarm:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Delete alarm from crontab
 */
function deleteAlarm() {
    try {
        const existingCrontab = getExistingCrontab();
        
        // Ensure newline at end
        let newCrontab = existingCrontab;
        if (newCrontab && !newCrontab.endsWith('\n')) {
            newCrontab += '\n';
        }
        
        // Write crontab without the alarm entry
        if (newCrontab.trim()) {
            execSync(`echo "${newCrontab}" | crontab -`, { encoding: 'utf8' });
        } else {
            // If crontab would be empty, just clear it
            execSync('crontab -r 2>/dev/null || true', { encoding: 'utf8' });
        }
        
        console.log('Alarm deleted');
        return { ok: true, enabled: false };
    } catch (e) {
        console.error('Error deleting alarm:', e.message);
        return { ok: false, error: e.message };
    }
}

const wss = new WebSocketServer({
    host: '127.0.0.1', // only localhost
    port: 5455
});

wss.on('listening', () => {
    console.log('LED daemon WS listening on ws://127.0.0.1:5455');
});

wss.on('connection', (ws, req) => {
    console.log('daemon: connection from', req.socket.remoteAddress);

    ws.on('message', (buf) => {
        try {
            const msg = JSON.parse(buf.toString());
            if (msg.cmd === 'set') {
                let r = msg.r | 0;
                let g = msg.g | 0;
                let b = msg.b | 0;
                r = Math.max(0, Math.min(255, r));
                g = Math.max(0, Math.min(255, g));
                b = Math.max(0, Math.min(255, b));

                const colorInt = rgbToInt(r, g, b);
                pixels.fill(colorInt);
                ws281x.render(pixels);
                ws.send(JSON.stringify({ ok: true, type: 'set', r, g, b }));
            } else if (msg.cmd === 'off') {
                pixels.fill(0);
                ws281x.render(pixels);
                ws.send(JSON.stringify({ ok: true, type: 'off' }));
            } else if (msg.cmd === 'ping') {
                ws.send(JSON.stringify({ ok: true, type: 'pong' }));
            } else if (msg.cmd === 'getAlarm') {
                const alarm = getCurrentAlarm();
                ws.send(JSON.stringify({ ok: true, type: 'alarm', ...alarm }));
            } else if (msg.cmd === 'setAlarm') {
                const hour = parseInt(msg.hour, 10);
                const minute = parseInt(msg.minute, 10);
                const enabled = msg.enabled !== false;
                const command = msg.command || 'cd /home/marius/github/sunrise-strip/sunrise && npm run start:sunrise';
                
                if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                    ws.send(JSON.stringify({ ok: false, error: 'invalid_time' }));
                    return;
                }
                
                const result = setAlarm(hour, minute, enabled, command);
                ws.send(JSON.stringify({ type: 'alarmSet', ...result }));
            } else if (msg.cmd === 'deleteAlarm') {
                const result = deleteAlarm();
                ws.send(JSON.stringify({ type: 'alarmDeleted', ...result }));
            } else {
                ws.send(JSON.stringify({ ok: false, error: 'unknown_cmd' }));
            }
        } catch (e) {
            ws.send(JSON.stringify({ ok: false, error: 'bad_json' }));
        }
    });

    ws.on('close', () => console.log('daemon: client disconnected'));
});

process.on('SIGINT', () => {
    pixels.fill(0);
    ws281x.render(pixels);
    ws281x.reset();
    process.exit(0);
});