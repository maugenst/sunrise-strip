import pygame
import time

pygame.mixer.pre_init(44100, -16, 2, 512)  # critical on Raspberry Pi
pygame.init()

print("Initializing mixer...")
pygame.mixer.init()

print("Loading file...")
pygame.mixer.music.load("birds.mp3")

print("Playing...")
pygame.mixer.music.play()

while pygame.mixer.music.get_busy():
    time.sleep(0.1)

print("Done")

