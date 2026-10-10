# FARE CITY

A frontend-only TypeScript driving game: taxi fares, motorcycle parcel deliveries, four-tyre car and single-track bike physics, smashable shortcuts, intelligent traffic, police tactics, critical damage, vehicle fires and fuel-station chain reactions. Desktop/keyboard first. Opt-in **pulp gore** adds fatal pedestrian impacts, blood, corpses and blood-stained tyre tracks. All visuals are procedural Canvas art; a sample-based **sound FX** mixer adds driving, destruction and gameplay feedback. No backend, API keys or runtime network requests.

## Run

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server supports instant TypeScript/CSS updates.

## Single HTML deployment

```sh
npm run build
```

**`dist/index.html` is the entire game.** JavaScript, CSS, icons, sound samples and the downloaded font are embedded. Double-click it to play via `file://`, or deploy that one file to any static host. Internet access is not required. Save data stays in the browser's local storage when available; storage restrictions do not prevent playing.

```sh
npm run preview
```

## Controls & game loop

| Input | Action |
| --- | --- |
| WASD / arrows | Drive; move in screen directions while on foot |
| Space | Car handbrake / drift; motorcycle rear brake |
| Shift + accelerate | Rechargeable nitro boost (blue jets + active HUD) |
| E | Exit / dismount; take a nearby parked car or motorbike |
| R | Optional tow & repair after a wreck |
| G / garage button | Set/cancel a garage route; enter when stopped nearby |
| P / Escape | Pause / resume |
| M / speaker button | Mute / unmute sound FX |
| F2 / Test Lab button | Open the scenario and cheat inspector |

Touch steering, pedals, drift and boost are shown on small screens; desktop is the primary target. Pulp gore and **Cruise / Street / Chaos** difficulty can be changed on the welcome or pause screen as well as in the lab.

**Pause → Shift stats** shows earnings, completed jobs (fares and parcels), smashed objects and pedestrian fatalities for the current shift. The fatality count is kept off the driving HUD.

- Slow down in a **yellow ring** to pick up; deliver to the **green ring** for base fare plus time/comfort tips.
- Late delivery still pays: the timer affects the bonus, not whether a job can finish.
- Drifts and near-misses earn small skill bonuses. Boost recharges automatically.
- Hydrants, crates, benches, bins, barriers, trees and kiosks break. **Civic Barracks**, **Freight Depot** and the **Last Chance Fuel** shop are larger destructible structures. Damage cracks their roofs; collapse opens drivable rubble. Fuel pumps and the station can ignite and cause chain blasts.
- Cars track **engine, fuel-system and tyre damage**. Front, rear and side impacts damage different components, reducing performance. Severe/accumulated damage starts a visible fire countdown, then an area blast leaves a solid wreck. Repair at Pit Stop extinguishes fires and restores all components.
- **Cab on fire? Press E to bail out, then run clear with WASD/arrows.** The abandoned fuse keeps counting down and the car still explodes. Follow the blue route/radar markers to a parked replacement and press E beside it. Wallet, upgrades and heat carry over; an aboard passenger evacuates and dispatch sends a new fare without paying the abandoned trip. Burning cars and wrecks cannot be entered. Ordinary exits require slowing below 6 m/s; emergency fire exits work at speed.
- The city starts with **39 physical parked vehicles**, including courier motorbikes, in marked curb bays and two open public parking lots. One bike is beside the starting cab at Pit Stop. Empty bays make parking legible. Parked vehicles remain still, can be hit/pushed/damaged, and do not count toward the moving-traffic slider.
- Nitro now applies **3.1× engine force** (previously 1.9×). Blue twin exhaust jets/speed streaks and a cyan **NITRO ACTIVE** dashboard show actual activation. The existing rechargeable tank/upgrades still control duration.
- A cab explosion leaves the centre of the screen unobstructed. A small roadside card appears after 0.65 seconds; **E** lets you leave the wreck and **R** offers optional tow/repair (up to $60). Tow is unavailable for the first 1.2 seconds so the blast cannot be skipped. Hazard chains and effects keep running. Pit Stop can still save a burning car before its fuse expires; a detonated car stays wrecked until an explicit repair/tow.
- Civilian drivers sense obstacles, slow for turns, pass where there is room, and back out using physically previewed reversing arcs. Alley exits are part of recovery. Impossible traps enter an **Awaiting tow** state; off-screen cleanup keeps the city flowing without visibly teleporting cars. Drivers abandon burning cars.
- Police share sightings and use **pursuit, predictive interception and junction-blocking** roles. They brake for excessive closing speed, aim for the cab's rear quarter, search last-known locations after losing contact, and can recover from collisions themselves.
- Property damage, pedestrian impacts and sustained speeding build heat. Street difficulty fields up to four cops; Cruise allows two and Chaos allows six.
- On Street, break line of sight for eight seconds to escape; a contained slow cab is arrested after 3.5 seconds. Cruise gives a six-second escape/five-second arrest window; Chaos uses ten/2.6 seconds. Bail is capped at the wallet balance.
- Gore is off by default. With it enabled, fast impacts and severe blast exposure can kill pedestrians, including a waiting customer. Dispatch replaces a lost customer without awarding a fare. With gore disabled, street hits are nonfatal. Blood/effects are bounded and old off-screen corpses are cleared; civilian population replenishes off-screen.
- Buy engine, grip, armor and boost upgrades at **Pit Stop** in Old Town. Wallet, upgrades and completed-fare count persist. Repairs and bail return you to the driving loop.

