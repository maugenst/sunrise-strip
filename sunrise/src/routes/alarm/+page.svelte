<!-- src/routes/alarm/+page.svelte -->
<script>
    import { onMount } from 'svelte';

    let hour = 7;
    let minute = 0;
    let enabled = false;
    let loading = true;
    let saving = false;
    let message = '';
    let messageType = 'info'; // 'info', 'success', 'error'

    // Clock visual state
    let isDraggingHour = false;
    let isDraggingMinute = false;

    onMount(async () => {
        await loadAlarm();
    });

    async function loadAlarm() {
        loading = true;
        try {
            const res = await fetch('/api/alarm');
            if (res.ok) {
                const data = await res.json();
                if (data.ok) {
                    hour = data.hour ?? 7;
                    minute = data.minute ?? 0;
                    enabled = data.enabled ?? false;
                    message = enabled 
                        ? `Alarm loaded: ${formatTime(hour, minute)}`
                        : 'No alarm currently set';
                    messageType = 'info';
                }
            }
        } catch (e) {
            message = `Error loading alarm: ${e.message}`;
            messageType = 'error';
        } finally {
            loading = false;
        }
    }

    async function saveAlarm() {
        saving = true;
        message = '';
        try {
            const res = await fetch('/api/alarm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hour, minute, enabled: true })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                enabled = true;
                message = `Alarm saved: ${formatTime(hour, minute)}`;
                messageType = 'success';
            } else {
                message = `Failed to save: ${data.error || 'Unknown error'}`;
                messageType = 'error';
            }
        } catch (e) {
            message = `Error saving alarm: ${e.message}`;
            messageType = 'error';
        } finally {
            saving = false;
        }
    }

    async function deleteAlarm() {
        saving = true;
        message = '';
        try {
            const res = await fetch('/api/alarm', { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.ok) {
                enabled = false;
                message = 'Alarm deleted';
                messageType = 'success';
            } else {
                message = `Failed to delete: ${data.error || 'Unknown error'}`;
                messageType = 'error';
            }
        } catch (e) {
            message = `Error deleting alarm: ${e.message}`;
            messageType = 'error';
        } finally {
            saving = false;
        }
    }

    function formatTime(h, m) {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    // Clock calculations
    $: hourAngle = ((hour % 12) / 12) * 360 + (minute / 60) * 30 - 90;
    $: minuteAngle = (minute / 60) * 360 - 90;

    function handleClockClick(event) {
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = event.clientX - rect.left - centerX;
        const y = event.clientY - rect.top - centerY;
        
        // Calculate angle from center
        let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        
        // Determine if we're closer to hour ring or minute ring
        const distance = Math.sqrt(x * x + y * y);
        const maxRadius = Math.min(centerX, centerY);
        
        if (distance < maxRadius * 0.5) {
            // Inner area - adjust hours
            const newHour = Math.round((angle / 360) * 12) % 12;
            hour = hour >= 12 ? newHour + 12 : newHour;
            if (hour === 0 && hour < 12) hour = 0;
            if (hour === 12 && hour >= 12) hour = 12;
        } else {
            // Outer area - adjust minutes
            minute = Math.round((angle / 360) * 60) % 60;
        }
    }

    function handleHourDrag(event) {
        if (!isDraggingHour) return;
        updateHourFromEvent(event);
    }

    function handleMinuteDrag(event) {
        if (!isDraggingMinute) return;
        updateMinuteFromEvent(event);
    }

    function updateHourFromEvent(event) {
        const clock = document.getElementById('clock-face');
        if (!clock) return;
        
        const rect = clock.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        
        const x = clientX - rect.left - centerX;
        const y = clientY - rect.top - centerY;
        
        let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        
        const newHour = Math.round((angle / 360) * 12) % 12;
        hour = hour >= 12 ? newHour + 12 : newHour;
    }

    function updateMinuteFromEvent(event) {
        const clock = document.getElementById('clock-face');
        if (!clock) return;
        
        const rect = clock.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        
        const x = clientX - rect.left - centerX;
        const y = clientY - rect.top - centerY;
        
        let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        
        minute = Math.round((angle / 360) * 60) % 60;
    }

    function startHourDrag(event) {
        event.preventDefault();
        isDraggingHour = true;
    }

    function startMinuteDrag(event) {
        event.preventDefault();
        isDraggingMinute = true;
    }

    function stopDrag() {
        isDraggingHour = false;
        isDraggingMinute = false;
    }

    function toggleAmPm() {
        if (hour >= 12) {
            hour = hour - 12;
        } else {
            hour = hour + 12;
        }
    }

    // Generate hour markers
    const hourMarkers = Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * 360 - 90;
        const radian = angle * (Math.PI / 180);
        const radius = 42;
        const x = 50 + radius * Math.cos(radian);
        const y = 50 + radius * Math.sin(radian);
        return { num: i === 0 ? 12 : i, x, y };
    });

    // Generate minute markers
    const minuteMarkers = Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * 360 - 90;
        const radian = angle * (Math.PI / 180);
        const radius = 46;
        return {
            x1: 50 + (radius - 2) * Math.cos(radian),
            y1: 50 + (radius - 2) * Math.sin(radian),
            x2: 50 + radius * Math.cos(radian),
            y2: 50 + radius * Math.sin(radian)
        };
    });
