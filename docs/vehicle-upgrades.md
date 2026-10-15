# Vehicle upgrades

Garage work belongs to the physical vehicle that received it. Engine, tyres,
chassis reinforcement and boost tank levels are independent for every car and
motorcycle, including vehicles of the same model. The wallet remains shared.

- Taking another vehicle starts with that vehicle's own levels and prices.
- Leaving a tuned vehicle behind does not strip it. Return to the same surviving
  vehicle to use its upgrades again; its armour still protects it while abandoned.
- Garage repairs, recovery of a repairable motorcycle and impound release preserve
  the surviving chassis's upgrades.
- Explosion or sinking destroys its upgrades. Recovering a totaled chassis does
  not recover the destroyed parts.
- Harbour exchanges supply a stock car. The exchanged vehicle and its upgrades
  are currently unavailable afterward.

The save keeps the current vehicle and surviving invested vehicles, including
their model, colour, location, damage and burning fuse. Authored spawn identities
prevent a second copy appearing in the original parking spot after reload.
Existing career-wide upgrades migrate once onto the starting taxi; cash,
deliveries and campaign progress remain intact. The Lab's explicit scene reset
retains the selected vehicle's model and upgrades for repeatable experiments.

On mobile, a Garage action appears above the vehicle entry/exit button when a
vehicle is near Pit Stop and not wanted. Slow to 3 m/s or less to enable it; the
button opens the same garage as the desktop G shortcut. It is hidden on foot,
during an exit, in menus, and for sinking or wrecked vehicles.

## Future improvement: recover exchanged harbour vehicles

A vehicle handed over at the harbour should eventually be recoverable, with its
own installed upgrades still attached. The exchange should retain the original
chassis in harbour custody instead of permanently discarding it. Recovering it
must return that original vehicle; it must never copy its upgrades onto the
replacement or any other car.

This is deliberately deferred. A follow-up should decide the recovery interaction,
location, cost or other requirements, and whether a retrieved vehicle replaces
the current one or is collected from a separate bay. It will need persistent
custody records, clear player messaging, and tests for repeated exchanges,
reloads and prevention of vehicle or upgrade duplication.

## Verification

1. Visit Pit Stop and buy an engine upgrade. Note the current vehicle and its next
   upgrade price.
2. Leave it, take a stock car of the same model, and revisit Pit Stop. It should
   show level 0 and the initial price. Buy a different upgrade if desired.
3. Return to the first car. Its engine upgrade and next price should be intact;
   upgrades bought for the second car should remain on the second car.
4. Repair the first car, then save and reload. Its upgrades and condition should
   remain intact, and the second invested car should still exist separately.
5. Total an invested car or drive it into water. After recovery and reload, its
   upgrades should not reappear on a replacement.
6. Exchange an invested car at the harbour. The replacement should be stock and
   all police warnings should still clear. Original-vehicle recovery is deferred
   as described above.

Automated coverage lives in `src/vehicle-upgrades.test.ts` and the existing garage,
harbour, recovery, motorcycle, beach, storage and Lab tests.
