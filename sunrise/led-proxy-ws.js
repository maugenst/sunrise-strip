// led-proxy-ws.js
import { WebSocketServer, WebSocket } from 'ws';

const DAEMON_URL = 'ws://127.0.0.1:5455';

let daemon;                 // persistent client connection
const clients = new Set();  // connected UIs

function connectDaemon() {
    if (daemon && daemon.readyState === WebSocket.OPEN) return;

    console.log('proxy: connecting to daemon…', DAEMON_URL);
    daemon = new WebSocket(DAEMON_URL);

    daemon.on('open', () => {
        console.log('proxy: connected to daemon');
    });
    daemon.on('message', (data) => {
        // fan out daemon responses to all UIs
        for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
        }
    });
    daemon.on('close', () => {
        console.log('proxy: daemon connection closed, retrying in 1s');
        setTimeout(connectDaemon, 1000);
    });
    daemon.on('error', (e) => {
        console.log('proxy: daemon error', e.message);
    });
}

connectDaemon();

const wss = new WebSocketServer({
    host: '0.0.0.0',  // UI clients connect here
    port: 8081
});
console.log('proxy: UI WS listening ws://0.0.0.0:8081');

wss.on('connection', (ws, req) => {
    console.log('proxy: UI connected from', req.socket.remoteAddress);
    clients.add(ws);

    ws.on('message', (buf) => {
        // forward UI message to daemon (if connected)
        if (!daemon || daemon.readyState !== WebSocket.OPEN) {
            ws.send(JSON.stringify({ ok: false, error: 'daemon_not_connected' }));
            return;
        }
        // validation is light here; your UI sends only {"cmd":"set","r":..,"g":..,"b":..} or {"cmd":"off"}
        daemon.send(buf);
    });

    ws.on('close', () => clients.delete(ws));
});
