import time
import threading
import pygame
from flask import Flask, jsonify, request

app = Flask(__name__)

# pre_init with explicit settings is critical on Raspberry Pi hardware
pygame.mixer.pre_init(44100, -16, 2, 512)
pygame.mixer.init()
pygame.mixer.music.load("/home/marius/birds.mp3")
pygame.mixer.music.set_volume(0)

fade_lock = threading.Lock()


def fade_in(duration_s=20, max_volume=100):
    """Gradually increase volume from 0 to max_volume over duration_s seconds."""
    steps = 20
    delay = max(0.1, duration_s / steps)
    with fade_lock:
        pygame.mixer.music.play()
        time.sleep(1)
        for i in range(steps + 1):
            v = int(round(max_volume * i / steps))
            pygame.mixer.music.set_volume(v / 100)
            time.sleep(delay)
            print(f'Fade-in: {v}%')
        print("Fade-in complete")


def fade_out_and_stop(step=5, delay=0.5):
    """Gradually lower volume to 0 and stop playback."""
    with fade_lock:
        current_vol = int(round(pygame.mixer.music.get_volume() * 100))
        print(f'Fade-out from {current_vol}%')
        for v in range(current_vol, -1, -step):
            pygame.mixer.music.set_volume(max(v / 100, 0))
            time.sleep(delay)
            print(f'Fade-out: {v}%')
        pygame.mixer.music.stop()
        print("Fade-out complete")


@app.route("/fadein", methods=["POST", "GET"])
def fadein_endpoint():
    """Trigger fade-in. Optional ?duration=<seconds> to scale fade length."""
    duration_s = request.args.get('duration', 20, type=int)
    duration_s = max(5, min(300, duration_s))
    t = threading.Thread(target=fade_in, kwargs={'duration_s': duration_s}, daemon=True)
    t.start()
    return jsonify({"status": "fading in", "duration_s": duration_s}), 200


@app.route("/fadeout", methods=["POST", "GET"])
def fadeout_endpoint():
    """Trigger fade-out."""
    t = threading.Thread(target=fade_out_and_stop, daemon=True)
    t.start()
    return jsonify({"status": "fading out"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
