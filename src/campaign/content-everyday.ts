import type { CharacterId } from '../narrative/characters';
import type { EverydayJob, EverydayJourney, ProceduralStopover } from './model';

/** These are repeatable daily situations, never milestones advanced by fare count. */
const regular = (character: CharacterId, name: string, family: string, journeys: readonly EverydayJourney[], parcelJourneys: readonly EverydayJourney[]): EverydayJob => ({
  character, name, family, journeys, parcelJourneys,
  lines: journeys.map(journey => journey.line), during: journeys[0].during,
});

export const everydayJobs: readonly EverydayJob[] = [
  regular('sam', 'Sam', 'Staff transport', [
    {
      id: 'sam-home', pickup: 'moonlight-hotel', dropoff: 'east-village',
      line: 'East Village, please. I\'ve finished at the hotel. If I keep this shirt on, somebody will ask me to carry something.',
      during: 'I counted the towels twice. They still came to different numbers. The next shift can have a go.',
      arrival: 'Thanks. I needed a few minutes where nobody wanted anything.',
      roughArrival: 'Give me a moment before I stand up. Then I\'m going straight home.',
    },
    {
      id: 'sam-work', pickup: 'east-village', dropoff: 'moonlight-hotel',
      line: 'Moonlight Hotel. I\'ve got my keys, lunch and badge. That usually takes me two trips.',
      during: 'The badge opens the staff door. The keys open my flat. I\'ve tried them the other way round more than once.',
      arrival: 'Here is fine. I can get to the staff door from here. Thanks.',
      roughArrival: 'I\'ll check whether my lunch survived when I get inside.',
    },
    {
      id: 'sam-food', pickup: 'moonlight-hotel', dropoff: 'dockside-deli',
      line: 'Dockside Deli, please. I\'ve been carrying plates past people for hours and I still need something to eat.',
      during: 'I know there\'s food at the hotel. I\'d like to sit somewhere that nobody can hand me a tray.',
      arrival: 'Right. Food, a chair, and my phone on silent. Cheers.',
      roughArrival: 'I think I\'ll sit down a while before ordering. Thanks for getting me here.',
    },
  ], [
    {
      id: 'sam-notebook', pickup: 'moonlight-hotel', dropoff: 'east-village',
      line: 'My notebook is at hotel reception. Could you take it to East Village? I wrote my shopping list on the back of the stock count.',
      during: 'It\'s the small red book with the elastic round it. Reception has put it in an envelope.',
      arrival: 'That\'s it. Now I can buy dinner without ordering forty hand towels. Thank you.',
    },
    {
      id: 'sam-shirt', pickup: 'east-village', dropoff: 'moonlight-hotel',
      line: 'Clean work shirt for Moonlight Hotel reception. It\'s in a blue bag; the laundry label has my name on it.',
      during: 'Please leave the bag with reception. I can collect it before I start.',
      arrival: 'Reception has it. Thanks; that saves me going home for it.',
    },
  ]),
  regular('june', 'June', 'Small deliveries', [
    {
      id: 'june-market', pickup: 'dockside-deli', dropoff: 'market-quarter',
      line: 'Market Quarter, please. I brought the empty bags this time. I keep buying bags to carry the other bags home.',
      during: 'I\'ve got a list. Whether I stick to it depends on what the fruit stall is doing.',
      arrival: 'Thanks. That has left me enough time to have a proper look round.',
      roughArrival: 'At least the bags were empty on this trip.',
    },
    {
      id: 'june-groceries', pickup: 'market-quarter', dropoff: 'east-village',
      line: 'East Village, please. These are groceries for Dad. The tomatoes coming back are also from Dad.',
      during: 'He asked for onions, so I bought onions. He will still ask whether I found the right onions.',
      arrival: 'I\'ll take the bags from here. If he offers you tomatoes, say how many you can actually use.',
      roughArrival: 'Let me check the eggs before I carry that bag. We may be having omelettes.',
      stopover: {
        stop: 'dockside-deli', title: 'Bread collection',
        request: 'Dad’s bread is waiting at Dockside Deli. We can stop for a few minutes or go straight to his flat; I’ll cover the extra fare.',
        seconds: 4, completedText: 'That is the bread. I said two loaves, and he has packed three. East Village next.',
        labels: { route: 'Collect bread', begin: 'Pick up bread', active: 'Collecting bread', paused: 'Collection paused' },
        effects: [],
      },
    },
    {
      id: 'june-flowers', pickup: 'flower-market', dropoff: 'east-village',
      line: 'East Village. I\'m holding the flowers; the vase can stay on the floor if that\'s all right.',
      during: 'They\'re for my own kitchen. I got tired of only buying flowers for other people.',
      arrival: 'All here. I\'ll put them in water as soon as I get in. Thank you.',
      roughArrival: 'I\'ll put the bent ones in a shorter vase. There are still some good stems.',
    },
  ], [
    {
      id: 'june-shopping-bag', pickup: 'market-quarter', dropoff: 'east-village',
      line: 'Two shopping bags for my dad in East Village. The onions are underneath the bread.',
      during: 'He\'s expecting you. Please give him both bags; he sometimes takes one and starts telling you a story.',
      arrival: 'He called to say they arrived. He also wants to know whether you grow tomatoes.',
    },
    {
      id: 'june-laundry', pickup: 'east-village', dropoff: 'market-quarter',
      line: 'A blue laundry bag from East Village to Market Quarter. My collection slip is tied to the handle.',
      during: 'There\'s a loose button in the small pocket. The cleaner knows it\'s there.',
      arrival: 'They have the bag and the button. Thanks for doing that.',
    },
  ]),
  regular('ravi', 'Ravi', 'Personal journeys', [
    {
      id: 'ravi-arcade', pickup: 'east-village', dropoff: 'the-arcade',
      line: 'The Arcade, please. I have a little time to myself and a pocket full of change.',
      during: 'I\'m going to stop when those coins run out. If you see me looking for a cash machine, remind me I said that.',
      arrival: 'Here we are. I\'ll keep enough for the trip home. Thanks.',
      roughArrival: 'I might wait a minute before trying the driving game.',
    },
    {
      id: 'ravi-food', pickup: 'the-arcade', dropoff: 'market-quarter',
      line: 'Market Quarter, please. I forgot to eat before I went in.',
      during: 'I always order the same noodles. I spend ages reading the menu and then order the same noodles.',
      arrival: 'Thanks. There\'s still a table by the window. I\'ll try to make a decision before I sit down.',
      roughArrival: 'Something plain to eat, I think. That was quite a ride.',
    },
    {
      id: 'ravi-home', pickup: 'market-quarter', dropoff: 'east-village',
      line: 'East Village. I bought more than I meant to, and one of these handles is giving up.',
      during: 'The heavy bag is books. The light one is the thing I actually went out to buy.',
      arrival: 'Let me get that bag from underneath. Got it. Thank you.',
      roughArrival: 'The bag has finally split. Give me a moment to get the books off the floor.',
    },
  ], [
    {
      id: 'ravi-lunch', pickup: 'market-quarter', dropoff: 'the-arcade',
      line: 'A takeaway order from Market Quarter to The Arcade, under Ravi. I forgot lunch again.',
      during: 'The drinks are in a separate carrier. I\'ve made room on the counter.',
      arrival: 'It\'s arrived. I\'m going to eat it while it\'s still hot. Thanks.',
    },
    {
      id: 'ravi-books', pickup: 'market-quarter', dropoff: 'east-village',
      line: 'A box of books from Market Quarter to East Village. It\'s heavier than it looks; sorry.',
      during: 'The box has my name on both sides. Please leave it flat so the bottom stays shut.',
      arrival: 'Books received. Now I need to make some space for them. Thank you.',
    },
  ]),
  regular('cleo', 'Cleo', 'Vehicle assistance', [
    {
      id: 'cleo-workshop', pickup: 'market-quarter', dropoff: 'the-docks',
      line: 'The Docks, please. I need the workshop to look at this starter motor. It\'s wrapped up; it won\'t mark the seat.',
      during: 'I could have bought another one. I\'d like to find out what failed before I do.',
      arrival: 'I can carry it from here. Thanks for making room.',
      roughArrival: 'Let me check the wrapping. There\'s a heavy lump of metal in there.',
    },
    {
      id: 'cleo-home', pickup: 'the-docks', dropoff: 'east-village',
      line: 'East Village, please. I\'ve left the tools at the workshop. Nothing oily coming in with me this time.',
      during: 'You\'ve got a little rattle near the dash. Could just be a coin. Start with the cheap explanation.',
      arrival: 'Thanks. Have a look in that tray before you pay somebody to take the dash apart.',
      roughArrival: 'There may be a few more rattles to check now.',
    },
    {
      id: 'cleo-supplies', pickup: 'east-village', dropoff: 'market-quarter',
      line: 'Market Quarter. I need gloves, soap and something I can eat without touching it.',
      during: 'There\'s always one patch of grease you only find after you\'ve put a clean shirt on.',
      arrival: 'Cheers. I can get everything on this street.',
      roughArrival: 'I\'ll stretch my legs before I start shopping.',
    },
  ], [
    {
      id: 'cleo-parts', pickup: 'market-quarter', dropoff: 'the-docks',
      line: 'A sealed parts box from Market Quarter to the workshop at The Docks. The invoice is inside the lid.',
      during: 'Please keep it upright. There\'s packing round the part, but I would rather leave it where I put it.',
      arrival: 'The workshop has the box. They can get on with it now. Thanks.',
    },
    {
      id: 'cleo-gloves', pickup: 'market-quarter', dropoff: 'east-village',
      line: 'Gloves and cleaning supplies for East Village. The shop has put the bottles in a separate bag.',
      during: 'Nothing fragile, but please keep the bottles standing. I don\'t need to wash the gloves before using them.',
      arrival: 'Everything is here. Thank you; that saved me another trip out.',
    },
  ]),
  regular('oscar', 'Oscar', 'Event logistics', [
    {
      id: 'oscar-flowers', pickup: 'flower-market', dropoff: 'market-quarter',
      line: 'Market Quarter, please. Flowers for the hall. I\'ve left the tall ones at the shop; they wouldn\'t fit through the door.',
      during: 'I should have measured the tables before ordering these. We\'ll find somewhere for them.',
      arrival: 'I\'ll take them round to the hall. Thanks for keeping the stems out of the door.',
      roughArrival: 'A few stems have bent. We\'ll put those at the back of the arrangement.',
    },
    {
      id: 'oscar-printing', pickup: 'market-quarter', dropoff: 'the-arcade',
      line: 'The Arcade, please. I need to collect some printing and check that they used the corrected date.',
      during: 'I wrote the date out in words this time. There should be less room for interpretation.',
      arrival: 'Thanks. I\'ll read one before I carry the whole box out.',
      roughArrival: 'I\'m glad I haven\'t collected the box yet.',
    },
    {
      id: 'oscar-room', pickup: 'the-arcade', dropoff: 'moonlight-hotel',
      line: 'Moonlight Hotel. I want to look at a room before I book it. I\'ve brought a tape measure.',
      during: 'They said it seats forty. I need to know whether that includes anybody being able to get up again.',
      arrival: 'Here is fine. If I come back with numbers written on my hand, remind me to copy them down.',
      roughArrival: 'I\'ll stand still in the lobby for a moment before measuring anything.',
    },
  ], [
    {
      id: 'oscar-posters', pickup: 'the-arcade', dropoff: 'market-quarter',
      line: 'A flat packet of posters from The Arcade to Market Quarter. Please keep them flat; I\'ve only just stopped them curling.',
      during: 'The address is written on the brown wrapper. The packet can go straight inside the hall.',
      arrival: 'Posters received. I checked the date before opening the packet. Thank you.',
    },
    {
      id: 'oscar-ribbon', pickup: 'flower-market', dropoff: 'market-quarter',
      line: 'Ribbon and flower wire from Flower Market to Market Quarter. Small parcel, large improvement to my preparations.',
      during: 'There are two bags under the same order. The shop has tied them together.',
      arrival: 'Both bags are here. I can finish the arrangements now. Thanks.',
    },
  ]),
];

