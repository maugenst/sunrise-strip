#!/usr/bin/env node
// scripts/stop-sunrise.js — send stopSunrise + off to the running daemon
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:5455');

ws.on('error', e => { console.error('Cannot connect to daemon:', e.message); process.exit(1); });

ws.on('open', () => {
    ws.send(JSON.stringify({ cmd: 'stopSunrise' }));
    ws.send(JSON.stringify({ cmd: 'off' }));
    console.log('Stop signal sent — LEDs will turn off.');
    setTimeout(() => { ws.close(); process.exit(0); }, 400);
});
