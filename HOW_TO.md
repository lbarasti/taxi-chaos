# How to play Taxi Chaos

Taxi Chaos runs in a browser or as the standalone `dist/index.html`. It works offline after the game has been built or loaded. Use a keyboard on desktop, or the on-screen controls on phones and tablets.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Drive; on foot, move in screen directions |
| Space | Handbrake/drift in a car; rear brake on a motorbike |
| Shift + accelerate | Rechargeable nitro boost |
| E / mobile action | Exit or mount a nearby vehicle; pay at harbour security |
| A or D while pressing E | Choose which side to exit a moving vehicle |
| R | Optional tow and repair when near a wreck |
| H / Harbour button | Set or cancel a route to harbour security |
| G / Garage button | Set or cancel a garage route; enter when stopped nearby |
| P / Escape | Pause or resume |
| M / speaker button | Mute or unmute sound effects |
| F2 / Test Lab button | Open scenarios and the inspector |

On touch screens, drag the bottom-right joystick to steer, accelerate, or brake/reverse. It also moves you while on foot. Hold **BOOST** or **DRIFT** near the bottom centre with your left thumb. Vehicle actions appear when available; tilt the joystick left or right before tapping **Jump** to choose a side when leaving a moving vehicle. The taxi icon opens the game menu and Test Lab. The top-right button toggles fullscreen where supported.

## Your shift

Slow down inside a **yellow ring** to collect a passenger or parcel. Deliver to the **green ring** for base pay plus possible time and comfort tips. A late delivery can still be completed; the timer affects the bonus, not whether you get paid. Drifts and near-misses earn small skill bonuses, and nitro recharges automatically.

You start in Old Town near Pit Stop. Buy engine, grip, armor, and boost upgrades there, and repair damaged vehicles. Wallet, upgrades, and completed-job progress persist between runs. The pause menu's **Shift stats** shows earnings, completed jobs, smashed objects, and pedestrian fatalities.

### Open Shore, texts and your notebook

The campaign lasts **fourteen shifts**, ending on polling day. You choose when
to advance it with **Pause → End shift**. Finish or abandon an aboard ride first.
Hospital recovery, reloading and test-run resets preserve the campaign date.
Bookings in **Texts** include their last available shift; routing is reversible,
and competing bookings commit only at pickup. Ordinary driving can continue
through the whole campaign and after its ending.

The **Taxi menu → Dispatch notebook** keeps signed receipts, authored ride dialogue
and documents. Search it whenever you want to revisit something. Stop near
Garden Café from shift 3 and use **Bookmark café frontage** to keep an observation.
You can route to the newsroom at **Old Town South**, stop nearby, and leave
selected material from the notebook. Copies remain readable afterward. Review
needs independent material and another shift; leaving one receipt does not
guarantee a story. Shift 13 is the final submission date for election-day coverage.

### Cars, fire, and recovery

Impacts can damage the engine, fuel system, and tyres, changing how a car drives. Severe damage may start a visible fire countdown, followed by an explosion that leaves a solid wreck. Pit Stop repairs extinguish fires and restore components. Smaller objects and some buildings can also break or collapse; fuel pumps and the Last Chance Fuel station can ignite and trigger chain blasts.

If your cab catches fire, press **E** to bail out, then run clear. The fuse keeps counting down after you leave. Follow the blue route or radar markers to a parked replacement and press **E** beside it. Wallet, upgrades, and heat carry over; an aboard passenger evacuates and dispatch sends a new fare. Burning cars and wrecks cannot be entered. Exiting a moving car inherits its momentum, so a fast jump can cause a hard landing.

If you are caught in an occupied vehicle explosion or fatally injured on foot, **WASTED** ends the run. Respawn returns you on foot outside Midtown Hospital and deducts a medical bill; a destroyed ride also incurs repair costs. The wreck stays at the crash site. An abandoned wreck can be towed and repaired with **R** while you are nearby.

### Motorbike parcel deliveries