</script>

<svelte:window 
    on:mouseup={stopDrag} 
    on:mousemove={(e) => { handleHourDrag(e); handleMinuteDrag(e); }}
    on:touchend={stopDrag}
    on:touchmove={(e) => { handleHourDrag(e); handleMinuteDrag(e); }}
/>

<div class="min-h-screen flex flex-col gap-6 p-6 bg-gradient-to-b from-slate-900 to-slate-950">
    <!-- Navigation -->
    <nav class="flex gap-4 mb-4">
        <a href="/" class="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium transition">
            ← Sunrise Simulation
        </a>
    </nav>

    <header class="text-center">
        <h1 class="text-3xl font-bold text-white">⏰ Wake-up Alarm</h1>
        <p class="text-sm text-white/70 mt-2">Set your sunrise wake-up time</p>
    </header>

    {#if loading}
        <div class="flex justify-center">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-400"></div>
        </div>
    {:else}
        <!-- Clock Display -->
        <div class="flex flex-col items-center gap-6">
            <!-- Digital Time Display -->
            <div class="text-6xl font-mono font-bold text-amber-400 tracking-wider">
                {formatTime(hour, minute)}
            </div>

            <!-- AM/PM Toggle -->
            <button 
                on:click={toggleAmPm}
                class="px-6 py-2 rounded-full font-bold text-lg transition {hour >= 12 ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-slate-900'}"
            >
                {hour >= 12 ? 'PM' : 'AM'}
            </button>

            <!-- Analog Clock -->
            <div 
                id="clock-face"
                class="relative w-72 h-72 md:w-96 md:h-96 cursor-pointer select-none"
                on:click={handleClockClick}
                role="slider"
                aria-label="Clock face for setting alarm time"
                tabindex="0"
            >
                <svg viewBox="0 0 100 100" class="w-full h-full drop-shadow-2xl">
                    <!-- Clock face background -->
                    <circle cx="50" cy="50" r="48" fill="#1e293b" stroke="#334155" stroke-width="2"/>
                    
                    <!-- Outer minute ring -->
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#475569" stroke-width="0.5"/>
                    
                    <!-- Inner hour ring -->
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#475569" stroke-width="0.5" stroke-dasharray="2,2"/>

                    <!-- Minute tick marks -->
                    {#each minuteMarkers as marker}
                        <line 
                            x1={marker.x1} y1={marker.y1} 
                            x2={marker.x2} y2={marker.y2} 
                            stroke="#64748b" 
                            stroke-width="1"
                        />
                    {/each}

                    <!-- Hour numbers -->
                    {#each hourMarkers as marker}
                        <text 
                            x={marker.x} 
                            y={marker.y} 
                            text-anchor="middle" 
                            dominant-baseline="central"
                            class="fill-slate-300 text-[6px] font-semibold"
                        >
                            {marker.num}
                        </text>
                    {/each}

                    <!-- Hour hand -->
                    <g transform="rotate({hourAngle}, 50, 50)">
                        <line 
                            x1="50" y1="50" 
                            x2="75" y2="50" 
                            stroke="#f59e0b" 
                            stroke-width="3" 
                            stroke-linecap="round"
                        />
                        <!-- Hour hand drag handle -->
                        <circle 
                            cx="75" cy="50" r="5" 
                            fill="#f59e0b" 
                            class="cursor-grab active:cursor-grabbing"
                            on:mousedown={startHourDrag}
                            on:touchstart={startHourDrag}
                        />
                    </g>

                    <!-- Minute hand -->
                    <g transform="rotate({minuteAngle}, 50, 50)">
                        <line 
                            x1="50" y1="50" 
                            x2="85" y2="50" 
                            stroke="#38bdf8" 
                            stroke-width="2" 
                            stroke-linecap="round"
                        />
                        <!-- Minute hand drag handle -->
                        <circle 
                            cx="85" cy="50" r="4" 
                            fill="#38bdf8" 
                            class="cursor-grab active:cursor-grabbing"
                            on:mousedown={startMinuteDrag}
                            on:touchstart={startMinuteDrag}
                        />
                    </g>

                    <!-- Center dot -->
                    <circle cx="50" cy="50" r="3" fill="#94a3b8"/>
                </svg>

                <!-- Legend -->
                <div class="absolute -bottom-8 left-0 right-0 flex justify-center gap-6 text-xs">
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-1 bg-amber-500 rounded"></span>
                        <span class="text-slate-400">Hour</span>
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-1 bg-sky-400 rounded"></span>
                        <span class="text-slate-400">Minute</span>
                    </span>
                </div>
            </div>

            <!-- Manual Input -->
            <div class="flex items-center gap-4 mt-8">
                <div class="flex flex-col items-center">
                    <label class="text-xs text-slate-400 mb-1">Hour</label>
                    <input 
                        type="number" 
                        min="0" 
                        max="23" 
                        bind:value={hour}
                        class="w-20 text-center text-2xl font-mono bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                    />
                </div>
                <span class="text-3xl text-slate-500 mt-5">:</span>
                <div class="flex flex-col items-center">
                    <label class="text-xs text-slate-400 mb-1">Minute</label>
                    <input 
                        type="number" 
                        min="0" 
                        max="59" 
                        bind:value={minute}
                        class="w-20 text-center text-2xl font-mono bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                    />
                </div>
            </div>

            <!-- Quick presets -->
            <div class="flex flex-wrap justify-center gap-2 mt-4">
                {#each [
                    { h: 6, m: 0, label: '6:00' },
                    { h: 6, m: 30, label: '6:30' },
                    { h: 7, m: 0, label: '7:00' },
                    { h: 7, m: 30, label: '7:30' },
                    { h: 8, m: 0, label: '8:00' }
                ] as preset}
                    <button 
                        on:click={() => { hour = preset.h; minute = preset.m; }}
                        class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition"
                    >
                        {preset.label}
                    </button>
                {/each}
            </div>

            <!-- Status indicator -->
            {#if enabled}
                <div class="flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-emerald-900/50 border border-emerald-700">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span class="text-emerald-300 text-sm">Alarm active</span>
                </div>
            {:else}
                <div class="flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-slate-800 border border-slate-600">
                    <span class="w-2 h-2 rounded-full bg-slate-500"></span>
                    <span class="text-slate-400 text-sm">No alarm set</span>
                </div>
            {/if}

            <!-- Action Buttons -->
            <div class="flex gap-4 mt-6">
                <button 
                    on:click={saveAlarm}
                    disabled={saving}
                    class="px-8 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold text-lg shadow-lg transition transform hover:scale-105"
                >
                    {saving ? '⏳ Saving...' : '💾 Save Alarm'}
                </button>
                
                {#if enabled}
                    <button 
                        on:click={deleteAlarm}
                        disabled={saving}
                        class="px-6 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 disabled:cursor-not-allowed text-white font-bold text-lg shadow-lg transition transform hover:scale-105"
                    >
                        {saving ? '⏳...' : '🗑️ Delete'}
                    </button>
                {/if}
            </div>

            <!-- Message display -->
            {#if message}
                <div class="mt-4 px-6 py-3 rounded-lg text-center max-w-md {
                    messageType === 'success' ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300' :
                    messageType === 'error' ? 'bg-rose-900/50 border border-rose-700 text-rose-300' :
                    'bg-slate-800 border border-slate-600 text-slate-300'
                }">
                    {message}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Info section -->
    <section class="mt-8 max-w-lg mx-auto text-center">
        <h2 class="text-lg font-semibold text-white mb-2">How it works</h2>
        <p class="text-sm text-slate-400">
            The alarm is saved to the system crontab. When the alarm triggers, 
            it will start the sunrise LED simulation to gently wake you up.
        </p>
        <p class="text-xs text-slate-500 mt-2">
            Drag the clock hands or use the number inputs to set your desired wake-up time.
        </p>
    </section>
</div>

<style>
    /* Ensure touch events work on mobile */
    #clock-face {
        touch-action: none;
    }
</style>