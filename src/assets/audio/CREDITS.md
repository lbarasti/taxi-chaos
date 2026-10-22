# Taxi Chaos FX credits

All samples are embedded in the standalone HTML. Edited for mono playback,
matched loudness, short fades, loop seams and size (22.05 kHz PCM loops / MP3
one-shots). Playback further changes pitch, volume and filtering.

## CC0 / public domain

- **GGBotNet — Car Sound Effects Pack (Low Quality)**
  (`Car_Engine_Loop_2.ogg` → traffic `engine.wav`,
  `Car_Horn.ogg` → short, quieter `horn.mp3`).
  https://opengameart.org/content/car-sound-effects-pack-low-quality
  Source: https://opengameart.org/sites/default/files/car_sound_effects_pack.zip
  https://creativecommons.org/publicdomain/zero/1.0/
- **Nox_Sound / Nox Sound Design — Peugeot 308 engine recordings**.
  Interior idle (`522223` → `player-engine.wav`):
  https://freesound.org/people/Nox_Sound/sounds/522223/
  Exterior idle (`522225` → `engine-load.wav`):
  https://freesound.org/people/Nox_Sound/sounds/522225/
  Both are steady recordings of the same road car. The interior supplies the
  occupied idle; the exterior supplies a stronger engine texture under throttle.
  Each uses seconds 3–7 from Freesound's public high-quality MP3 preview, with
  45 Hz high-pass / 2.8 kHz low-pass filtering, mono conversion, RMS matching and
  loop seam blending. Native recording pitch is retained at player idle; both
  layers follow the same gear/RPM envelope. Preview sources:
  https://cdn.freesound.org/previews/522/522223_9250976-hq.mp3
  https://cdn.freesound.org/previews/522/522225_9250976-hq.mp3
  https://creativecommons.org/publicdomain/zero/1.0/
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

Download the above sources; extract the car archive to `car-pack/`, Kenney
archives to `impact/` and `scifi/`, and the boost archive to `boost/`. Rename the
tyre and siren downloads to `skid.wav`, `siren.mp3`; fire to `fire.ogg`.
Save the two Nox preview downloads as `peugeot-308-interior.mp3` and
`peugeot-308-exterior.mp3`. Then run:

```sh
python3 tools/prepare-audio.py <download-directory> src/assets/audio
```

Use `--car-only` for the traffic engine and horn from just the car archive.
Use `--player-engine-only` for the player loops from just the two Nox downloads.