/** Occasional requests chosen only for routes passing plausibly close to the stop. */
export const proceduralStopovers: readonly ProceduralStopover[] = [
  {
    id: 'quick-parcel', stop: 'market-quarter', title: 'Market Quarter collection',
    request: 'The passenger has a small parcel waiting at Market Quarter. A short collection stop is optional; the extra drive and wait are paid.',
    seconds: 5, completedText: 'Parcel collected. Thanks for stopping; we can head to the original destination.',
    labels: { route: 'Collect parcel', begin: 'Collect parcel', active: 'Collecting parcel', paused: 'Collection paused' },
    effects: [],
  },
  {
    id: 'takeaway', stop: 'dockside-deli', title: 'Dockside Deli takeaway',
    request: 'The passenger has food ready at Dockside Deli. Stop to collect it if convenient, or continue directly to the destination.',
    seconds: 4, completedText: 'Food collected. It is still warm. Let’s get going.',
    labels: { route: 'Collect takeaway', begin: 'Collect takeaway', active: 'Collecting takeaway', paused: 'Collection paused' },
    effects: [],
  },
  {
    id: 'spare-keys', stop: 'east-village', title: 'East Village key collection',
    request: 'The passenger can collect spare keys in East Village on the way. The detour is optional and paid.',
    seconds: 3, completedText: 'Got the keys. Thanks for waiting. On to the original address.',
    labels: { route: 'Collect keys', begin: 'Collect keys', active: 'Collecting keys', paused: 'Collection paused' },
    effects: [],
  },
];
