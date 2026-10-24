# Sunrise Strip

A Raspberry Pi wake-up system that surrounds a wall picture with a WS2812B LED strip, gradually brightening like a sunrise while playing birdsong audio.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Raspberry Pi 4                                         │
│                                                         │
│  ┌─────────────────┐    ┌──────────────────────────┐   │
│  │  led-daemon.js  │    │     server.js            │   │
│  │  (root)         │    │     (marius, port 8080)  │   │
│  │                 │◄───│                          │   │
│  │  - GPIO/DMA     │ WS │  - HTTP API              │   │
│  │  - WS2812B LEDs │5455│  - Static UI             │   │
│  │  - Sunrise anim │    │  - WS event proxy :8080  │   │
│  │  - Crontab mgmt │    │    /ws/events            │   │
│  └────────┬────────┘    └──────────────────────────┘   │
│           │ GPIO 10/DMA 10                               │
│  ┌────────▼────────┐    ┌──────────────────────────┐   │
│  │  WS2812B LEDs   │    │  sunriseaudio.service    │   │
│  │  300 LEDs       │    │  (marius, port 5000)     │   │
│  │  GPIO SPI MOSI  │    │  Python/Flask/pygame     │   │
│  └─────────────────┘    │  3.5mm audio jack        │   │
│                          └──────────────────────────┘   │
│                                                         │
│  Cron (marius):                                         │
│  0 6 * * * curl -s -X POST http://localhost:8080/api/sunrise  │
└─────────────────────────────────────────────────────────┘
```

### Why the daemon runs as root

`rpi-ws281x-native` requires root for DMA and GPIO access on the Pi. Rather than running the entire web stack as root, only the minimal LED daemon runs privileged. Everything else (web server, audio, cron trigger) runs as the regular `marius` user.

### Why cron uses curl, not node

Cron runs with a restricted environment (`PATH=/usr/bin:/bin`). Using `curl` to call the HTTP server avoids:
- PATH issues (`node` lives at `/usr/local/bin/node`)
- ES module loading overhead
- Log file permission issues
- Any Node startup failures silently swallowing the alarm

---

## Services

| Service | User | Port | Purpose |
|---|---|---|---|
| `led-daemon.service` | root | WS :5455 (localhost only) | Hardware LED control + sunrise animation |
| `sunrise-server.service` | marius | HTTP :8080, WS :8080/ws/events | Web UI + API + event proxy |
| `sunriseaudio.service` | marius | HTTP :5000 | Birdsong playback via pygame |

---

## Web UI

Open `http://sunrise:8080` in any browser on your network.

| Page | Path | Purpose |
|---|---|---|
| Alarm | `/` | Set wake-up time, enable/disable alarm |
| Simulation | `/simulation` | Edit color curve, preview, sim/real mode |
| Visualizer | `/visualizer` | Live LED canvas visualization |

---

## Local Development (Mac)

```bash
cd sunrise
npm run dev        # starts server.js + led-daemon.mock.js in parallel
npm run dev:stop   # kills both processes
```

Open `http://localhost:8080/visualizer` for the live LED sandbox with browser audio.

---

## Deployment

```bash
cd sunrise
npm run deploy          # push + pull Pi (no restart)
npm run deploy:restart  # push + pull Pi + restart services
npm run stop:sunrise    # send stop signal to running sunrise
```

---

## Hardware

- Raspberry Pi 4
- WS2812B LED strip — 300 LEDs, GPIO pin 10 (SPI MOSI), DMA channel 10
- Passive speakers on 3.5mm audio jack (card 2: `bcm2835 Headphones`)
- `birds.mp3` at `/home/marius/birds.mp3`

---

## Pi Setup (fresh install)

```bash
# 1. Clone
git clone https://github.com/maugenst/sunrise-strip.git
cd sunrise-strip/sunrise
npm install

# 2. Install systemd services
sudo cp /path/to/led-daemon.service /etc/systemd/system/
sudo cp /path/to/sunrise-server.service /etc/systemd/system/
sudo cp /path/to/sunriseaudio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable led-daemon sunrise-server sunriseaudio
sudo systemctl start led-daemon sunrise-server sunriseaudio

# 3. Set alarm via web UI
# Open http://sunrise:8080 and set your wake-up time
# This writes the crontab entry automatically
```

---

## Alarm mechanism

The alarm is stored as a crontab entry for the `marius` user, managed by the `led-daemon` (which uses `crontab -u marius`). The cron command uses `curl` to call the HTTP API:

```
0 6 * * * curl -s -X POST http://localhost:8080/api/sunrise
```

This avoids PATH, permission, and startup issues. The daemon handles the full 15-minute sunrise, logging to `journalctl -u led-daemon`.

---

## Logs

```bash
# Sunrise animation progress
sudo journalctl -u led-daemon -f

# Web server requests
sudo journalctl -u sunrise-server -f

# Audio service
sudo journalctl -u sunriseaudio -f

# Cron execution history
sudo journalctl | grep CRON
```
