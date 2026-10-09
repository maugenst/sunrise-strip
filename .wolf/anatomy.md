# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-10-09T13:25:59.025Z
> Files: 33 tracked | Anatomy hits: 0 | Misses: 0

## ../marius_ai_tools/wiki/projects/

- `demo-agent.md` — Demo Agent — Infrastructure & Services (~3088 tok)

## ./

- `._requirements.txt` (~1024 tok)
- `.gitignore` — Git ignore rules (~233 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `LICENSE` — Project license (~9374 tok)
- `README.md` — Project documentation (~2765 tok)
- `requirements.txt` — Python dependencies (~962 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## sunrise-audio/

- `._test_audio.py` (~1170 tok)
- `start-audio.py` — API router (~591 tok)
- `test_audio.py` — Test file (~100 tok)

## sunrise-audio/.codegraph/

- `.gitignore` — Git ignore rules (~61 tok)

## sunrise/

- `index.js` — index.js — cron-invoked sunrise trigger. (~951 tok)
- `led-client-runner.js` — led-client-runner.js — minimal cron entry point, equivalent to: node index.js (~55 tok)
- `led-daemon.js` — led-daemon.js — root-privileged WebSocket daemon for LED strip + sunrise animation (~3984 tok)
- `led-daemon.mock.js` — led-daemon.mock.js — sandbox version of led-daemon.js for local development (~2764 tok)
- `package-lock.json` — npm lock file (~14960 tok)
- `package.json` — Node.js package manifest (~221 tok)
- `README.md` — Project documentation (~94 tok)
- `server.js` — server.js — Fastify HTTP server replacing SvelteKit (~2174 tok)
- `sunrise-preset.json` (~492 tok)

## sunrise/.codegraph/

- `.gitignore` — Git ignore rules (~61 tok)
- `errors.log` (~104 tok)

## sunrise/public/

- `app.css` — Styles: 76 rules, 26 vars, 2 animations (~3222 tok)
- `index.html` — Sunrise Alarm (~3130 tok)
- `simulation.html` — Sunrise Simulation (~2362 tok)
- `simulation.js` — simulation.js — full simulation page logic, no framework (~7840 tok)
- `visualizer.html` — LED Visualizer — Sandbox (~5589 tok)

## sunrise/scripts/

- `deploy.js` — scripts/deploy.js — deploy latest main from Mac to the Pi (~1574 tok)
- `dev-stop.js` — scripts/dev-stop.js — kill the dev server and mock daemon by port (~157 tok)
- `stop-sunrise.js` — scripts/stop-sunrise.js — send stopSunrise + off to the running daemon (~148 tok)

## sunrise/server/

- `ledClient.js` — Establish / re-establish connection to the daemon. (~1920 tok)
