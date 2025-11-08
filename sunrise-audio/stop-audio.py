import vlc
import time

# Create VLC media player instance
p = vlc.MediaPlayer("file:///home/marius/birds.mp3")

# Start playing
p.play()

# Wait a short moment to ensure playback starts
time.sleep(1)

# Gradually increase volume from 1 to 100
for volume in range(1, 101):
    p.audio_set_volume(volume)
    print(f"Volume: {volume}")
    time.sleep(0.1)  # Adjust speed of volume increase (in seconds)

# Stop playback after volume ramp
p.stop()