## Motorbike deliveries & lean

- **Try it:** start your shift, press **E** to leave the cab, walk a little down/right to the orange bike beside Pit Stop, and press **E** to ride. Bikes are also parked throughout town. **F2 → Motorbike deliveries → Run** isolates this loop.
- Mounting a bike changes dispatch to **parcel deliveries**. Stop in yellow for 0.8 seconds to load a visible parcel onto the rear rack, then stop in green to earn base pay plus speed/cargo-condition tips. Further jobs stay parcels until you take a car again. Dismounting with cargo cancels that delivery without payment; taking a car restores passenger fares. Wallet, upgrades, boost, heat and shift totals carry across vehicles.
- Bikes are 2.6 × 0.8 m, with a 260 kg bike/rider body, two inline tyre contact points, their own engine/grip tuning, speed-sensitive steering, limited cornering traction, strong brakes and walking-speed reverse. Existing collision, fire, repair, police and lighting systems apply. Space uses the rear brake; Shift boosts with a single exhaust jet. The engine uses a higher-pitched version of the existing embedded sample.
- **Research basis:** [Bicycle and motorcycle dynamics](https://en.wikipedia.org/wiki/Bicycle_and_motorcycle_dynamics) explains inward lean, smaller steering angles at speed and countersteering; [Steve Munden's cornering derivation](https://www.stevemunden.com/leanangle.html) gives `tan(lean) = lateral acceleration / g = v² / (radius × g)`. `src/motorcycle.ts` derives target lean from actual tyre forces, capped at 46.8°, and uses a critically damped roll transition. Steering alone at rest cannot yaw or lean the bike. This is an assisted, grip-limited planar model rather than a full multibody/countersteering simulation.
- **Top-down depth cue:** roll is around the road-contact line. Frame, rack, arms and helmet shift inward by `height × sin(lean)` while their transverse width and height scale by `cos(lean)`. Higher parts shift farther; the tyre contact line stays on the pavement and cast shadows shorten. The rider plants a foot at stops, empty parked bikes lean onto their stand, and wrecks lie on their side.
- Lab snapshots expose `vehicleModel` and signed `lean` (radians); `vehicles()` includes `model` and `lean` for each vehicle. The driving HUD shows the bike's lean angle.

## Day/night cycle

- New runs start at **07:00** on day 1. One simulated second advances one in-game minute, so a full day lasts **24 minutes** at the normal rate.
- Periods: morning 05:00–12:00, afternoon 12:00–17:00, evening 17:00–21:00, night 21:00–05:00. Labels change at those boundaries; lighting, moving sun shadows and local lights interpolate smoothly across every transition, including midnight.
- Time advances only while the world advances (playing/wrecked). It freezes in intro/pause/garage/arrest and follows fixed lab stepping. Changing the hour never alters existing fare/fire timers and never consumes gameplay RNG.
- The top-bar HUD clock shows zero-padded **HH:MM**, the period name and a sun/moon icon, and stays visible on tablet/mobile widths.
- Lab controls (F2): an hour slider, morning/afternoon/evening/night presets (07:00/14:00/19:00/23:00), a cycle-rate slider and a cycle-only freeze. These affect the day/night clock only; the simulation speed and Step controls are unchanged.

Automation defaults and API: `__taxi.dayNight(options)` accepts `{ hour?, rate?, frozen? }`. `hour` is fractional 0–24 (wrapped; default 07:00), `rate` is in-game minutes per simulated second (default `1`; `0` pauses the cycle, capped at `240`), and `frozen` pauses the cycle without pausing the world. It returns the refreshed `LabSnapshot`, whose `dayNight` field is `{ hour, minutes, day, time, period, rate, frozen }`.

## Sound FX

Audio starts only after a click/tap or keyboard interaction; loading the page creates no
AudioContext. **FX volume, mute and a separate siren volume** are on the welcome/pause
screen and in F2, and persist independently of progress/difficulty. Defaults: FX 65%,
sirens 25%. Set sirens to 0% to disable them. A browser without audio support still plays.

- Recorded taxi engine loop follows speed/throttle/boost, with smooth pitch, load and filter changes.
- Tyre squeal follows actual rear-tyre slip and speed; holding Space while stationary is quiet.
- Boost has onset, rush and release sounds. Impacts use severity thresholds, per-contact
  cooldowns and alternating variants. God mode still produces physical impact sounds.
- Wood, metal, glass, body impacts, collapse, burning and explosions have separate samples.
  The pulp layer plays only with gore enabled; there are no voices or music.
- Pickup/payment, purchase/repair, escape and arrest have brief generated confirmation cues.
- World sounds fade with distance and pan gently by screen X. Only the nearest two traffic
  engines/two sirens/three fires contribute loops. One-shots are capped at 20, prioritising
  explosions over clutter; a compressor controls dense peaks.
- World sounds stop during pause/garage/arrest, on focus loss and in background tabs.
   Garage confirmations still play. Roadside fires and chain blasts continue while those
  hazards are simulated. Fixed lab stepping is silent and does not replay old events on Live.
- **F2 → Sound FX audition** plays an isolated sound for two seconds without changing the
  simulation; mute and volume still apply. Stop cancels it early. Use Live to hear fixtures
  in context: Alley, Wall, Police chase, Fire, Chain reaction or Gas station.

The palette includes 25 locally embedded samples plus generated cues. PCM WAV loops avoid
codec padding; one-shots use compact MP3. Full credits, source links, licences and edit
instructions: [`src/assets/audio/CREDITS.md`](src/assets/audio/CREDITS.md). Credits are also
in the welcome/pause UI and the standalone HTML. `tools/prepare-audio.py` reproduces edits
from downloaded source files with Python 3 and ffmpeg (not required to build/play).

## Fast testing loop

```sh
npm test          # physics, collisions, jobs, destruction, pursuit, economy
npm run build    # strict TypeScript check + standalone build
```

Open **http://localhost:5173/?debug=1**, press **F2**, or click **Test Lab**. The same inspector works in the standalone HTML. Its controls include:

- **17 fixtures:** first fare, **Motorbike deliveries**, hydrant, alley, wall, moving traffic collision, NPC recovery, pileup, police chase, arrest, pedestrians, fire, **Cab fire / escape**, chain reaction, barracks, depot and gas station.
- **Clock:** deterministic 120 Hz stepping, Live, and 0.25× / 0.5× / 1× / 2× speed. Driving keys resume a fixed clock. Pausing freezes fires too.
- **Day / night:** hour slider, morning/afternoon/evening/night presets, cycle rate and a cycle-only freeze. These change the world clock and lighting only, never fare or fire timers.
- **Cheats:** God mode, infinite boost, no police, cash, free repairs, ignition/detonation, four upgrade sliders and Max all.
- **Debug views:** collider outlines, AI paths/roles/recovery phases, density 0–40, and live damage/police/kill/blast/recovery telemetry.
- **Difficulty and gore:** change during a run. Scenario presets may enable gore/God mode for their test; the preset's description explains its setup.
- **Sound FX:** audition every sound, adjust saved FX/siren volume, mute, inspect sample/voice telemetry.

Fixtures clear incidental moving/parked vehicles and preserve cash/upgrades/difficulty. Use the traffic slider to add moving cars back. **Reset run** restores the ordinary 23-moving-car / 39-parked-vehicle city; **Erase saved progress** is a separate action. Upgrade/cash cheats use the usual browser save. Inspector controls stay usable over arrest/recovery UI, so a test can be reset or repaired without paying a gameplay fee.

For browser automation, the opt-in `window.__taxi` harness has:

```js
__taxi.reset();                    // fresh city; freezes the automatic physics clock
__taxi.step(1.25, ['KeyW']);        // 150 fixed simulation steps; returns state
__taxi.step(0.45, ['KeyS']);        // brake
__taxi.step(1);                    // coast / test pickup dwell
__taxi.state();                    // isolated serializable snapshot
__taxi.vehicles();                 // live vehicle transforms for impact checks
__taxi.contacts();                 // current static contact penetration depths
__taxi.scenario('alley');           // resets and positions cab at the alley entrance
__taxi.step(1.1, ['KeyW']);         // burst through a barrier and stacked crates
__taxi.scenario('arrest');
__taxi.step(4.2);                   // verifies containment / arrest UI
__taxi.scenario('npc-recovery');
__taxi.step(10);                    // car backs out and rejoins a street
__taxi.scenario('chain-reaction');
__taxi.step(6);                     // three damaged cars detonate exactly once each
__taxi.scenario('cab-fire');        // burning player cab + parked replacement
__taxi.interact();                 // same exit/enter action as E
__taxi.step(1.3, ['KeyD']);         // physically walk east
__taxi.step(0.4, ['KeyS']);         // approach the parked replacement
__taxi.interact();                 // take it; old cab keeps burning
__taxi.scenario('gas-station');
__taxi.step(7, ['KeyW']);           // pumps + shop produce a four-blast chain
__taxi.scenario('pedestrians');
__taxi.step(1.5, ['KeyW']);         // fatal impacts; gore enabled for the fixture
__taxi.configure({gore: false});
__taxi.upgrades({engine: 3, grip: 3, armor: 3, boost: 3});
__taxi.configure({difficulty: 'chaos', invincible: true, infiniteBoost: true});
__taxi.traffic(40);                // live density adjustment
__taxi.damageVehicle(0, {engine: 60, tyres: 70});
__taxi.ignite(0, 5);               // explicit ignition; overrides impact immunity
__taxi.repair();                   // free lab repair; also clears wrecked mode
__taxi.props();                    // finite-HP structures / fuel states
__taxi.people();                   // pedestrian state, including alive/aboard
__taxi.audio();                    // audio readiness, sample failures, loops, voice counts, output peak
await __taxi.sound('explosion');    // isolated audition; requires browser audio activation
__taxi.stopSound();                // stop audition; world sound resumes if Live
__taxi.dayNight({hour: 19});        // world clock: 19:00 evening; lighting updates immediately
__taxi.dayNight({rate: 4});         // 4× cycle speed (in-game minutes per simulated second)
__taxi.dayNight({frozen: true});    // freeze the cycle only; simulation clocks keep running
__taxi.dayNight();                  // refreshed LabSnapshot, including .dayNight
__taxi.teleport(4, 14);             // isolate a specific location/contact
__taxi.garage();                   // open garage for UI testing
__taxi.realtime();                 // return to keyboard/touch play
__taxi.resetSave();                // clear progression and reload
```

The API is exposed only after opting into the lab. `step()` has no wall-clock waits; modal/paused gameplay stays paused. `realtime()` resumes a paused world, but does not waive arrest/tow or auto-repair a wreck. Always call it after automated checks when leaving a page for interactive play. City generation, traffic choices and particles use seeded RNGs. Pedestrians use 60 Hz updates, automatically rising to 120 Hz for boosted/fast impacts.

For shared browser sessions, run automated resets in a separate isolated browser context. The `loadScenario(game, name)` function in `src/lab.ts` also works in Node tests without a DOM.

## Code map

- `src/physics.ts`: vectors, rigid bodies, four-tyre forces, rotated-rectangle SAT and normal/friction impulses, spatial hash.
- `src/world.ts`: seeded city, special structures, stable entity IDs, and simple shortest street routing (same-street trips are direct; street-to-street trips need at most two turns).
- `src/ai.ts`: obstacle sensing, budgeted physical recovery, road rejoin, police prediction/memory and containment.
- `src/damage.ts`: component damage, armor, fire fuses, blast falloff and bounded impulses.
- `src/pedestrians.ts`: all-car anticipation, collision-free escape, fatal/nonfatal contacts and corpse physics.
- `src/effects.ts`: bounded, deterministic blood, chunks, fire, smoke and expanding blast rings. No camera shake or fullscreen flash.
- `src/sound.ts`: DOM-free bounded event queue, contact cooldowns and pure mix signals; audio does not consume gameplay RNG.
- `src/audio.ts`, `audio-assets.ts`, `audio-controls.ts`: lazy Web Audio mixer, embedded sample palette, saved settings and audition controls.
- `src/game.ts`: fixed-step orchestration, on-foot exit/car switching, parked cars, explosions/chain reactions, jobs, economy, population maintenance and save data.
- `src/renderer.ts`: city/cab/structure drawing, camera, corpses, rubble, routes, minimap and debug overlays.
- `src/lab.ts` / `src/lab.css`: scenario fixtures, inspector, cheats and serializable test API.
- `src/main.ts`: accessible HTML HUD, dialogs, input, fixed-step clock and opt-in automation harness.
- `vite.config.ts`: small single-file build plugin; fails the build if external assets remain.

## Foundation & assets

Driving and rigid-body fundamentals are adapted from **Pat Kerr's [Motion Lab v0.8.2](https://patkerr.co.uk/motion-lab/)** (`math.js`, `physics.js`, `dynamics.js`): tyre-point forces, angular contact velocity, handbrake grip loss and semi-implicit integration. The city, general collision solver and game systems are new. Credit is included in the source and game welcome screen.

**Space Grotesk** by Florian Karsten is downloaded from Google Fonts and embedded locally under the SIL Open Font License. Attribution and the full license are in `src/assets/`; the built HTML includes the font license too. City visuals are procedural, with no textures to load.

**Sound FX:** domasx2 (engine), Kenney (impacts/explosions), aquinn (siren),
audible-edge / Tom Haigh and qubodup (tyres), Iwan Gabovitch / qubodup (boost),
qubodup (fire). CC0 or CC BY 3.0; full attribution and changes in `src/assets/audio/CREDITS.md`.
