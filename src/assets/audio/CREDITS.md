# Taxi Chaos FX credits

All samples are embedded in the standalone HTML. Edited for mono playback,
matched loudness, short fades, loop seams and size (22.05 kHz PCM loops / MP3
one-shots). Playback further changes pitch, volume and filtering.

## CC0 / public domain

- **domasx2 — racing car engine sound loops** (`loop_0.wav` → `engine.wav`).
  https://opengameart.org/content/racing-car-engine-sound-loops
  Source: https://opengameart.org/sites/default/files/loop_0.wav
  The author remade the loops using a public-domain recording, as documented on
  the source page. https://creativecommons.org/publicdomain/zero/1.0/
- **Kenney — Impact Sounds** (two variants each of Generic light, Metal medium,
  Plate heavy, Wood heavy, Glass heavy, Tin medium and Punch heavy).
  https://kenney.nl/assets/impact-sounds
  https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip
- **Kenney — Sci-fi Sounds** (`explosionCrunch_001/002`,
  `lowFrequency_explosion_000`, `slime_000`).
  https://kenney.nl/assets/sci-fi-sounds
  https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip
  Both Kenney packs: https://creativecommons.org/publicdomain/zero/1.0/
- **aquinn — Sirens and Alarm Noise** (excerpt from `siren_0.mp3`).
  https://opengameart.org/content/sirens-and-alarm-noise
  https://opengameart.org/sites/default/files/siren_0.mp3
  https://creativecommons.org/publicdomain/zero/1.0/

## Creative Commons Attribution 3.0

Used under **CC BY 3.0**, with the edits described above. These credits are also
available from the welcome/pause screen and embedded in the built HTML.
License: https://creativecommons.org/licenses/by/3.0/

- **audible-edge / Tom Haigh; loop edit by qubodup — Car tire squeal skid loop**.
  https://opengameart.org/content/car-tire-squeal-skid-loop
  Original: https://freesound.org/people/audible-edge/sounds/71739/
  Download: https://opengameart.org/sites/default/files/tires_squal_loop.wav
- **Iwan Gabovitch (qubodup, qubodup@gmail.com) — Racing Speed Boost Sound**.
  https://opengameart.org/content/racing-speed-boost-sound
  https://opengameart.org/sites/default/files/boost-ogg-only.zip
- **qubodup — Fire Loop**.
  https://opengameart.org/content/fire-loop
  Original: https://freesound.org/people/qubodup/sounds/176724/
  Download: https://opengameart.org/sites/default/files/qubodupFireLoop.ogg

## Generated cues

Pickup, payment, purchase, repair, escape and arrest cues are short procedural
Web Audio tones created for Taxi Chaos. No music or voice recordings are included.

## Reproducing the edits

Download the above sources; extract Kenney archives to `impact/` and `scifi/`,
and the boost archive to `boost/`. Rename the engine, tyre and siren downloads to
`engine.wav`, `skid.wav`, `siren.mp3`; fire to `fire.ogg`. Then run:

```sh
python3 tools/prepare-audio.py <download-directory> src/assets/audio
```
