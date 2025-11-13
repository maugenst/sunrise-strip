<script>
    import { onMount } from 'svelte';
    import ColorChannelChart from '$lib/ColorChannelChart.svelte';
    import { recomputeDerived } from '$lib/sunriseUtils.js';
    const PROXY_WS_URL = 'ws://your-pi-or-hostname:8081'; // <-- set your host/IP
    let ws;
    let wsConnected = false;

    function connectWS() {
        try {
            ws = new WebSocket(PROXY_WS_URL);
            ws.onopen = () => {
                wsConnected = true;
                logs = [...logs, '[ws] connected to LED proxy'].slice(-400);
            };
            ws.onclose = () => {
                wsConnected = false;
                logs = [...logs, '[ws] disconnected, retrying…'].slice(-400);
                setTimeout(connectWS, 1000);
            };
            ws.onerror = (e) => {
                logs = [...logs, `[ws] error: ${e?.message ?? e}`].slice(-400);
            };
            ws.onmessage = (evt) => {
                // daemon/proxy responses
                logs = [...logs, `[ws] ${evt.data}`].slice(-400);
            };
        } catch (err) {
            logs = [...logs, `[ws] failed: ${err}`].slice(-400);
            setTimeout(connectWS, 1000);
        }
    }

    onMount(() => {
        connectWS();
    });

    const STEP_COUNT = 20;
    const STORAGE_KEY = 'sunrise-sim-v1';
    const LED_API_URL = 'http://127.0.0.1:5454/color'; // root daemon endpoint

    let rows = Array.from({ length: STEP_COUNT }, (_, i) => {
        const time = Math.round((i / (STEP_COUNT - 1)) * 100);
        const base = { time, red: 0, green: 0, blue: 0, kelvin: 1800, intensity: 0 };
        return recomputeDerived(base);
    });

    let simulationMinutes = 1;
    let isPlaying = false;
    let playProgress = 0;
    let lastTimestamp = 0;
    let logs = [];
    let sliderPercent = 0;
    let hasLoaded = false;

    onMount(() => {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.rows) && parsed.rows.length === STEP_COUNT) {
                        rows = parsed.rows.map((r) => recomputeDerived(r));
                    }
                    if (typeof parsed.simulationMinutes === 'number') {
                        simulationMinutes = parsed.simulationMinutes;
                    }
                } catch (e) {
                    console.warn('Could not parse stored data', e);
                }
            }
        }
        hasLoaded = true;
    });

    // persist only after load
    $: if (hasLoaded) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    rows,
                    simulationMinutes
                })
            );
        }
    }

    function updateRow(index, patch) {
        rows = rows.map((r, i) => (i === index ? recomputeDerived({ ...r, ...patch }) : r));
    }

    function handleChannelChange(event) {
        const { index, value, channel } = event.detail;
        updateRow(index, { [channel]: value });
    }

    function handleTableChange(index, key, value) {
        let num = Number(value);
        if (Number.isNaN(num)) num = 0;
        num = Math.min(255, Math.max(0, num));
        updateRow(index, { [key]: num });
    }

    function handleTimeChange(index, value) {
        let num = Number(value);
        if (Number.isNaN(num)) num = 0;
        num = Math.min(100, Math.max(0, num));
        rows = rows.map((r, i) => (i === index ? { ...r, time: num } : r));
    }

    function togglePlay() {
        if (isPlaying) {
            isPlaying = false;
            return;
        }
        playProgress = 0;
        sliderPercent = 0;
        lastTimestamp = 0;
        isPlaying = true;
        logs = [
            `Starting KELVIN-based sunrise simulation over ${simulationMinutes} minute(s)...`
        ];
        requestAnimationFrame(tick);
    }

    function getInterpolatedColor(progress) {
        const maxIndex = STEP_COUNT - 1;
        const idx = Math.floor(progress);
        const frac = progress - idx;
        const current = rows[idx] || rows[rows.length - 1];
        const next = rows[Math.min(idx + 1, maxIndex)] || current;
        const r = Math.round(current.red + (next.red - current.red) * frac);
        const g = Math.round(current.green + (next.green - current.green) * frac);
        const b = Math.round(current.blue + (next.blue - current.blue) * frac);
        return { r, g, b };
    }

    const toColorInt = (r, g, b) =>
        '0x' + ((r << 16) | (g << 8) | b).toString(16).padStart(8, '0');

    const kelvinFromProgress = (p) => Math.round(1800 + (6500 - 1800) * p);
    const intensityFromRGB = (r, g, b) => Math.round(((r + g + b) / 3 / 255) * 100);

    function tick(timestamp) {
        if (!isPlaying) return;
        if (!lastTimestamp) lastTimestamp = timestamp;

        const elapsedMs = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        const totalMs = simulationMinutes * 60_000;
        if (totalMs <= 0) {
            isPlaying = false;
            return;
        }

        playProgress += (elapsedMs / totalMs) * (STEP_COUNT - 1);

        if (playProgress >= STEP_COUNT - 1) {
            playProgress = STEP_COUNT - 1;
            isPlaying = false;
        }

        const pct01 = Math.min(1, playProgress / (STEP_COUNT - 1));
        sliderPercent = pct01 * 100;

        logCurrentLine(pct01);

        if (isPlaying) requestAnimationFrame(tick);
    }

    function logCurrentLine(pct01) {
        const { r, g, b } = getInterpolatedColor(playProgress);
        const kelvin = kelvinFromProgress(pct01);
        const intensity = intensityFromRGB(r, g, b);
        const line =
            `Progress: ${(pct01 * 100).toFixed(1)}% | Kelvin: ${kelvin}K | Intensity: ${intensity}% | RGB: ${r},${g},${b} | ColorInt: ${toColorInt(r, g, b)}`;
        logs = [...logs, line].slice(-400);
    }

    // slider scrubbing
    function handleSliderInput(e) {
        const pct = Number(e.target.value);
        sliderPercent = pct;
        isPlaying = false;
        const pct01 = pct / 100;
        playProgress = pct01 * (STEP_COUNT - 1);
    }

    // ---------- NEW: send color to LED daemon (debounced) ----------
    let ledSendTimeout;
    async function sendColorToLed(r, g, b) {
        // debounce: collect rapid changes in 80ms
        if (ledSendTimeout) {
            clearTimeout(ledSendTimeout);
        }
        ledSendTimeout = setTimeout(async () => {
            try {
                await fetch(LED_API_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ r, g, b })
                });
            } catch (err) {
                // optional: log error
                logs = [...logs, `LED update failed: ${err}`].slice(-400);
            }
        }, 80);
    }

    // whenever playProgress changes, update background AND LED
    $: currentBG = (() => {
        const { r, g, b } = getInterpolatedColor(playProgress);
        // send to LED daemon too
        sendColorToLed(r, g, b);
        return `rgb(${r}, ${g}, ${b})`;
    })();

    $: currentSimIndex = Math.floor(playProgress);
