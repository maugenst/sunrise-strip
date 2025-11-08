# 🌅 Sunrise Wall Picture Wake-Up System

This project brings a **natural sunrise simulation** into your bedroom by surrounding a large wall picture with an LED strip that gradually lights up while soft wake-up music plays.  
The wake-up time and sunrise duration are adjustable via a **web frontend**.

---

## 🧠 Overview

The system consists of two Raspberry Pis:

| Component | Role | Hardware | Notes |
|------------|------|-----------|-------|
| **sunrise** | Controls the LED strip around the wall picture | Raspberry Pi 4 (or any compatible Pi) | Uses a library that accesses the Pi’s sound chip |
| **sunrise-audio** | Plays wake-up sounds/music | Raspberry Pi 3B | Separate device because LED control occupies the Pi’s audio interface |

### Why Two Raspberry Pis?

The LED-strip control library directly uses the Raspberry Pi’s sound chip.  
Because of this, the same device cannot simultaneously play music.  
To overcome this limitation, a **second Raspberry Pi** (`sunrise-audio`) handles sound playback independently.

---

## 🌇 Features

- Gradual sunrise simulation using an LED strip
- Adjustable wake-up time via a **Svelte/SvelteKit web frontend**
- Independent **NestJS REST API** on the audio controller
- Synchronization between light and sound start
- Configurable duration, brightness curve, and color gradient
- Modular architecture – runs on nearly any Raspberry Pi model

---

## 🧩 Repository Structure

```
sunrise-strip/
├── sunrise/               # LED controller (SvelteKit + LED control)
│   ├── src/
│   ├── public/
│   └── README.md
└── sunrise-audio/         # Audio controller (NestJS REST API)
    ├── src/
    └── README.md
```

---

## 🔌 Hardware Components

| Link | Description |
|------|--------------|
| [AZDelivery Jumper Wire Set (120 pcs)](https://www.amazon.de/dp/B074P726ZR) | Male-to-male, male-to-female, and female-to-female jumper wires for connecting the Raspberry Pi to the LED strip and other components. |
| [YIXISI 5.5×2.1 mm DC Pigtail Adapter Cables](https://www.amazon.de/dp/B0CMK6ZC7X) | DC power plug adapters for connecting LED strip and power supply cables securely. |
| [BTF-Lighting WS2812B LED Strip (5 m)](https://www.amazon.de/dp/B078JJJ2SJ) | Individually addressable RGB LED strip (5 V), suitable for sunrise light effects. |
| [ALITOVE 5 V 10 A Power Supply](https://www.amazon.de/dp/B0D93QKS26) | Provides stable power for up to 300 WS2812B LEDs. Ensure adequate amperage for your strip length. |
| [Logic Level Shifter Module 3.3 V↔5 V](https://www.amazon.de/dp/B0CW2RFQS8) | Converts the 3.3 V GPIO data signal from the Raspberry Pi to 5 V required by most LED strips. |
| [SanDisk 32 GB microSDHC Card](https://www.amazon.de/dp/B01CDTEG1O) | Storage for Raspberry Pi OS and project files. |
| [Raspberry Pi 4 Model B (4 GB)](https://www.amazon.de/dp/B085C25P92) | Runs the `sunrise` LED controller and frontend. |
| [Raspberry Pi 3 Model B + Case](https://www.amazon.de/dp/B01LCXFEMM) | Used as `sunrise-audio` for sound playback. |
| [HiFiBerry DAC+ Light Sound Card](https://www.amazon.de/dp/B0DHY45TL7) | Optional external DAC for high-quality audio playback on `sunrise-audio`. |
| [WAV Monospeaker 5 W USB Powered](https://www.amazon.de/dp/B0F48LWK9S) | Simple USB speaker for wake-up sounds. |
| [Mean Well LRS-50-5 Power Supply (5 V 10 A)](https://www.amazon.de/dp/B09NDP48TX) | Reliable 5 V PSU alternative with terminal connections for LED and Pi. |

---

## 🔧 Wiring the LED Strip

Wiring was based on this helpful video tutorial (in German):  
🎥 [YouTube: Raspberry Pi LED Strip Tutorial (German)](https://www.youtube.com/watch?v=kVFnEXX-YUE)

For non-German speakers, here’s an [auto-translated version](https://www.youtube.com/watch?v=kVFnEXX-YUE&cc_lang_pref=en&cc_load_policy=1)  
(activate subtitles → “Auto-translate” → English).

### Basic Wiring Steps

1. **Power:**
    - Connect LED strip **+5 V** (or +12 V depending on model) to power supply.
    - Connect **GND** of LED strip to the same power supply and Raspberry Pi GND.

2. **Data Line:**
    - Connect LED strip **Data IN** to a Raspberry Pi GPIO pin (default: `GPIO18`).
    - If the strip runs on 5 V logic, use a **level shifter** to boost signal from 3.3 V to 5 V.

3. **Ground Reference:**
    - Ensure all grounds (Pi, LED, PSU) are connected together.

4. **Check Power Budget:**
    - Each WS2812B LED draws up to ~60 mA at full white brightness.
    - Plan power injection points for long strips to avoid voltage drop.

---

## 💻 Installation & Setup

### 1. Clone Repository

```bash
git clone https://github.com/maugenst/sunrise-strip.git
cd sunrise-strip
```

### 2. Build the LED Controller (`sunrise`)

```bash
cd sunrise
npm install
npm run build
```

Create a `.env` file:

```bash
LED_GPIO_PIN=18
LED_COUNT=300
SUNRISE_DURATION_MINUTES=30
AUDIO_CONTROLLER_URL=http://sunrise-audio.local:3000
```

### 3. Build the Audio Controller (`sunrise-audio`)

```bash
cd ../sunrise-audio
npm install
npm run build
```

Create a `.env` file:

```bash
AUDIO_PORT=3000
WAKEUP_AUDIO_FILE=/home/pi/audio/wakeup.mp3
```

### 4. Deploy

| Pi | Folder | Command |
|----|---------|----------|
| **sunrise** | `sunrise/` | LED controller + web frontend |
| **sunrise-audio** | `sunrise-audio/` | Audio playback REST API |

Ensure both devices can reach each other via network (e.g., `ping sunrise-audio.local`).

---

## 🚀 Running the Services

On `sunrise-audio`:
```bash
npm run start:prod
```

On `sunrise`:
```bash
npm run start:prod
```

Then open the **web frontend** in your browser:
```
http://sunrise.local:5173
```

---

## 🧭 Future Enhancements

- Add weekly schedule profiles (e.g., weekdays vs weekends)
- Integrate ambient light sensor for brightness adaptation
- Add MQTT / Home Assistant integration
- Allow multiple sunrise scenes or themes
- Add snooze control via web or physical button

---

## 📚 References

- LED wiring tutorial (German): [YouTube](https://www.youtube.com/watch?v=kVFnEXX-YUE)
- Auto-translated version (English): [YouTube Auto-Translate](https://www.youtube.com/watch?v=kVFnEXX-YUE&cc_lang_pref=en&cc_load_policy=1)

---

## 🪪 License

MIT License © 2025 Marius Augenstein

Enjoy your new **Sunrise Wake-Up Wall Picture** 🌞
