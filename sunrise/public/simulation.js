// simulation.js — full simulation page logic, no framework

const STEP_COUNT = 20;

// ── State ─────────────────────────────────────────────────────────────────────

let realMode = false; // module-scoped so updateStopBtn can read it

const state = {
  rows: initRows(),
  simulationMinutes: 15,
  isPlaying: false,
  playProgress: 0,
  lastTimestamp: 0,
  logs: [],
  sunriseRunning: false,
  audioStarted: false,
  _lastLoggedPct: -1,
  rafId: null
};

function initRows() {
  return Array.from({ length: STEP_COUNT }, (_, i) => {
    const time = Math.round((i / (STEP_COUNT - 1)) * 100);
    return recomputeDerived({ time, red: 0, green: 0, blue: 0 });
  });
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function recomputeDerived(row) {
  const { red, green, blue } = row;
  const avg = (red + green + blue) / 3;
  const intensity = Math.round((avg / 255) * 100);
  const kelvin = 2000 + Math.round((intensity / 100) * 3000);
  return { ...row, kelvin, intensity };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateRGB(progress) {
  const idx = Math.floor(progress);
  const frac = progress - idx;
  const maxIdx = STEP_COUNT - 1;
  const cur = state.rows[Math.min(idx, maxIdx)];
  const nxt = state.rows[Math.min(idx + 1, maxIdx)];
  return {
    r: Math.round(lerp(cur.red,   nxt.red,   frac)),
    g: Math.round(lerp(cur.green, nxt.green, frac)),
    b: Math.round(lerp(cur.blue,  nxt.blue,  frac))
  };
}

function toHex(r, g, b) {
  return '0x' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase();
}

// ── Chart rendering ───────────────────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 160;
const PAD     = 18;
const SVG_NS  = 'http://www.w3.org/2000/svg';

const CHANNELS = [
  { key: 'red',   label: 'Red',   color: '#f43f5e', svgId: 'chartRed'   },
  { key: 'green', label: 'Green', color: '#22c55e', svgId: 'chartGreen' },
  { key: 'blue',  label: 'Blue',  color: '#3b82f6', svgId: 'chartBlue'  }
];

function rowToPoint(row, i) {
  const x = PAD + (i / (STEP_COUNT - 1)) * (CHART_W - PAD * 2);
  const y = PAD + (1 - row[null] / 255) * (CHART_H - PAD * 2);
  return { x, y };
}

function renderChart(ch) {
  const svg = document.getElementById(ch.svgId);
  if (!svg) return;

  // compute point positions
  const pts = state.rows.map((row, i) => {
    const x = PAD + (i / (STEP_COUNT - 1)) * (CHART_W - PAD * 2);
    const val = row[ch.key];
    const y = PAD + (1 - val / 255) * (CHART_H - PAD * 2);
    return { x, y, val };
  });

  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // clear
  svg.innerHTML = '';

  // axis lines
  const mkLine = (x1, y1, x2, y2) => {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', 'rgba(248,250,252,.1)');
    l.setAttribute('stroke-width', '1');
    svg.appendChild(l);
  };
  mkLine(PAD, PAD, PAD, CHART_H - PAD);
  mkLine(PAD, CHART_H - PAD, CHART_W - PAD, CHART_H - PAD);

  // play cursor line
  if (state.isPlaying || state.playProgress > 0) {
    const cx = PAD + (state.playProgress / (STEP_COUNT - 1)) * (CHART_W - PAD * 2);
    const cur = document.createElementNS(SVG_NS, 'line');
    cur.setAttribute('x1', cx.toFixed(1)); cur.setAttribute('y1', PAD);
    cur.setAttribute('x2', cx.toFixed(1)); cur.setAttribute('y2', CHART_H - PAD);
    cur.setAttribute('stroke', 'rgba(249,115,22,.5)');
    cur.setAttribute('stroke-width', '1.5');
    cur.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(cur);
  }

  // fill area under curve
  const fillPts = [`${PAD.toFixed(1)},${(CHART_H - PAD).toFixed(1)}`,
    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${(CHART_W - PAD).toFixed(1)},${(CHART_H - PAD).toFixed(1)}`].join(' ');
  const area = document.createElementNS(SVG_NS, 'polygon');
  area.setAttribute('points', fillPts);
  area.setAttribute('fill', ch.color);
  area.setAttribute('fill-opacity', '0.08');
  svg.appendChild(area);

  // polyline
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('points', polyPts);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', ch.color);
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-linecap', 'round');
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);

  // control points
  pts.forEach((p, i) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', p.x.toFixed(1));
    c.setAttribute('cy', p.y.toFixed(1));
    c.setAttribute('r', '5');
    c.setAttribute('fill', ch.color);
    c.setAttribute('stroke', 'rgba(10,15,30,.6)');
    c.setAttribute('stroke-width', '1.5');
    c.style.cursor = 'pointer';
    c.dataset.index = i;
    c.dataset.channel = ch.key;
    svg.appendChild(c);
  });
}

function renderAllCharts() {
  CHANNELS.forEach(renderChart);
}

// ── Chart drag ────────────────────────────────────────────────────────────────

function setupChartDrag(ch) {
  const svg = document.getElementById(ch.svgId);
  if (!svg) return;

  let dragging = null;

  svg.addEventListener('pointerdown', e => {
    const circle = e.target.closest('circle');
    if (!circle) return;
    dragging = { index: parseInt(circle.dataset.index), channel: circle.dataset.channel };
    e.target.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  svg.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const scaleY = CHART_H / rect.height;
    const y = (e.clientY - rect.top) * scaleY;
    const usable = CHART_H - PAD * 2;
    const rel = Math.min(1, Math.max(0, (y - PAD) / usable));
    const val = Math.round((1 - rel) * 255);
    state.rows[dragging.index] = recomputeDerived({
      ...state.rows[dragging.index],
      [dragging.channel]: val
    });
    update();
  });

  svg.addEventListener('pointerup', e => { dragging = null; });
  svg.addEventListener('pointerleave', e => { dragging = null; });
}

// ── Web Audio engine ──────────────────────────────────────────────────────────

let _audioCtx    = null;
let _audioBuffer = null;
let _audioSource = null;
let _gainNode    = null;
let _audioLoaded = false;

async function loadAudio() {
  if (_audioLoaded) return;
  _setAudioBadge('⏳ Loading audio…', 'var(--text-muted)');
  try {
    const res = await fetch('/birds.mp3');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _audioCtx    = new AudioContext();
    _audioBuffer = await _audioCtx.decodeAudioData(await res.arrayBuffer());
    _audioLoaded = true;
    appendLog('🎵 Audio loaded (' + (_audioBuffer.duration / 60).toFixed(1) + ' min)');
    _setAudioBadge('🎵 Audio ready', 'var(--success)');
  } catch (e) {
    appendLog('⚠ Audio load failed: ' + e.message);
    _setAudioBadge('⚠ Audio failed', 'var(--danger)');
  }
}

function _setAudioBadge(text, color) {
  let badge = document.getElementById('audioBadge');
  if (!badge) return;
  badge.textContent = text;
  badge.style.color = color;
}

function audioFadeIn(durationS = 20) {
  if (!_audioLoaded || !_audioCtx) {
    appendLog('⚠ Audio not loaded yet — skipping fade-in');
    _setAudioBadge('⚠ Audio not ready', 'var(--amber)');
    return;
  }
  if (_audioSource) { try { _audioSource.stop(); } catch {} _audioSource = null; }
  if (_gainNode)    { try { _gainNode.disconnect(); } catch {} _gainNode = null; }

  _audioCtx.resume().then(() => {
    _gainNode = _audioCtx.createGain();
    _gainNode.gain.setValueAtTime(0, _audioCtx.currentTime);
    _gainNode.gain.linearRampToValueAtTime(1.0, _audioCtx.currentTime + Math.max(10, durationS));
    _gainNode.connect(_audioCtx.destination);

    _audioSource = _audioCtx.createBufferSource();
    _audioSource.buffer = _audioBuffer;
    _audioSource.loop = true;
    _audioSource.connect(_gainNode);
    _audioSource.start();
    appendLog(`🎵 Audio fade-in (${Math.max(10, durationS)}s)`);
    _setAudioBadge('🎵 Audio fading in…', 'var(--success)');
  }).catch(e => {
    appendLog('⚠ AudioContext resume failed: ' + e.message);
    _setAudioBadge('⚠ Audio error', 'var(--danger)');
  });
}

function audioFadeOut(durationS = 10) {
  if (!_gainNode || !_audioSource) return;
  const now = _audioCtx.currentTime;
  _gainNode.gain.cancelScheduledValues(now);
  _gainNode.gain.setValueAtTime(_gainNode.gain.value, now);
  _gainNode.gain.linearRampToValueAtTime(0, now + durationS);
  const src = _audioSource; const gain = _gainNode;
  _audioSource = null; _gainNode = null;
  setTimeout(() => { try { src.stop(); } catch {} try { gain.disconnect(); } catch {} }, (durationS + 0.5) * 1000);
  appendLog(`🔇 Audio fade-out (${durationS}s)`);
  _setAudioBadge('🔇 Audio fading out…', 'var(--text-muted)');
}

// ── Animation loop ────────────────────────────────────────────────────────────

function tick(timestamp) {
  if (!state.isPlaying) return;
  if (!state.lastTimestamp) state.lastTimestamp = timestamp;

  const elapsed = timestamp - state.lastTimestamp;
  state.lastTimestamp = timestamp;

  const totalMs = state.simulationMinutes * 60_000;
  if (totalMs <= 0) { state.isPlaying = false; update(); return; }

  state.playProgress += (elapsed / totalMs) * (STEP_COUNT - 1);

  if (state.playProgress >= STEP_COUNT - 1) {
    state.playProgress = STEP_COUNT - 1;
    state.isPlaying = false;
  }

  const pct01 = state.playProgress / (STEP_COUNT - 1);
  const { r, g, b } = interpolateRGB(state.playProgress);
  const kelvin = Math.round(1800 + (6500 - 1800) * pct01);
  const intensity = Math.round(((r + g + b) / 3 / 255) * 100);

  // Log only once per 1% step — rAF fires ~60x/s which floods the 400-line buffer
  if (Math.floor(pct01 * 100) !== state._lastLoggedPct) {
    state._lastLoggedPct = Math.floor(pct01 * 100);
    appendLog(`${(pct01 * 100).toFixed(1)}% | ${kelvin}K | ${intensity}% | RGB(${r},${g},${b}) | ${toHex(r, g, b)}`);
  }

  // Trigger audio fade-in at 80%
  if (pct01 >= 0.8 && !state.audioStarted) {
    state.audioStarted = true;
    const remainingMs = (1 - pct01) * state.simulationMinutes * 60_000;
    audioFadeIn(Math.round(remainingMs / 1000));
  }

  // Trigger audio fade-out when animation ends
  if (!state.isPlaying && state.audioStarted) {
    state.audioStarted = false;
    audioFadeOut(10);
  }

  appendLog(`${(pct01 * 100).toFixed(1)}% | ${kelvin}K | ${intensity}% | RGB(${r},${g},${b}) | ${toHex(r, g, b)}`);

  update();

  if (state.isPlaying) state.rafId = requestAnimationFrame(tick);
}

function togglePlay() {
  if (state.isPlaying) {
    state.isPlaying = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    update();
    return;
  }
  state.playProgress = 0;
  state.lastTimestamp = 0;
  state.isPlaying = true;
  state.audioStarted = false;
  state._lastLoggedPct = -1;
  state.logs = [`▶ Starting simulation — ${state.simulationMinutes} min`];
  update();
  state.rafId = requestAnimationFrame(tick);
}

// ── LED API ───────────────────────────────────────────────────────────────────

// Throttle LED updates: send at most once every 200ms, always with the latest color.
// A debounce was used before but rAF fires every 16ms, constantly resetting the
// 60ms timer so the fetch never actually fired during animation playback.
let _ledThrottleTimer = null;
let _ledPendingColor  = null;

function sendColorDebounced(r, g, b) {
  // Don't override the daemon while a real sunrise is running on the hardware
  if (state.sunriseRunning) return;

  _ledPendingColor = { r, g, b };

  if (_ledThrottleTimer) return; // already scheduled — latest color will be sent

  _ledThrottleTimer = setTimeout(async () => {
    _ledThrottleTimer = null;
    const { r, g, b } = _ledPendingColor;
    _ledPendingColor = null;
    try {
      await fetch('/api/led', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ r, g, b })
      });
    } catch {}
  }, 200);
}

async function turnOffLed() {
  try {
    await fetch('/api/led', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: 'off' })
    });
    appendLog('[led] off');
    showToast('LEDs off', '');
  } catch (e) {
    appendLog('[led] off failed: ' + e.message);
  }
}

// ── Preset API ────────────────────────────────────────────────────────────────

async function loadPreset() {
  try {
    const res = await fetch('/api/preset');
    const data = await res.json().catch(() => ({}));
    if (data.ok && Array.isArray(data.rows) && data.rows.length > 0) {
      const loaded = data.rows.slice(0, STEP_COUNT);
      state.rows = loaded.map((r, i) => recomputeDerived({
        time:  typeof r.time  === 'number' ? r.time  : Math.round((i / (STEP_COUNT - 1)) * 100),
        red:   Number(r.red)   || 0,
        green: Number(r.green) || 0,
        blue:  Number(r.blue)  || 0
      }));
      if (typeof data.simulationMinutes === 'number') {
        state.simulationMinutes = data.simulationMinutes;
        const el = document.getElementById('simMinutes');
        if (el) el.value = state.simulationMinutes;
      }
      appendLog('[preset] loaded');
    } else {
      appendLog('[preset] no preset file, using defaults');
    }
  } catch (e) {
    appendLog('[preset] load error: ' + e.message);
  }
}

async function savePreset() {
  const compactRows = state.rows.map(r => ({
    time: r.time, red: r.red, green: r.green, blue: r.blue
  }));
  try {
    const res = await fetch('/api/preset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ simulationMinutes: state.simulationMinutes, rows: compactRows })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      appendLog('[preset] saved');
      showToast('Preset saved', 'success');
    } else {
      appendLog('[preset] save failed: ' + (data.error ?? 'unknown'));
      showToast('Save failed', 'error');
    }
  } catch (e) {
    appendLog('[preset] save error: ' + e.message);
    showToast('Save error', 'error');
  }
}

// ── Stop / sunrise status ─────────────────────────────────────────────────────

async function refreshSunriseStatus() {
  try {
    const res = await fetch('/api/stop');
    const data = await res.json().catch(() => ({}));
    state.sunriseRunning = !!data.running;
    updateStopBtn();
  } catch {}
}

async function stopSunrise() {
  try {
    await fetch('/api/stop', { method: 'POST' });
    appendLog('[sunrise] stop sent');
    showToast('Stop signal sent', '');
    await refreshSunriseStatus();
  } catch (e) {
    appendLog('[sunrise] stop failed: ' + e.message);
  }
}

function updateStopBtn() {
  const btn = document.getElementById('stopSunriseBtn');
  if (!btn) return;
  btn.disabled = !state.sunriseRunning;
  btn.textContent = state.sunriseRunning ? '⏹ Stop sunrise' : '— No sunrise running';
  btn.className = 'btn btn-sm ' + (state.sunriseRunning ? 'btn-amber' : 'btn-ghost');
  btn.style.opacity = state.sunriseRunning ? '1' : '.45';

  // In real mode, repurpose the play button as start/stop
  if (realMode) {
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.textContent = state.sunriseRunning ? '⏹ Stop sunrise' : '🌅 Start sunrise';
      playBtn.className = 'btn btn-sm ' + (state.sunriseRunning ? 'btn-danger' : 'btn-primary');
    }
  }

  // Show/hide live indicator banner
  let banner = document.getElementById('sunriseLiveBanner');
  if (state.sunriseRunning) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sunriseLiveBanner';
      banner.style.cssText = `
        position:fixed; bottom:1rem; left:50%; transform:translateX(-50%);
        background:rgba(249,115,22,0.15); border:1px solid var(--primary);
        border-radius:8px; padding:.5rem 1.25rem; color:var(--primary);
        font-size:.85rem; font-weight:600; pointer-events:none; z-index:99;
        backdrop-filter:blur(8px);
      `;
      document.body.appendChild(banner);
    }
    banner.textContent = '🌅 Real sunrise running on hardware — LED scrubbing paused';
  } else if (banner) {
    banner.remove();
  }
}

// ── UI update (single reconcile function) ────────────────────────────────────

function update() {
  const { r, g, b } = interpolateRGB(state.playProgress);

  // dynamic background
  document.body.style.background =
    `radial-gradient(ellipse at center, rgb(${r},${g},${b}) 0%, #020617 60%)`;

  // send to LEDs
  sendColorDebounced(r, g, b);

  // play button
  const playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play';

  // scrubber
  const slider = document.getElementById('scrubber');
  if (slider) {
    const pct = (state.playProgress / (STEP_COUNT - 1)) * 100;
    slider.value = pct;
    const scrubLabel = document.getElementById('scrubLabel');
    if (scrubLabel) scrubLabel.textContent = pct.toFixed(1) + '%';
  }

  // charts
  renderAllCharts();

  // table rows
  updateTable();

  // console
  const logEl = document.getElementById('logOutput');
  if (logEl) {
    logEl.value = state.logs.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function updateTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  const curIdx = Math.floor(state.playProgress);
  state.rows.forEach((row, i) => {
    const tr = tbody.children[i];
    if (!tr) return;
    tr.className = i === curIdx ? 'active' : '';
    // sync all input values to state (handles preset load + drag updates)
    const inputs = tr.querySelectorAll('input[data-k]');
    inputs.forEach(inp => {
      const k = inp.dataset.k;
      if (document.activeElement !== inp) inp.value = row[k];
    });
    tr.querySelector('.col-kelvin').textContent = row.kelvin;
    tr.querySelector('.col-intensity').textContent = row.intensity + '%';
    const swatch = tr.querySelector('.col-swatch');
    if (swatch) swatch.style.background = `rgb(${row.red},${row.green},${row.blue})`;
  });
}

// ── Table setup ───────────────────────────────────────────────────────────────

function buildTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-sm">${i + 1}</td>
      <td><input type="number" class="input" min="0" max="100" value="${row.time}" data-i="${i}" data-k="time"></td>
      <td><input type="number" class="input" style="color:#f43f5e" min="0" max="255" value="${row.red}"   data-i="${i}" data-k="red"></td>
      <td><input type="number" class="input" style="color:#22c55e" min="0" max="255" value="${row.green}" data-i="${i}" data-k="green"></td>
      <td><input type="number" class="input" style="color:#3b82f6" min="0" max="255" value="${row.blue}"  data-i="${i}" data-k="blue"></td>
      <td class="col-kelvin text-muted">${row.kelvin}</td>
      <td class="col-intensity text-muted">${row.intensity}%</td>
      <td><div class="col-swatch" style="width:20px;height:20px;border-radius:4px;background:rgb(${row.red},${row.green},${row.blue});border:1px solid var(--border)"></div></td>
    `;
    tbody.appendChild(tr);
  });

  // single delegated listener
  tbody.addEventListener('input', e => {
    const input = e.target.closest('input[data-k]');
    if (!input) return;
    const i = parseInt(input.dataset.i);
    const k = input.dataset.k;
    let v = parseInt(input.value) || 0;
    const max = k === 'time' ? 100 : 255;
    v = Math.min(max, Math.max(0, v));
    if (k === 'time') {
      state.rows[i] = { ...state.rows[i], time: v };
    } else {
      state.rows[i] = recomputeDerived({ ...state.rows[i], [k]: v });
    }
    update();
  });
}

// ── Logs ──────────────────────────────────────────────────────────────────────

function appendLog(msg) {
  state.logs.push(msg);
  if (state.logs.length > 400) state.logs = state.logs.slice(-400);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  buildTable();
  setupChartDrag(CHANNELS[0]);
  setupChartDrag(CHANNELS[1]);
  setupChartDrag(CHANNELS[2]);

  // ── Mode toggle ──────────────────────────────────────────────────────────────

  function setMode(real) {
    realMode = real;
    document.getElementById('modeSimBtn').classList.toggle('active', !real);
    document.getElementById('modeRealBtn').classList.toggle('active',  real);
    document.getElementById('simMinutes').disabled = real; // duration from preset in real mode
    document.getElementById('scrubber').disabled   = real;
    document.getElementById('muteBtn').disabled    = real; // audio via Pi speaker in real mode
    document.getElementById('audioBadge').textContent = real
      ? '🔈 Pi speaker'
      : (_audioLoaded ? '🎵 Audio ready' : '⏳ Loading audio…');
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = real ? '🌅 Start sunrise' : '▶ Play';
    playBtn.className = 'btn btn-sm ' + (real ? 'btn-primary' : 'btn-success');
    appendLog(real ? '🌅 Real mode — hardware LEDs + Pi speaker' : '🖥 Sim mode — browser animation');
  }

  document.getElementById('modeSimBtn')?.addEventListener('click',  () => setMode(false));
  document.getElementById('modeRealBtn')?.addEventListener('click', () => setMode(true));

  // sim minutes input
  const simMins = document.getElementById('simMinutes');
  if (simMins) {
    simMins.value = state.simulationMinutes;
    simMins.addEventListener('change', () => {
      const v = parseFloat(simMins.value);
      if (v > 0) state.simulationMinutes = v;
    });
  }

  // play button — branches on mode
  document.getElementById('playBtn')?.addEventListener('click', async () => {
    if (realMode) {
      if (state.sunriseRunning) {
        await stopSunrise();
      } else {
        try {
          const res = await fetch('/api/sunrise', { method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}) });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            appendLog('🌅 Real sunrise started on device');
            showToast('Sunrise started on device', 'success');
          } else {
            appendLog('⚠ Start failed: ' + (data.error ?? 'unknown'));
            showToast('Failed to start sunrise', 'error');
          }
        } catch (e) {
          appendLog('⚠ ' + e.message);
          showToast('Network error', 'error');
        }
        await refreshSunriseStatus();
      }
    } else {
      togglePlay();
    }
  });

  // LED off button
  document.getElementById('ledOffBtn')?.addEventListener('click', turnOffLed);

  // save preset
  document.getElementById('savePresetBtn')?.addEventListener('click', savePreset);

  // stop sunrise
  document.getElementById('stopSunriseBtn')?.addEventListener('click', stopSunrise);

  // mute/unmute
  let _muted = false;
  document.getElementById('muteBtn')?.addEventListener('click', () => {
    _muted = !_muted;
    if (_gainNode) _gainNode.gain.setValueAtTime(_muted ? 0 : 1, _audioCtx.currentTime);
    const btn = document.getElementById('muteBtn');
    btn.textContent = _muted ? '🔇' : '🔊';
    btn.style.opacity = _muted ? '0.5' : '1';
    appendLog(_muted ? '🔇 Muted' : '🔊 Unmuted');
  });

  // scrubber
  const scrubber = document.getElementById('scrubber');
  if (scrubber) {
    scrubber.addEventListener('input', () => {
      state.isPlaying = false;
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.playProgress = (parseFloat(scrubber.value) / 100) * (STEP_COUNT - 1);
      update();
    });
  }

  // load preset then render
  await loadPreset();
  await refreshSunriseStatus();
  loadAudio(); // non-blocking — loads birds.mp3 in background
  update();

  // poll sunrise status every 5s
  setInterval(refreshSunriseStatus, 5000);
}

document.addEventListener('DOMContentLoaded', init);
