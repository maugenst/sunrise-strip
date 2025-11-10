import time
import threading
import pygame
from flask import Flask, jsonify

app = Flask(__name__)

pygame.mixer.init()
pygame.mixer.music.load("/home/marius/birds.mp3")
pygame.mixer.music.set_volume(0)

fade_lock = threading.Lock()  # prevent concurrent fades

def fade_in(step=5, delay=1, max_volume=100):
    """Gradually increase volume from 0 to max_volume."""
    with fade_lock:
        pygame.mixer.music.play()
        time.sleep(1)  # wait a moment to ensure playback starts
        for v in range(0, max_volume + 1, step):
            pygame.mixer.music.set_volume(v/100)
            time.sleep(delay)
            print(f'Percent: {v}')
        print("🎵 Fade-in complete")

def fade_out_and_stop(step=5, delay=0.5):
    """Gradually lower volume to 0 and stop playback."""
    with fade_lock:
        current_vol = int(round(pygame.mixer.music.get_volume() * 100))
        print(f'Current Volume: {current_vol}')

        if current_vol < 0:
            current_vol = 100
        for v in range(current_vol, -1, -step):
            print(f'Percent: {v}')
            pygame.mixer.music.set_volume(max(v/100, 0))
            time.sleep(delay)
        pygame.mixer.music.stop()
        print("🔇 Fade-out complete and playback stopped")

@app.route("/fadein", methods=["POST", "GET"])
def fadein_endpoint():
    """Trigger fade-in remotely."""
    t = threading.Thread(target=fade_in, daemon=True)
    t.start()
    return jsonify({"status": "fading in"}), 200


@app.route("/fadeout", methods=["POST", "GET"])
def fadeout_endpoint():
    """Trigger fade-out remotely."""
    t = threading.Thread(target=fade_out_and_stop, daemon=True)
    t.start()
    return jsonify({"status": "fading out"}), 200


if __name__ == "__main__":
    # Listen on all interfaces for remote calls
    app.run(host="0.0.0.0", port=5000)

