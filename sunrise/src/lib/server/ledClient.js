// src/lib/server/ledClient.js
import WebSocket from 'ws';

const DAEMON_URL = 'ws://127.0.0.1:5455';

let ws;
let connected = false;
let queue = [];
let reconnectTimer;

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
        // optional: log or handle daemon messages
        console.log('[ledClient] daemon:', data.toString());
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
