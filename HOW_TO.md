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
| M | Mute or unmute sound effects |
| F2 | Open scenarios and the inspector |

On touch screens, drag the bottom-right joystick to steer, accelerate, or brake/reverse. It also moves you while on foot. Hold **BOOST** or **DRIFT** near the bottom centre with your left thumb. Vehicle actions appear when available; tilt the joystick left or right before tapping **Jump** to choose a side when leaving a moving vehicle. The top bar and taxi menu have been removed. Pause and Test Lab currently require a keyboard; sound settings remain on the welcome/pause screens. There is no in-game fullscreen button.

## Your shift

Slow down inside a **yellow ring** to collect a passenger or parcel. Deliver to the **green ring** for base pay plus possible time and comfort tips. A late delivery can still be completed; the timer affects the bonus, not whether you get paid. Drifts and near-misses earn small skill bonuses, and nitro recharges automatically.

You start in Old Town near Pit Stop. Buy engine, grip, armor, and boost upgrades there, and repair damaged vehicles. Wallet, upgrades, and completed-job progress persist between runs. The pause menu's **Shift stats** shows earnings, completed jobs, smashed objects, and pedestrian fatalities.

### Open Shore, texts and your notebook

The campaign lasts **fourteen full days**, beginning at 07:00 and including the
fourteenth night. Time advances while driving. Park at Pit Stop and use
**Pause → Sleep at Pit Stop** to skip to the next 07:00. The menu previews known
bookings closing during sleep; passengers, pursuits and fires block sleeping.
Recovery, reload and run reset preserve the date.

Normal dispatch mixes ordinary jobs with recurring customers. **Texts** lets
you choose a booking with an exact pickup-before deadline; competing bookings
commit only when you stop at the deliberately selected pickup. Pause →
**Ask dispatch for an ordinary fare** skips a suggested story booking. Dialogue
continues during travel and at arrival. Free driving continues after the campaign.

The **Pause → Dispatch notebook** keeps signed receipts, ride conversations
and documents. The navigation card's notebook button also opens it while vacant,
on foot or routed to the newsroom. The camera button bookmarks café frontage
when you are stopped nearby and the observation is available.
The café changes on the calendar whether or not you visit it. Search your own
records to revisit the details.

Route to the newsroom at **Old Town South**, stop nearby and leave selected
copies from the notebook. Source checks take **three game hours** and need
independent material. Return to ask Ruth to run a ready story in the next
**06:00 edition**. Publication and later public responses are separate; originals
remain in the notebook. The last edition is **Day 14 at 06:00**. See the
[campaign guide](docs/open-shore.md) for the calendar and editor workflow.

## Explore the city

Use the radar and navigation markers to find jobs and destinations. Routes follow roads, and fare distance and timing account for the road network.

The **top-left navigation card** combines your current job and local minimap.
**ENGAGED** means pickup guidance is selected; **ON BOARD** shows the destination,
base fare, fast-tip countdown and comfort. Speed and boost reserve sit below the
map. Clock, cash, personal health and police stars stay separate at the top right.

After an ordinary delivery, **VACANT** shows dispatch, booking and newsroom
shortcuts. Tap **ENGAGED** before pickup to hide fare guidance and browse these
shortcuts; tap the dispatcher portrait or **VACANT** to route the next fare.
Bookings opens your texts; the newspaper routes to the newsroom. Hiding guidance
does not cancel a booking or prevent a physical pickup. The map chevron collapses
only the map, leaving the job and driving readouts visible.

- **Eastern bridges and highlands:** take the northern crossing to Pine Woods or the southern crossing to Eagle Highlands. Curved roads connect Pine Junction, Fern Hollow, Highland Lodge, and Eagle Lookout. F2 → **Eastern bridges / highlands** starts at Pine Bridge with a delivery to Eagle Lookout. See [screenshots and map notes](docs/eastern-highlands.md).
- **Woodland villas and Fairway Country Club:** explore the southern loop through Millionaires Row, Woodland Estates, and Cedar Woods, with private villa drives and a golf club. F2 → **Woodland villas / golf club** starts in Woodland Estates with a passenger for Fairway Club. See the [map overview](docs/woodland-estates.md).
- **Sunset Beach and Ocean Walk:** head to the southern waterfront for soft sand, breakable beach furniture, and a promenade between the beach and hotels. Road tyres lose traction in sand; the beach patrol pickup has off-road tyres. F2 → **Sunset Beach / soft sand**, **Beach / off-road pickup**, or **Ocean Walk / hotel promenade**. See the [beach guide](docs/beach.md).
- **Northstar Harbour:** press **H** or tap **Harbour · $75** to navigate to security. Pay while in a car and out of police sight to enter and exchange your vehicle for a healthy one, clearing police heat. Wallet, upgrades, and any current fare carry over. F2 → **Northstar Harbour / car exchange**. See the [harbour guide](docs/harbour.md).
- **Commercial traffic:** delivery vans, flatbeds, freight trucks, and fuel trucks share the roads as NPCs. F2 → **Vans / freight traffic** or **Flammable cargo / impact**. See the [vehicle guide](docs/vehicles.md).

## Settings and sound

Pulp gore and difficulty can be changed from the welcome or pause screen. Sound effects start after your first click, tap, or key press. Adjust effect volume, mute, and separate siren volume from the welcome/pause screen or Test Lab. Audio preferences are saved independently from progress. There is no music or voice audio.

The world clock begins at **07:00** and advances while you play; pause, garage, and game-over states stop it. Lighting transitions through morning, afternoon, evening, and night. The time of day does not change fare or fire timers.

## Test Lab

Press **F2** to try scenarios, inspect debug views, adjust traffic, or change gameplay settings. Fixtures cover deliveries, vehicles, collisions, recovery, police, fires, coastal hazards, and locations listed above. The lab uses an isolated game without changing normal progress. **Erase saved progress** is a separate action from resetting a test run.

Progress and gameplay settings are stored in browser storage when available. If storage is blocked, the game remains playable, but progress may not persist.
