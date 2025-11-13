<script>
    import { createEventDispatcher } from 'svelte';

    const WIDTH = 320;
    const HEIGHT = 140;
    const PADDING = 16;

    export let title = '';
    export let color = 'red';
    export let channel = 'red';
    export let rows = [];

    const dispatch = createEventDispatcher();
    let draggingIndex = null;

    function valueForRow(row) {
        return row[channel];
    }

    function colorToStroke() {
        switch (color) {
            case 'red': return '#f43f5e';
            case 'green': return '#22c55e';
            case 'blue': return '#3b82f6';
        }
    }

    function onPointerDown(event, index) {
        draggingIndex = index;
        event.target.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
        if (draggingIndex === null) return;
        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();
        const y = event.clientY - rect.top;
        const usableHeight = HEIGHT - PADDING * 2;
        let rel = (y - PADDING) / usableHeight;
        rel = Math.min(1, Math.max(0, rel));
        const value = Math.round((1 - rel) * 255);
        dispatch('channelChange', { index: draggingIndex, value, channel });
    }

    function onPointerUp(event) {
        draggingIndex = null;
        event.target.releasePointerCapture(event.pointerId);
    }

    $: points = rows.map((row, i) => {
        const x = PADDING + (i / Math.max(1, rows.length - 1)) * (WIDTH - PADDING * 2);
        const value = valueForRow(row);
        const usableHeight = HEIGHT - PADDING * 2;
        const rel = value / 255;
        const y = PADDING + (1 - rel) * usableHeight;
        return { x, y, value };
    });

    $: polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');
</script>

<div class="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 text-white">
    <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">{title}</h2>
        <span class="text-xs text-slate-200/70">0–255</span>
    </div>
    <svg
            width={WIDTH}
            height={HEIGHT}
            class="w-full cursor-crosshair rounded bg-slate-950/40"
            on:pointermove|preventDefault={onPointerMove}
            on:pointerup={onPointerUp}
            on:pointerleave={onPointerUp}
    >
        <line x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} stroke="rgba(248,250,252,0.15)" stroke-width="1" />
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="rgba(248,250,252,0.15)" stroke-width="1" />

        <polyline
                points={polyPoints}
                fill="none"
                stroke={colorToStroke()}
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
        />

        {#each points as p, i}
            <circle
                    cx={p.x}
                    cy={p.y}
                    r="5"
                    fill={colorToStroke()}
                    class="cursor-pointer"
                    on:pointerdown={(e) => onPointerDown(e, i)}
            />
        {/each}
    </svg>
    <p class="text-xs text-slate-200/70">
        Drag the points to change {channel} values.
    </p>
</div>
