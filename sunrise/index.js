// index.js
// Sunrise RGB simulation with exact total duration matching --minutes.
// Continuously checks for `STOP` file; will not exit before it exists.
// If `STOP` appears during the sunrise loop, the simulation aborts early and proceeds to fade out.

import ws281x from 'rpi-ws281x-native';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/** @typedef {{time:number, red:number, green:number, blue:number}} Keyframe */
/** @typedef {{minutes?:number, delay?:number, help:boolean}} CliArgs */

const LEDS = 300;
const options = {
  dma: 10,
  freq: 800000,
  gpio: 10,
  invert: false,
  brightness: 255,
  stripType: ws281x.stripType.WS2812
};

const channel = ws281x(LEDS, options);
/** @type {Uint32Array} */
const pixels = channel.array;

console.log('ws281x configured successfully.');

const presetPath = path.resolve(process.cwd(), 'sunrise-preset.json');
const stopFilePath = path.resolve(process.cwd(), 'STOP');

/**
 * Parse CLI arguments.
 * @returns {CliArgs}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {CliArgs} */
  const result = { help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      result.help = true;
    } else if (a === '--minutes' || a === '-m') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) { console.error('Invalid value for --minutes'); process.exit(1); }
      result.minutes = v;
    } else if (a === '--delay' || a === '-d') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) { console.error('Invalid value for --delay'); process.exit(1); }
      result.delay = v;
    } else {
      console.warn(`Ignoring unknown argument: ${a}`);
    }
  }
  return result;
}

/** Print help. */
function printHelp() {
  console.log(`
Sunrise RGB Simulation
----------------------
Flags:
  --minutes, -m <number>   Total duration in minutes
  --delay,   -d <ms>       Requested delay per step (may be adjusted)
  --help,    -h            Show this help

Env:
  SUNRISE_MINUTES
  SUNRISE_DELAY_MS

Stop condition:
  Script monitors file: ${stopFilePath} (required before shutdown)

Example:
  node index.js --minutes 15 --delay 40
`);
}

/**
 * Clamp to 0..255.
 * @param {number} v
 * @returns {number}
 */
function clamp255(v) {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(255, Math.max(0, Math.round(v))) : 0;
}

/**
 * Sleep.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Linear interpolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Pack RGB into 32-bit int.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
function rgbToInt(r, g, b) { return ((0x00 & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF); }

/**
 * Interpolate RGB given progress 0..100.
 * @param {number} progressPercent
 * @returns {{r:number,g:number,b:number}}
 */
function interpolateRGB(progressPercent) {
  let start = sunriseKeyframes[0];
  let end = sunriseKeyframes[sunriseKeyframes.length - 1];
  for (let i = 0; i < sunriseKeyframes.length - 1; i++) {
    const a = sunriseKeyframes[i];
    const b = sunriseKeyframes[i + 1];
    if (progressPercent >= a.time && progressPercent <= b.time) { start = a; end = b; break; }
  }
  if (start === end || end.time === start.time) return { r: start.red, g: start.green, b: start.blue };
  const t = (progressPercent - start.time) / (end.time - start.time);
  return {
    r: Math.round(lerp(start.red, end.red, t)),
    g: Math.round(lerp(start.green, end.green, t)),
    b: Math.round(lerp(start.blue, end.blue, t))
  };
}

/**
 * Format elapsed ms as mm:ss.mmm
 * @param {number} ms
 * @returns {string}
 */
function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}

/**
 * Wait until STOP file exists (poll every second).
 * @returns {Promise<void>}
 */
async function waitForStopFile() {
  if (fs.existsSync(stopFilePath)) return;
  console.log(`Waiting for STOP file: ${stopFilePath}`);
  while (!fs.existsSync(stopFilePath)) {
    await wait(1000);
  }
  console.log('STOP file detected.');
}

const cli = parseArgs();
if (cli.help) { printHelp(); process.exit(0); }

/** @type {Keyframe[]} */
let sunriseKeyframes = [];
let totalSunriseMinutes = 1;
let requestedDelayMs = 50;

