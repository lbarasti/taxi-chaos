"""Prepare the curated FX palette. Requires ffmpeg; see src/assets/audio/CREDITS.md.

Usage: python3 tools/prepare-audio.py <download-directory> <existing-output-directory>
The download directory contains engine.wav, skid.wav, fire.ogg, siren.mp3 and the
extracted impact/, scifi/ and boost/ archives listed in CREDITS.md.
Loops are PCM WAV (no codec padding); one-shots are small MP3s.
"""
import array
import math
from pathlib import Path
import subprocess
import sys
import wave

source, output = map(Path, sys.argv[1:])
RATE = 22050


def prepare(name, path, loop=False, start=0, duration=None, rms=0.18):
    command = ['ffmpeg', '-v', 'error', '-ss', str(start), '-i', str(source / path)]
    if duration:
        command += ['-t', str(duration)]
    raw = subprocess.check_output(command + ['-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'])
    pcm = array.array('h', raw)
    samples = [v / 32768 for v in pcm]
    if not loop:
        # Remove leading/trailing silence without clipping the attack/tail.
        audible = [i for i, v in enumerate(samples) if abs(v) > 0.003]
        if audible:
            samples = samples[max(0, audible[0] - 110):min(len(samples), audible[-1] + 220)]
    else:
        # Overlap-add the seam; the loop starts/ends at the same phase of this blend.
        overlap = min(int(RATE * 0.035), len(samples) // 8)
        blend = [samples[-overlap + i] * (1 - i / overlap) + samples[i] * (i / overlap) for i in range(overlap)]
        samples = blend + samples[overlap:-overlap]
    energy = math.sqrt(sum(v * v for v in samples) / len(samples))
    gain = min(rms / max(energy, 0.0001), 0.88 / max(max(abs(v) for v in samples), 0.0001))
    if not loop:
        for i in range(min(88, len(samples))):
            samples[i] *= i / 88
            samples[-i - 1] *= i / 88
    pcm = array.array('h', [round(v * gain * 32767) for v in samples])
    if loop:
        target = output / f'{name}.wav'
        with wave.open(str(target), 'wb') as wav:
            wav.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            wav.writeframes(pcm.tobytes())
    else:
        target = output / f'{name}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', str(target)], input=pcm.tobytes(), check=True)
    print(f'{target.name}: {len(samples) / RATE:.2f}s, {target.stat().st_size} bytes')


prepare('engine', 'engine.wav', loop=True)
prepare('skid', 'skid.wav', loop=True, rms=0.14)
prepare('fire', 'fire.ogg', loop=True)
prepare('siren', 'siren.mp3', loop=True, start=0.5, duration=4, rms=0.12)
prepare('boost-loop', 'boost/boost-ogg/boost-loop.ogg', loop=True, rms=0.14)
prepare('boost-start', 'boost/boost-ogg/boost-start.ogg', rms=0.14)
prepare('boost-end', 'boost/boost-ogg/boost-end.ogg', rms=0.12)
for category, original in [('bump', 'impactGeneric_light'), ('crunch', 'impactMetal_medium'), ('crash', 'impactPlate_heavy'), ('wood', 'impactWood_heavy'), ('glass', 'impactGlass_heavy'), ('metal', 'impactTin_medium'), ('body', 'impactPunch_heavy')]:
    for i in range(2):
        prepare(f'{category}-{i}', f'impact/Audio/{original}_{i:03}.ogg')
for i in range(2):
    prepare(f'explosion-{i}', f'scifi/Audio/explosionCrunch_{i + 1:03}.ogg')
prepare('rumble', 'scifi/Audio/lowFrequency_explosion_000.ogg')
prepare('pulp', 'scifi/Audio/slime_000.ogg')
