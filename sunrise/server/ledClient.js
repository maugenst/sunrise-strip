// src/lib/server/ledClient.js
import WebSocket from 'ws';

const DAEMON_URL = 'ws://127.0.0.1:5455';

let ws;
let connected = false;
let queue = [];
let reconnectTimer;
let responseHandlers = new Map();
let messageId = 0;

/**
 * Establish / re-establish connection to the daemon.
 */
function connect() {
    if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
        return;
    }

    ws = new WebSocket(DAEMON_URL);

    ws.on('open', () => {
        connected = true;
        console.log('[ledClient] connected to daemon', DAEMON_URL);

        // flush queued messages
        for (const msg of queue) {
            try {
                ws.send(JSON.stringify(msg));
            } catch (e) {
                console.error('[ledClient] failed to send queued msg', e);
            }
        }
        queue = [];
    });

    ws.on('close', () => {
        connected = false;
        console.log('[ledClient] connection closed, retrying in 1s');
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, 1000);
        }
    });

    ws.on('error', (err) => {
        connected = false;
        console.error('[ledClient] error', err.message);
    });

    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());
            const type = response.type;
            // Don't log high-frequency ledState broadcasts
            if (type !== 'ledState') console.log('[ledClient] daemon:', data.toString());
            if (type === 'alarm' || type === 'alarmSet' || type === 'alarmDeleted' ||
                type === 'sunriseStatus' || type === 'sunriseStopping' ||
                type === 'sunriseQueued') {
                const handlers = Array.from(responseHandlers.entries());
                for (const [id, handler] of handlers) {
                    if (handler.type === type ||
                        (handler.type === 'alarm' && type === 'alarm') ||
                        (handler.type === 'setAlarm' && type === 'alarmSet') ||
                        (handler.type === 'deleteAlarm' && type === 'alarmDeleted') ||
                        (handler.type === 'sunriseStatus' && type === 'sunriseStatus') ||
                        (handler.type === 'stopSunrise' && type === 'sunriseStopping') ||
                        (handler.type === 'sunriseQueued' && type === 'sunriseQueued')) {
                        handler.resolve(response);
                        responseHandlers.delete(id);
                        break;
                    }
                }
            }
        } catch (e) {
            // ignore parse errors
        }
    });
}

// kick off the connection at module load
connect();

function send(msg) {
    if (connected && ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(msg));
        } catch (e) {
            console.error('[ledClient] send error', e);
        }
    } else {
        // buffer until we reconnect
        queue.push(msg);
        connect();
    }
}

/**
 * Send a message and wait for a response
 */
function sendAndWait(msg, expectedType, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const id = ++messageId;
        
        const timer = setTimeout(() => {
            responseHandlers.delete(id);
            reject(new Error('Timeout waiting for response'));
        }, timeout);
        
        responseHandlers.set(id, {
            type: expectedType,
            resolve: (response) => {
                clearTimeout(timer);
                resolve(response);
            }
        });
        
        send(msg);
    });
}

export function setColor(r, g, b) {
    send({ cmd: 'set', r, g, b });
}

export function turnOff() {
    send({ cmd: 'off' });
}

export function getStatus() {
    return {
        connected,
        daemonUrl: DAEMON_URL,
        queued: queue.length
    };
}

/**
 * Get current alarm from crontab via daemon
 */
export async function getAlarm() {
    try {
        const response = await sendAndWait({ cmd: 'getAlarm' }, 'alarm');
        return response;
    } catch (e) {
        console.error('[ledClient] getAlarm error:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Set alarm in crontab via daemon
 */
export async function setAlarm(hour, minute, enabled = true, command = null) {
    try {
        const msg = { cmd: 'setAlarm', hour, minute, enabled };
        if (command) {
            msg.command = command;
        }
        const response = await sendAndWait(msg, 'setAlarm');
        return response;
    } catch (e) {
        console.error('[ledClient] setAlarm error:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Delete alarm from crontab via daemon
 */
export async function deleteAlarm() {
    try {
        const response = await sendAndWait({ cmd: 'deleteAlarm' }, 'deleteAlarm');
        return response;
    } catch (e) {
        console.error('[ledClient] deleteAlarm error:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Start the sunrise animation on the daemon (hardware mode)
 */
export async function startSunrise(minutes, delayMs = 40) {
    try {
        const msg = { cmd: 'startSunrise', delayMs };
        if (minutes) msg.minutes = minutes;
        const response = await sendAndWait(msg, 'sunriseQueued');
        return response;
    } catch (e) {
        console.error('[ledClient] startSunrise error:', e.message);
        return { ok: false, error: e.message };
    }
}
export async function stopSunrise() {
    try {
        const response = await sendAndWait({ cmd: 'stopSunrise' }, 'stopSunrise');
        return response;
    } catch (e) {
        console.error('[ledClient] stopSunrise error:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Get current sunrise running status from daemon
 */
export async function getSunriseStatus() {
    try {
        const response = await sendAndWait({ cmd: 'sunriseStatus' }, 'sunriseStatus');
        return response;
    } catch (e) {
        console.error('[ledClient] sunriseStatus error:', e.message);
        return { ok: false, running: false, error: e.message };
    }
}