try {
  const raw = fs.readFileSync(presetPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Preset root must be an object');
  if (!Array.isArray(parsed.rows)) throw new Error('Preset missing rows array');
  if (Number(parsed.simulationMinutes) > 0) totalSunriseMinutes = Number(parsed.simulationMinutes);

  sunriseKeyframes = parsed.rows
    .filter(
      /** @param {any} f */ (f) =>
        typeof f.time === 'number' &&
        typeof f.red === 'number' &&
        typeof f.green === 'number' &&
        typeof f.blue === 'number'
    )
    .map(
      /** @param {any} f */ (f) => ({
        time: Math.min(100, Math.max(0, f.time)),
        red: clamp255(f.red),
        green: clamp255(f.green),
        blue: clamp255(f.blue)
      })
    )
    .sort(
      /** @param {Keyframe} a @param {Keyframe} b */ (a, b) => a.time - b.time
    );

  if (sunriseKeyframes.length === 0) throw new Error('No valid keyframes');
  if (sunriseKeyframes[0].time > 0) {
    const first = sunriseKeyframes[0];
    sunriseKeyframes.unshift({ time: 0, red: first.red, green: first.green, blue: first.blue });
  }
  if (sunriseKeyframes[sunriseKeyframes.length - 1].time < 100) {
    const last = sunriseKeyframes[sunriseKeyframes.length - 1];
    sunriseKeyframes.push({ time: 100, red: last.red, green: last.green, blue: last.blue });
  }
} catch (e) {
  console.error('Failed to load sunrise RGB preset:', e instanceof Error ? e.message : String(e));
  process.exit(1);
}

// Env overrides
const envMinutes = Number(process.env.SUNRISE_MINUTES);
if (Number.isFinite(envMinutes) && envMinutes > 0) totalSunriseMinutes = envMinutes;
const envDelay = Number(process.env.SUNRISE_DELAY_MS);
if (Number.isFinite(envDelay) && envDelay > 0) requestedDelayMs = envDelay;
// CLI overrides
if (cli.minutes) totalSunriseMinutes = cli.minutes;
if (cli.delay) requestedDelayMs = cli.delay;

// Duration math
const targetDurationMs = totalSunriseMinutes * 60 * 1000;
let steps = Math.max(1, Math.round(targetDurationMs / requestedDelayMs));
const actualDelayMs = targetDurationMs / steps;

console.log(`Loaded ${sunriseKeyframes.length} keyframes. Target: ${totalSunriseMinutes} min (${targetDurationMs} ms). Requested delay: ${requestedDelayMs} ms. Steps: ${steps}. Adjusted delay: ${actualDelayMs.toFixed(3)} ms. STOP file: ${stopFilePath}`);

(async () => {
  let audio_started = false;
  const startHr = process.hrtime.bigint();
  let stopDetectedDuringLoop = false;

  console.log('Starting sunrise...');

  for (let step = 0; step <= steps; step++) {
    // Continuous STOP check
    if (fs.existsSync(stopFilePath)) {
      stopDetectedDuringLoop = true;
      console.log('STOP file detected during sunrise loop. Aborting remaining steps.');
      break;
    }

    const progressPercent = (step / steps) * 100;
    const { r, g, b } = interpolateRGB(progressPercent);
    const colorInt = rgbToInt(r, g, b);
    pixels.fill(colorInt);

    if (progressPercent > 95 && !audio_started) {
      try {
        const response = await fetch('http://sunrise:5000/fadein');
        const data = await response.json().catch(() => ({}));
        console.log(`Audio fade-in response: ${JSON.stringify(data)}`);
      } catch (e) {
        console.warn('Audio fade-in request failed:', e instanceof Error ? e.message : String(e));
      }
      audio_started = true;
    }

    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    console.log(
      `Progress: ${progressPercent.toFixed(2)}% | Time: ${formatElapsed(elapsedMs)} | RGB: ${r},${g},${b} | ColorInt: 0x${colorInt
        .toString(16)
        .toUpperCase()
        .padStart(8, '0')}`
    );

    ws281x.render(); // typings expect no args
    if (step < steps) await wait(actualDelayMs);
  }

  if (!stopDetectedDuringLoop) {
    console.log('Sunrise loop finished. Awaiting STOP file before shutdown.');
    await waitForStopFile();
  }

  try {
    const response = await fetch('http://sunrise:5000/fadeout');
    const data = await response.json().catch(() => ({}));
    console.log(`Audio fade-out response: ${JSON.stringify(data)}`);
  } catch (e) {
    console.warn('Audio fade-out request failed:', e instanceof Error ? e.message : String(e));
  }

  ws281x.reset();
  console.log('Shutdown after STOP file detected.');
})();
