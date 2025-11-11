/**
 * Corrected Node.js script fixing the RGB assignment issue using array destructuring.
 */

import ws281x from 'rpi-ws281x-native';
import chroma from 'chroma-js';
import fetch from 'node-fetch';

const LEDS = 300;

const options = {
    dma: 10,
    freq: 800000,
    gpio: 18,
    invert: false,
    brightness: 255,
    stripType: ws281x.stripType.WS2812
};

const channel = ws281x(LEDS, options);
const pixels = channel.array;

console.log("ws281x configured successfully.");

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

function rgbToInt(r, g, b) {
    return ((0x00 & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}

const sunriseKeyframesKelvin = [
    { time: 0, kelvin: 1800, intensity: 0.0 },
    { time: 5, kelvin: 1900, intensity: 0.05 },
    { time: 10, kelvin: 2000, intensity: 0.05 },
    { time: 15, kelvin: 2100, intensity: 0.05 },
    { time: 20, kelvin: 2200, intensity: 0.05 },
    { time: 25, kelvin: 2300, intensity: 0.05 },
    { time: 30, kelvin: 2400, intensity: 0.1 },
    { time: 35, kelvin: 2500, intensity: 0.1 },
    { time: 40, kelvin: 2700, intensity: 0.1 },
    { time: 45, kelvin: 2800, intensity: 0.15 },
    { time: 50, kelvin: 3000, intensity: 0.2 },
    { time: 55, kelvin: 3200, intensity: 0.3 },
    { time: 60, kelvin: 3500, intensity: 0.35 },
    { time: 65, kelvin: 3700, intensity: 0.40 },
    { time: 70, kelvin: 4000, intensity: 0.45 },
    { time: 75, kelvin: 4200, intensity: 0.50 },
    { time: 80, kelvin: 4400, intensity: 0.55 },
    { time: 85, kelvin: 4600, intensity: 0.6 },
    { time: 90, kelvin: 4800, intensity: 0.7 },
    { time: 95, kelvin: 5000, intensity: 0.8 },
    { time: 100, kelvin: 6000, intensity: 1.0 }
];

function calculateCurrentColorAndIntensity(progress) {
    let startFrame, endFrame;

    for (let i = 0; i < sunriseKeyframesKelvin.length - 1; i++) {
        if (progress >= sunriseKeyframesKelvin[i].time && progress <= sunriseKeyframesKelvin[i + 1].time) {
            startFrame = sunriseKeyframesKelvin[i];
            endFrame = sunriseKeyframesKelvin[i + 1];
            break;
        }
    }

    if (!startFrame || !endFrame) {
        const frame = progress <= 0 ? sunriseKeyframesKelvin[0] : sunriseKeyframesKelvin[sunriseKeyframesKelvin.length - 1];
        return { kelvin: frame.kelvin, intensity: frame.intensity };
    }

    const segmentDuration = endFrame.time - startFrame.time;
    const timeInSegment = progress - startFrame.time;
    const t = segmentDuration > 0 ? (timeInSegment / segmentDuration) : 0;

    const currentKelvin = lerp(startFrame.kelvin, endFrame.kelvin, t);
    const currentIntensity = lerp(startFrame.intensity, endFrame.intensity, t);

    return { kelvin: currentKelvin, intensity: currentIntensity };
}

// --- Main Sunrise Loop ---


(async () => {
    const totalSunriseMinutes = 1;
    const totalSteps = totalSunriseMinutes * 60 * 20;
    const delayPerStep = 50;

    let audio_started = false;

    console.log(`Starting KELVIN-based sunrise simulation over ${totalSunriseMinutes} minute(s)...`);

    for (let step = 0; step <= totalSteps; step++) {
        const progressPercent = (step / totalSteps) * 100;

        const { kelvin, intensity } = calculateCurrentColorAndIntensity(progressPercent);

        // Use chroma-js to convert Kelvin to RGB array [r, g, b]
        const rgbColorArray = chroma.kelvin(kelvin).rgb();

        // --- FIX IS HERE: Use array destructuring for correct assignment ---
        let [r, g, b] = rgbColorArray;
        // ------------------------------------------------------------------

        // Apply intensity scaling (dimming effect)
        r = Math.round(r * intensity);
        g = Math.round(g * intensity);
        b = Math.round(b * intensity);

        const colorInt = rgbToInt(r, g, b);

        // Clear the entire strip every cycle
        pixels.fill(colorInt);

        if (progressPercent > 50 && !audio_started) {
            const response = await fetch('http://sunriseaudio:5000/fadein');
            const data = await response.json();
            console.log(`Audio fade-in response: ${JSON.stringify(data)}`);
            audio_started = true;
        }

        console.log(`Progress: ${progressPercent.toFixed(1)}% | Kelvin: ${kelvin.toFixed(0)}K | Intensity: ${(intensity*100).toFixed(0)}% | RGB: ${r},${g},${b} | ColorInt: 0x${colorInt.toString(16).toUpperCase().padStart(8, '0')}`);

        ws281x.render(pixels);

        if (step < totalSteps) {
            await wait(delayPerStep);
        }
    }

    console.log("Sunrise simulation complete.");
    const response = await fetch('http://sunriseaudio:5000/fadeout');
    const data = await response.json();
    console.log(`Audio fade-out response: ${JSON.stringify(data)}`);
    audio_started = false;
    ws281x.reset();
})();
