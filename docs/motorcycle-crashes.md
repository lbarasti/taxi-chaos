# Motorbike collisions, rider knock-off and terminal engine damage

## Player-visible behavior

A motorcycle is no longer an indefinitely upright, one-piece body. A significant collision with another vehicle, guardrail or solid roadside obstacle can unseat its rider. Both NPC motorcyclists and the playable courier bike use the same collision trigger.

- Closing speed of **6 m/s or more at the actual contact** knocks off a rider. Lower-speed bumps remain ordinary chassis/tyre damage and do not cause an automatic fall. A riderless bike can also be knocked over.
- The rider separates from the bike at a nearby clear spot. The player inherits the incoming velocity and an outward impulse, tumbles in the existing on-foot animation and takes a **single** landing HP hit after 0.17 seconds. Invincibility still prevents HP loss. NPC motorcyclists become individual pedestrian actors with their own outward velocity, rotational tumble, sliding ground contact and recovery to standing.
- The struck bike loses rider mass (260 to 185 kg), follows the contact impulse's heading and yaw, tips in the impact direction and slides. Tyres stop powering or self-balancing the fallen bike; its wheels and frame show the lean and skids. Rider and bike can take different paths.
- A **healthy** bike resting on its side must be *lifted* with E / contextual mobile action before E can mount it. Stopping to lift it does not magically repair any damage.
- A bike with **25 HP or less**, **75+ engine critical damage**, or a burning/wreck state cannot start or be mounted. An already occupied bike loses engine drive upon crossing the threshold. Players can dismount and find another vehicle, or tow their own stranded motorcycle to repair it (R / roadside tow) when nearby. Bike condition and available actions are explained in HUD text.

The original car damage and driving behavior is unchanged. Existing motorcycle voluntary jumps, parcels, collisions with the environment, sound cues, player recovery and invincible mode remain in use.

## Simplified physical model

The pre-impact 2-D rigid-body solver resolves car/bike or bike/obstacle penetration and impulses at the contact point. Its output velocity and angular velocity carry into the laid-down state. Rider motion uses the **pre-impact bike velocity** to avoid unrealistically freezing the rider together with the bike on a hard hit, plus a bounded outward velocity (3–11 m/s) based on closing speed. The lighter bike receives a small opposite lateral impulse.

Once the rider is no longer balancing the vehicle, a motorcycle's roll is no longer driven toward `atan(a_lateral/g)`. Gravity-like rollover acceleration and roll angular velocity carry it to the street: the visible roll limit is 0.47π radians (~85°). The first frame-to-pavement contact has a small damped rebound. The body slides with approximately `μ = 0.53–0.77` kinetic friction, varying with the roll; momentum decreases at `μg` (no velocity reversal). Yaw momentum decays with an exponential angular damping coefficient of 3.2/s. The engine and single-track traction are disabled while fallen.

**Scope:** these are stable, arcade-tuned planar physics. The game does not simulate a 3-D steering head, suspension, articulated rider limbs, precise tyre carcass deformation or real crash survivability. The threshold, ejection kick and friction are gameplay constants, not accident-reconstruction predictions. The intact low-speed corner-lean controller remains unchanged.

## Reproduce in F2 Test Lab

- **Motorbike / collision ejection:** a cab at 18 m/s approaches an NPC motorbike at 5 m/s. Run/step until contact, then observe the NPC rider spinning and sliding separately while the empty bike falls sideways, leaves a scuff mark and settles.
- **Motorbike / rider knocked off:** a player riding east at 12 m/s collides with a car heading west at 12 m/s. Observe the player tumble, the distinct fallen bike and once-only landing HP loss.
- **Moving motorbike / hop off:** the prior voluntary exit fixture is still available; low-speed intentional jumps need not cause a crash.

Unit/integration coverage is in `src/motorcycle-crash.test.ts`: both fall sides, friction, rest without reversing, contact-trigger and soft-contact suppression, NPC and player ejections, single landing injury, prop impacts, righting/re-entry, HP/engine thresholds and roadside repair. The catalogue and initial positions are checked in `src/lab.test.ts`. Run `npm test && npm run build`.

Manual QA priorities: verify top-down silhouettes while the bike lies on its side, NPC rider separation, road scrape effect and contact audio, mobile Lift action, damaged-bike refusal, and test-lab collision playback at different frame cadences. Screenshot/browser QA is still needed when an interactive browser is available.
