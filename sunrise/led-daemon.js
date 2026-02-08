// led-daemon-ws.js
import { WebSocketServer } from 'ws';
import ws281x from 'rpi-ws281x-native';

const LEDS = 300;

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