</script>

<div class="min-h-screen flex flex-col gap-6 p-6"
     style={`background: radial-gradient(circle, ${currentBG} 0%, #020617 65%); color: #fff;`}>
    <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 class="text-3xl font-bold text-white">Sunrise simulation</h1>
            <p class="text-sm text-white/80 mt-1">
                Define RGB over time to simulate an LED sunrise.
            </p>
        </div>
        <div class="flex gap-3 items-center">
            <label class="flex items-center gap-2 text-sm text-white">
                <span>Total time (min):</span>
                <input
                        type="number"
                        min="1"
                        bind:value={simulationMinutes}
                        class="w-20 rounded bg-slate-900/70 border border-slate-700 px-2 py-1 text-white"
                />
            </label>
            <button
                    on:click={togglePlay}
                    class="inline-flex items-center gap-2 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold shadow"
            >
                {#if isPlaying}
                    ⏸ Pause
                {:else}
                    ▶ Play
                {/if}
            </button>
        </div>
    </header>

    <!-- time scrubber -->
    <div class="flex flex-col gap-1">
        <label class="text-xs text-white/80">Scrub time</label>
        <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                bind:value={sliderPercent}
                on:input={handleSliderInput}
                class="w-full accent-emerald-400"
        />
        <div class="text-xs text-white/50">Current: {sliderPercent.toFixed(1)}%</div>
    </div>

    <!-- charts side-by-side -->
    <section class="flex gap-4 overflow-x-auto">
        <div class="flex-1 min-w-[300px]">
            <ColorChannelChart title="Red channel" color="red" channel="red" {rows} on:channelChange={handleChannelChange} />
        </div>
        <div class="flex-1 min-w-[300px]">
            <ColorChannelChart title="Green channel" color="green" channel="green" {rows} on:channelChange={handleChannelChange} />
        </div>
        <div class="flex-1 min-w-[300px]">
            <ColorChannelChart title="Blue channel" color="blue" channel="blue" {rows} on:channelChange={handleChannelChange} />
        </div>
    </section>

    <!-- table -->
    <section class="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden backdrop-blur">
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm text-white">
                <thead class="bg-slate-900/60">
                <tr>
                    <th class="px-3 py-2 text-left">#</th>
                    <th class="px-3 py-2 text-left">Time (%)</th>
                    <th class="px-3 py-2 text-left text-red-300">Red</th>
                    <th class="px-3 py-2 text-left text-green-300">Green</th>
                    <th class="px-3 py-2 text-left text-blue-300">Blue</th>
                    <th class="px-3 py-2 text-left">Kelvin</th>
                    <th class="px-3 py-2 text-left">Intensity (%)</th>
                </tr>
                </thead>
                <tbody>
                {#each rows as row, i}
                    <tr class={i === currentSimIndex ? 'bg-slate-800/40' : ''}>
                        <td class="px-3 py-1">{i + 1}</td>
                        <td class="px-3 py-1">
                            <input type="number" class="w-20 bg-slate-950/40 border border-slate-700 rounded px-1 text-white"
                                   value={row.time} on:change={(e) => handleTimeChange(i, e.target.value)} min="0" max="100" />
                        </td>
                        <td class="px-3 py-1">
                            <input type="number" class="w-20 bg-slate-950/40 border border-slate-700 rounded px-1 text-red-200"
                                   value={row.red} min="0" max="255" on:input={(e) => handleTableChange(i, 'red', e.target.value)} />
                        </td>
                        <td class="px-3 py-1">
                            <input type="number" class="w-20 bg-slate-950/40 border border-slate-700 rounded px-1 text-green-200"
                                   value={row.green} min="0" max="255" on:input={(e) => handleTableChange(i, 'green', e.target.value)} />
                        </td>
                        <td class="px-3 py-1">
                            <input type="number" class="w-20 bg-slate-950/40 border border-slate-700 rounded px-1 text-blue-200"
                                   value={row.blue} min="0" max="255" on:input={(e) => handleTableChange(i, 'blue', e.target.value)} />
                        </td>
                        <td class="px-3 py-1">{row.kelvin}</td>
                        <td class="px-3 py-1">{row.intensity}</td>
                    </tr>
                {/each}
                </tbody>
            </table>
        </div>
    </section>

    <!-- console -->
    <section class="flex flex-col gap-2">
        <label class="text-sm text-white/80">Simulation output</label>
        <textarea
                class="bg-slate-950/80 border border-slate-800 rounded-md p-2 font-mono text-xs text-white h-48"
                readonly
        >{logs.join('\n')}</textarea>
    </section>
</div>