Leave the cab with **E** and mount a parked bike with **E**. Bikes are parked around town, including one beside Pit Stop. Dispatch switches to parcel deliveries while you ride a bike: stop in the yellow ring to load the parcel, then stop in the green ring to deliver it. Dismounting with cargo cancels the delivery without payment; taking a car restores passenger fares. Wallet, upgrades, boost, heat, and shift totals carry across vehicles.

Motorbikes have their own handling and lean into turns. **Space** uses the rear brake, and **Shift** boosts. Jumping off at speed can send both rider and bike tumbling; below walking speed, you simply dismount.

### Heat, police, and difficulty

Property damage, pedestrian impacts, and sustained speeding build police heat. Police may pursue, intercept, block junctions, or search after losing sight of you. Break line of sight to escape; if you are contained and moving slowly, you can be arrested. Arrest costs are deducted from your wallet, up to its available balance.

Choose **Cruise**, **Street**, or **Chaos** difficulty from the welcome or pause screen. The difficulty changes police pressure and pursuit timing. **Pulp gore** is off by default and can also be changed there. With gore disabled, pedestrian impacts are nonfatal; with it enabled, some severe impacts can be fatal.

## Explore the city

Use the radar and navigation markers to find jobs and destinations. Routes follow roads, and fare distance and timing account for the road network.

- **Eastern bridges and highlands:** take the northern crossing to Pine Woods or the southern crossing to Eagle Highlands. Curved roads connect Pine Junction, Fern Hollow, Highland Lodge, and Eagle Lookout. F2 → **Eastern bridges / highlands** starts at Pine Bridge with a delivery to Eagle Lookout. See [screenshots and map notes](docs/eastern-highlands.md).
- **Woodland villas and Fairway Country Club:** explore the southern loop through Millionaires Row, Woodland Estates, and Cedar Woods, with private villa drives and a golf club. F2 → **Woodland villas / golf club** starts in Woodland Estates with a passenger for Fairway Club. See the [map overview](docs/woodland-estates.md).
- **Sunset Beach and Ocean Walk:** head to the southern waterfront for soft sand, breakable beach furniture, and a promenade between the beach and hotels. Road tyres lose traction in sand; the beach patrol pickup has off-road tyres. F2 → **Sunset Beach / soft sand**, **Beach / off-road pickup**, or **Ocean Walk / hotel promenade**. See the [beach guide](docs/beach.md).
- **Northstar Harbour:** press **H** or tap **Harbour · $75** to navigate to security. Pay while in a car and out of police sight to enter and exchange your vehicle for a healthy one, clearing police heat. Wallet, upgrades, and any current fare carry over. F2 → **Northstar Harbour / car exchange**. See the [harbour guide](docs/harbour.md).
- **Commercial traffic:** delivery vans, flatbeds, freight trucks, and fuel trucks share the roads as NPCs. F2 → **Vans / freight traffic** or **Flammable cargo / impact**. See the [vehicle guide](docs/vehicles.md).

## Settings and sound

Pulp gore and difficulty can be changed from the welcome or pause screen. Sound effects start after your first click, tap, or key press. Adjust effect volume, mute, and separate siren volume from the welcome/pause screen or Test Lab. Audio preferences are saved independently from progress. There is no music or voice audio.

The world clock begins at **07:00** and advances while you play; pause, garage, and game-over states stop it. Lighting transitions through morning, afternoon, evening, and night. The time of day does not change fare or fire timers.

## Test Lab

Press **F2** or choose **Test Lab** from the game menu to try scenarios, inspect debug views, adjust traffic, or change gameplay settings. Fixtures cover deliveries, vehicles, collisions, recovery, police, fires, coastal hazards, and locations listed above. The lab can alter cash, upgrades, damage, and other test conditions; these changes may use the regular browser save. **Erase saved progress** is a separate action from resetting a test run.

Progress and gameplay settings are stored in browser storage when available. If storage is blocked, the game remains playable, but progress may not persist.
