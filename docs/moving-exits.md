# Jumping from moving vehicles — physics, game feel, and test plan

## Gameplay

The same `E` / touch **Jump out** action works at any speed (except while sinking or when a harbour payment takes priority). Hold `A` or `D` as you press E to choose the left/right side. On touch, hold the joystick to that side before tapping the contextual Jump action. The default jump is right.

- **Car, moving:** the driver's hinged side door swings open over the first 0.24 s. The player then leaves the seat, inherits the velocity of that point on the chassis, pushes away sideways, impacts the road, and is drawn as a tumbling prone sprite before regaining foot control. The empty vehicle continues forward under rolling resistance briefly; its door closes after the exit.
- **Bike, moving:** the rider pushes sideways, acquires bike velocity plus a lateral leap, and tumbles. The empty bike receives opposite sideways velocity and an angular/steering/roll disturbance. Left and right mirror one another. A bike at 3 m/s reacts much more strongly than one at 25 m/s.
- **Either ride, below 1.2 m/s:** the player dismounts immediately, with no tumble, impact damage or separation impulse. No door-opening delay is imposed at rest.
- **Landing:** one HP deduction occurs upon ground contact after 0.17 s, scaled by moving speed and difficulty. Invincibility disables injury. Falling at very high speeds can be fatal (normal hospital recovery), but damage is bounded.
- A player cannot re-enter during an unfinished roll. The regular collisions, fire fuses, damaged-vehicle entry restrictions, and passenger/parcel cancellation continue to apply. If all physically usable exit locations are blocked, the action fails safely.

## Dynamics

Bike and rider start as one 260 kg planar body. Upon dismount the bike body keeps 185 kg and the separate driver uses 75 kg. Re-entering restores 260 kg. At a moving exit, the rider inherits the chassis point velocity and gets a sideways 3 m/s leap. The bike's opposite lateral velocity change uses

```ts
bikeSideVelocity = -side * (riderMass / bikeOnlyMass) * 3 * stability
stability = 1 / (1 + ((speed - 1.2) / 8) ** 1.6)
```

The same `stability` factor attenuates an opposite yaw-rate kick and roll-velocity kick as speed increases; subsequent movement integrates through the existing motorcycle tyre-force model and damped lean. `side` is +1 for a jump off the right and -1 for the left. At rest all three kicks are zero.

The sideways impulse exchange is motivated by conservation of lateral momentum between rider and motorcycle. **The speed attenuation and yaw/roll gains are artistic tuning**, not an exact derivation: a real crash depends on tyre-ground constraints, the rider's forces at handlebars/pegs, bike speed and yaw/roll rate, rider posture, suspension, and impact geometry. The simplified 2D game does not model falling sideways in 3D, rider tumbling contacts at limbs, or an unpowered bike tip-over with a true vertical centre of gravity. Therefore neither the swerving direction nor HP consequences should be interpreted as real accident predictions.

The airborne and ground roll preserve inherited forward velocity, gradually dissipate it through friction, and use visible driver rotation / limb motion. Impact damage approximates the general growth of translational energy with squared speed rather than medically predictive injury.

## Research checked before implementation

- Singhania, Kageyama & Karanam (2019), [Study on Low-Speed Stability of a Motorcycle](https://www.mdpi.com/2076-3417/9/11/2278): measured steering and torque inputs against roll, yaw and their rates on motorcycles below 10 km/h. Rider control is especially important at these speeds.
- Yokomori et al. (2000), [Rider control behavior to maintain stable upright position at low speed](https://www.sciencedirect.com/science/article/abs/pii/S0389430499000788): examines body lean, frame bank, handlebar steer, the time lag of rider inputs, and the motorcycle's consequent lateral/yaw motion.
- Singhania et al. (2020), [Steering control to balance a motorcycle at low speeds based on riders' input](https://doi.org/10.1177/0954407020906628): sensor data connects steering/torque inputs to measured roll/yaw and a multibody controller.
- Niederer (1990), [Some Aspects of Motorcycle-Vehicle Collision Reconstruction](https://saemobilus.sae.org/papers/aspects-motorcycle-vehicle-collision-reconstruction-900750): rider and bike commonly take different post-impact trajectories, making a shared single rigid body unsuitable for separation.
- Nguyen et al. (2022), [Using PC-Crash to Analyze Motorcycle Slide to Stop Dynamics](https://saemobilus.sae.org/papers/using-pc-crash-analyze-motorcycle-slide-stop-dynamics-2022-01-0822): motorcycle post-contact trajectory depends on mass, yaw, friction and initial sliding speed. The game retains simplified planar tire-force response instead of a validated slide-to-stop reconstruction.
- [Motorcyclist post-impact trajectory analysis](https://trid.trb.org/View/1482296): rider and motorcycle rapidly decouple during collisions, and distinct travel paths depend on geometry, speeds and impact configuration.
- The existing [motorcycle handling documentation in README](../README.md#motorbike-deliveries--lean) covers the assisted single-track tyre model and top-down roll art.

These findings support treating a rider leaving a bike as a disturbance to yaw/lean/steering and tuning its visual effect by speed. They **do not establish a universal response to jumping left or right**; the opposite-side direction is a deliberate gameplay convention satisfying the requested interaction.

## Reproducing and validating

In **F2 → Test Lab**, select **Moving cab / jump out** or **Moving motorbike / hop off**, press Run, then `E` (or the mobile action). Repeat with `A + E` and compare the left-side response. In the lab, `__taxi.state()` exposes `exitPending`, `tumble`, `driverHealth`, `onFoot`, and `velocity`.

Run `npm test && npm run build`. The new `src/vehicle-exit.test.ts` checks door timing, speed-dependent landing damage, collision-compatible momentum and tumble control locks, both exit sides, motorcycle mass exchange and inverse swerves, invincibility, and stationary dismounts. `src/lab.test.ts` checks deterministic initial conditions of both fixtures. `src/recovery.test.ts` now expects the former 6 m/s ordinary-exit restriction to be removed.

Additional visual QA: confirm car door is visible at 0.10–0.20 s, screen-space character visibly rotates/rolls, ground impact decreases the HP bar once, runaway car coasts, high-speed bike swerves less than low-speed bike, stopped bikes do not twitch, HUD action remains available on mobile, and nearby walls/traffic don't allow ghost exits. F2 fixtures are reproducible for screenshots.
