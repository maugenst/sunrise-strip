// led-daemon-ws.js
import { WebSocketServer } from 'ws';
import ws281x from 'rpi-ws281x-native';

const LEDS = 300;
const channel = ws281x(LEDS, {
    dma: 10,
    freq: 800000,
    gpio: 18,
    invert: false,
    brightness: 255,
    stripType: ws281x.stripType.WS2812
});
const pixels = channel.array;

function rgbToInt(r, g, b) {
    return ((0x00 & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

const wss = new WebSocketServer({
    host: '127.0.0.1',   // <— only localhost
    port: 5455
});

wss.on('listening', () => {
    console.log('LED daemon WS listening ws://127.0.0.1:5455');
});

wss.on('connection', (ws, req) => {
    console.log('daemon: UI-proxy connected from', req.socket.remoteAddress);
    ws.on('message', (buf) => {
        try {
            const msg = JSON.parse(buf.toString());
            if (msg.cmd === 'set') {
                const r = Math.max(0, Math.min(255, msg.r|0));
                const g = Math.max(0, Math.min(255, msg.g|0));
                const b = Math.max(0, Math.min(255, msg.b|0));
                const colorInt = rgbToInt(r, g, b);
                pixels.fill(colorInt);
                ws281x.render(pixels);
                ws.send(JSON.stringify({ ok: true, echo: { r, g, b } }));
            } else if (msg.cmd === 'off') {
                pixels.fill(0);
                ws281x.render(pixels);
                ws.send(JSON.stringify({ ok: true, echo: { r: 0, g: 0, b: 0 } }));
            } else if (msg.cmd === 'ping') {
                ws.send(JSON.stringify({ ok: true, pong: true }));
            } else {
                ws.send(JSON.stringify({ ok: false, error: 'unknown_cmd' }));
            }
        } catch (e) {
            ws.send(JSON.stringify({ ok: false, error: 'bad_json' }));
        }
    });
    ws.on('close', () => console.log('daemon: proxy disconnected'));
});

process.on('SIGINT', () => {
    pixels.fill(0);
    ws281x.render(pixels);
    ws281x.reset();
    process.exit(0);
});
