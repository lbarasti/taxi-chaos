import { dayMinute } from '../campaign/clock';
import type { ConditionalText, EventHandler, SceneLayer, ScenePrimitive, WorldOperation } from '../campaign/model';
import type { Condition, Effect, Mission, MissionCatalogue, MissionDialogueBeat } from '../missions/schema';

/** A local reunion: its facts never supply Open Shore evidence or change its outcomes. */
export const LINEN_OPEN = dayMinute(4, 20);
export const LINEN_CLOSE = dayMinute(4, 23);
export const LINEN_COUNT = dayMinute(5, 9);

const world = (key: string, value: string | boolean): Condition => ({ worldEquals: { key: `linen-${key}`, value } });
const change = (key: string, value: string | boolean): Effect => ({ setWorld: { key: `linen-${key}`, value } });
const met = (name: string): Condition => ({ flag: `linen-met-${name}` });
const completed = (id: string): Condition => ({ missionCompleted: `linen-${id}` });
const introduced: Condition = { any: [completed('sam-clockoff'), completed('oscar-setup')] };
const encountered: Condition = { any: ['sam', 'oscar', 'mags', 'nell'].map(met) };

export const linenInitialWorld = {
  'linen-supplies': false,
  'linen-flowers': 'none',
  'linen-nell-gig': 'pending',
  'linen-guest': false,
  'linen-washed': false,
  'linen-returned': false,
  'linen-event': 'preparing',
  'linen-tables': 'undecided',
  'linen-stock': 'pending',
} as const;

type Spec = {
  id: string; character: string; title: string; pickup: string; dropoff: string;
  from: number; until: number; line: string; during: string; arrival: string;
  offer?: string; requires?: Condition; effects?: readonly Effect[]; retry?: 'always' | 'never';
};

const specs: readonly Spec[] = [
  {
    id: 'linen-sam-clockoff', character: 'sam', title: 'Ten quiet minutes',
    pickup: 'moonlight-hotel', dropoff: 'east-village', from: dayMinute(2), until: dayMinute(4, 19),
    line: 'East Village, please. I work the laundry at Moonlight. Mags has lent six of our tablecloths to Oscar for his reunion. My name is on the count. I only found out when the cupboard looked unusually tidy.',
    during: 'The reunion is at Market Quarter, day 4 at eight. Mags says everything will be back before our nine o’clock count the next morning. Oscar thinks washing is something that happens to other people.',
    arrival: 'Here is fine. Thanks. I needed ten minutes where nobody wanted me to cover a shift. If Mags needs a car for those bundles, I’ll give her your number.',
  },
  {
    id: 'linen-oscar-setup', character: 'oscar', title: 'Flowers for old friends',
    pickup: 'flower-market', dropoff: 'market-quarter', from: dayMinute(2), until: dayMinute(4, 19),
    line: 'Market Quarter hall, please. Flowers on my lap, stems away from the upholstery. We’re getting the old band together on day 4. Mostly to eat. I may have been optimistic about the music.',
    during: 'Mags offered some hotel linen. Nell hasn’t agreed to sing, so I’ve taken that off the poster. She has a paid set at Ocean Walk that night. Fair enough; I didn’t offer to pay her.',
    arrival: 'That’s the hall. I’ll put these in water. Doors at eight on day 4, if you’re passing. You can come for a sandwich without agreeing to join the band.',
    effects: [change('flowers', 'fresh')],
  },
  {
    id: 'linen-mags-loan', character: 'mags', title: 'Six borrowed tablecloths',
    pickup: 'moonlight-hotel', dropoff: 'market-quarter', from: dayMinute(2), until: dayMinute(4, 19),
    requires: introduced,
    offer: 'Mags here, Moonlight laundry. Six tablecloths and me to the hall at Market Quarter? I can lend this bundle. The hotel hasn’t approved it, so they need to come back clean before day 5’s 09:00 stock count.',
    line: 'Six. I’ve counted them twice. Oscar asked for ten, but he’s having six. The blue laundry tag stays on the bag; it’s how Sam knows these are ours. This is a favour, not a hotel donation.',
    during: 'Oscar used to play drums. Nell sang. They still like each other; she just doesn’t want every evening out to become a free performance. I understand that rather well.',
    arrival: 'Right, six tablecloths delivered. Oscar has the return time. Tell him the East Village wash room takes late loads if he gets ambitious with the red wine.',
  },
  {
    id: 'linen-nell-booking', character: 'nell', title: 'The booking that pays',
    pickup: 'the-arcade', dropoff: 'ocean-walk', from: dayMinute(4, 17), until: dayMinute(4, 19, 30),
    requires: introduced,
    offer: 'Nell. Oscar passed me your number. Lift from The Arcade to Ocean Walk for soundcheck? Pickup before 19:30 today. I’m playing a paid set there until 21:00, not the reunion. The instrument case fits across the back.',
    line: 'Ocean Walk, please. I’ve got a paid set first. Oscar took my name off his performance poster when I asked. I’d like to see everyone afterwards, but I’m going as a guest.',
    during: 'We used to carry that case on the bus. Oscar would insist on paying for a seat for it. Then he’d stand all the way home because we’d run out of money.',
    arrival: 'There’s the sound engineer. Thanks for getting me here. I finish at nine; I’ll text if I still feel like going to the reunion. No need to wait outside.',
  },
  {
    id: 'linen-nell-guest', character: 'nell', title: 'Going as a guest',
    pickup: 'ocean-walk', dropoff: 'market-quarter', from: dayMinute(4, 21), until: dayMinute(4, 22, 45),
    requires: { all: [completed('nell-booking'), world('nell-gig', 'reached')] },
    offer: 'Finished, and they paid me. Could you take me from Ocean Walk to the Market Quarter reunion? I’m going for food and company. The case is staying closed. Pickup before 22:45; Oscar shuts the hall at eleven.',
    line: 'Market Quarter, please. I’ve been promised a sandwich that hasn’t been under a stage light. If Oscar asks me for a song, I’m pointing him at the person who booked the hall.',
    during: 'He sent me a photograph of the new poster. Just our names and a date. It’s quite nice being invited as the person I am now.',
    arrival: 'There he is. Thanks. I’m leaving the case by the coats and finding something to eat.',
    effects: [change('guest', true)],
  },
  {
    id: 'linen-return', character: 'oscar', title: 'The morning after, slightly early',
    pickup: 'market-quarter', dropoff: 'moonlight-hotel', from: LINEN_CLOSE, until: LINEN_COUNT,
    retry: 'never',
    requires: world('supplies', true),
    offer: 'Oscar, outside Market Quarter hall. Six tablecloths, all accounted for, none quite clean. Need a lift to Moonlight before the day-5 09:00 count. We can stop at East Village’s wash room for 18 minutes, or take them straight back and let Sam book them into the wash. I’ll pay for the stop.',
    line: 'Six in the bag. Mags was very specific. The hotel is our destination; the optional wash stop is East Village. Eighteen minutes gets these clean. Going straight back means Sam has another load to do.',
    during: 'Someone asked whether we’d do this every month. I told them I’d get back to them after I’d returned everything I borrowed. That felt like personal growth.',
    arrival: 'Here’s Sam with the trolley. Six back, as promised. They need a wash. I’ll stay and help fold them; this was my evening out, not his.',
    effects: [change('returned', true)],
  },
  {
    id: 'linen-sam-aftermath', character: 'sam', title: 'After the stock count',
    pickup: 'moonlight-hotel', dropoff: 'east-village', from: LINEN_COUNT, until: dayMinute(8),
    requires: encountered,
    line: 'Sam, from Moonlight laundry. East Village again, please. The reunion’s finished and we’ve done the count. Mags is already telling Oscar that next time he can borrow her own tablecloths.',
    during: 'I don’t mind people having a good night. I mind finding out about it from an empty shelf when I’m supposed to be going home.',
    arrival: 'Thanks for the lift. I’m putting the phone on silent for a few hours. Someone else can find the spare key for once.',
  },
];

const missions: Record<string, Mission> = {};
const dialogue: Record<string, MissionDialogueBeat> = {};
export const linenJobWindows = Object.fromEntries(specs.map(s => [s.id, { from: s.from, until: s.until }]));
export const linenRides = Object.fromEntries(specs.map(s => [s.id, { during: s.during, arrival: s.arrival }]));
for (const s of specs) {
  dialogue[s.id] = { character: s.character, category: 'side-quest', channel: 'passenger', text: s.line };
  missions[s.id] = {
    title: s.title, chapter: 1, category: 'side-quest', repeat: 'once', passenger: s.character,
    abandon: { retry: s.retry ?? 'always' }, dispatchRadius: 160,
    ...(s.offer ? { offer: { character: s.character, text: s.offer } } : {}),
    contactLost: { effects: [{ setFlag: `linen-${s.character}-lost` }] },
    requires: { all: [{ minuteAtLeast: s.from }, { minuteBefore: s.until }, { not: { flag: `linen-${s.character}-lost` } }, ...(s.requires ? [s.requires] : [])] },
    allowed: { jobs: ['fare'] }, stops: { pickup: s.pickup, dropoff: s.dropoff }, beats: { pickup: s.id },
    effects: [...(s.effects ?? [])],
  };
}
export const linenCatalogue: MissionCatalogue = { schemaVersion: 1, dialogue, missions };

export const linenOperations: readonly WorldOperation[] = [
  { id: 'linen-reunion-opens', at: LINEN_OPEN, effects: [change('event', 'open')], outcomes: [
    { id: 'borrowed-tables', requires: world('supplies', true), effects: [change('tables', 'borrowed')] },
    { id: 'mismatched-tables', effects: [change('tables', 'mismatched')] },
  ] },
  { id: 'linen-reunion-closes', at: LINEN_CLOSE, effects: [change('event', 'finished')] },
  { id: 'linen-stock-count', at: LINEN_COUNT, effects: [], outcomes: [
    { id: 'clean-return', requires: { all: [world('returned', true), world('washed', true)] }, effects: [change('stock', 'clean')] },
    { id: 'needs-wash', requires: world('returned', true), effects: [change('stock', 'wash-needed')] },
    { id: 'missing-bundle', requires: world('supplies', true), effects: [change('stock', 'missing')] },
    { id: 'no-loan', effects: [change('stock', 'no-loan')] },
  ] },
];

export const linenHandlers: readonly EventHandler[] = [
  ...specs.map(s => ({ on: 'pickup' as const, id: s.id, effects: [{ setFlag: `linen-met-${s.character}` }] })),
  { on: 'ride-completed', id: 'linen-oscar-setup', requires: { not: { rideComfortAtLeast: 65 } }, effects: [change('flowers', 'bruised')] },
  { on: 'ride-completed', id: 'linen-mags-loan', requires: { minuteBefore: LINEN_OPEN }, effects: [change('supplies', true)] },
  { on: 'ride-completed', id: 'linen-nell-booking', requires: { minuteBefore: dayMinute(4, 21) }, effects: [change('nell-gig', 'reached')] },
  { on: 'ride-completed', id: 'linen-nell-booking', requires: { minuteAtLeast: dayMinute(4, 21) }, effects: [change('nell-gig', 'missed')] },
  { on: 'ride-completed', id: 'linen-return', requires: { all: [{ minuteAtLeast: LINEN_COUNT }, world('washed', true)] }, effects: [change('stock', 'late-clean')] },
  { on: 'ride-completed', id: 'linen-return', requires: { all: [{ minuteAtLeast: LINEN_COUNT }, { not: world('washed', true) }] }, effects: [change('stock', 'late-wash')] },
];

export const linenStopovers = {
  'linen-return': {
    stop: 'east-village', title: 'Wash the borrowed linen',
    request: 'Optional East Village wash stop · wait 18 minutes. Oscar pays for the extra route and wait. Or deliver straight to Moonlight; Sam will have a load to wash.',
    seconds: 18,
    completedText: 'Oscar has the clean bundle. Six tablecloths, blue laundry tag still attached. Back to Moonlight; the wash stop and waiting time are covered.',
    effects: [change('washed', true)],
  },
};

/** Evaluated at arrival, after the completed ride and its physical consequences. */
export const linenArrivalVariants: Readonly<Record<string, readonly ConditionalText[]>> = {
  'linen-oscar-setup': [
    { requires: { minuteAtLeast: LINEN_CLOSE }, text: 'The hall is already closed. I’ll take the flowers home; there’s no point leaving them outside. Thanks for the lift. I’d better find out where everyone went.' },
    { requires: world('flowers', 'bruised'), text: 'The flowers have taken a beating. I’ll use the shorter vase and trim the worst stems. Next time I’m buying something less fragile. Thanks for getting me here.' },
    { requires: { minuteAtLeast: LINEN_OPEN }, text: 'They’ve already opened. I’ll carry these in and find a vase. Thanks for the lift; the food is inside if you’re staying.' },
  ],
  'linen-mags-loan': [
    { requires: { minuteAtLeast: LINEN_OPEN }, text: 'We’ve missed setup. The hall used its own covers. I’ll take this unused bundle back myself, so Sam won’t have a loan to explain. Thanks for bringing me over anyway.' },
  ],
  'linen-nell-booking': [
    { requires: world('nell-gig', 'missed'), text: 'They’ve finished the set without me. I’ll go in and speak to the organiser. Please don’t wait; I need to sort this out before I decide where I’m going next.' },
  ],
  'linen-nell-guest': [
    { requires: { minuteAtLeast: LINEN_CLOSE }, text: 'Looks like they’re stacking the chairs. I’ll help Oscar lock up and walk with him to the deli. Thanks for the lift; at least I caught him before he went home.' },
  ],
  'linen-return': [
    { requires: { all: [{ minuteAtLeast: LINEN_COUNT }, world('washed', true)] }, text: 'They’ve already counted, but the bundle’s clean and all six are here. Sam can mark it returned late. I’ll take it in and explain; you did the wash stop I asked for.' },
    { requires: { minuteAtLeast: LINEN_COUNT }, text: 'The count’s already done. Six back late, and they still need a wash. I’ll find Sam and put my name on the extra load. Thanks for bringing us back.' },
    { requires: world('washed', true), text: 'Six clean tablecloths, blue tag intact. Sam can put them straight back on the shelf. Thanks for taking the extra stop. Mags might actually lend me something again.' },
  ],
  'linen-sam-aftermath': [
    { requires: world('stock', 'clean'), text: 'Six back, clean and on time. Mags gave Oscar the next date and I told her we were having a conversation first. Thanks for helping with the return.' },
    { requires: world('stock', 'wash-needed'), text: 'The bundle came back on time. Oscar stayed to help with the wash. He folds corners like he plays drums: enthusiastic, not always together. We got it done.' },
    { requires: world('stock', 'late-clean'), text: 'The clean bundle turned up after the count. Oscar signed the late entry himself. That helped. I don’t want another morning explaining someone else’s missing laundry.' },
    { requires: world('stock', 'late-wash'), text: 'The bundle turned up late and needed washing. Oscar helped finish it. I’ve told Mags the next loan needs her name beside mine, in actual ink.' },
    { requires: world('stock', 'missing'), text: 'Oscar still has the six tablecloths. Mags is collecting them after work. I’ve marked the loan against her name. Next time she can tell me before the cupboard empties.' },
    { requires: world('stock', 'no-loan'), text: 'They used the hall’s mismatched covers. Oscar sent a photograph; people seemed happy enough. Our cupboard stayed full, and I went home at the right time.' },
  ],
};

export const linenSites = { 'linen-hall': 'market-quarter', 'linen-laundry': 'moonlight-hotel', 'linen-washroom': 'east-village' };
const rect = (x: number, y: number, w: number, h: number, color: string): ScenePrimitive => ({ rect: [x, y, w, h, color] });
const label = (text: string, x: number, y: number, size = 0.55, color = '#f5e9cc'): ScenePrimitive => ({ label: [text, x, y, size, color] });
const hall = (requires: Condition, shapes: readonly ScenePrimitive[]): SceneLayer => ({ site: 'linen-hall', rotate: true, requires, shapes });
const laundry = (requires: Condition, text: string, color: string): SceneLayer => ({ site: 'linen-laundry', rotate: true, requires, shapes: [rect(-4.5, -5.5, 9, 1.2, color), label(text, 0, -4.9, 0.48)] });

/** Visible local aftermath on existing frontages; no new obstacles or navigation geometry. */
export const linenScenes: readonly SceneLayer[] = [
  hall(world('event', 'preparing'), [rect(-4.5, 3, 9, 2.6, '#75564c'), label('MARKET HALL', 0, 3.8, 0.65), label('REUNION · DAY 4 · 20:00', 0, 4.8, 0.46)]),
  hall(world('event', 'open'), [rect(-4.5, 3, 9, 1.7, '#78623b'), label('OLD FRIENDS · COME IN', 0, 3.9, 0.55)]),
  hall({ all: [world('event', 'open'), world('tables', 'borrowed')] }, [-3.2, 0, 3.2].flatMap(x => [rect(x - 1.05, -2.7, 2.1, 1.5, '#f1e8d1'), rect(x - 0.8, -3.1, 0.4, 0.3, '#906d4a'), rect(x + 0.4, -0.9, 0.4, 0.3, '#906d4a')])),
  hall({ all: [world('event', 'open'), world('tables', 'mismatched')] }, [rect(-3, -2.7, 2.1, 1.5, '#b77657'), rect(1, -2.7, 1.9, 1.3, '#7f9c83'), label('BRING A CHAIR', 0, -0.1, 0.45)]),
  hall({ all: [world('event', 'open'), world('flowers', 'fresh')] }, [rect(-0.2, -2.5, 0.4, 0.55, '#8fbc91'), rect(-0.4, -2.8, 0.8, 0.35, '#e5adbc')]),
  hall({ all: [world('event', 'open'), world('flowers', 'bruised')] }, [rect(-0.2, -2.4, 0.4, 0.3, '#8fbc91'), rect(-0.25, -2.6, 0.5, 0.25, '#b8859a')]),
  hall({ all: [world('event', 'open'), world('guest', true)] }, [rect(-2.5, 5, 5, 1.1, '#4a535f'), label('SAVE NELL A SANDWICH', 0, 5.6, 0.41)]),
  hall(world('event', 'finished'), [rect(-4.5, 3, 9, 1.5, '#595b54'), label('THANKS FOR COMING', 0, 3.8, 0.6)]),
  hall({ all: [world('event', 'finished'), world('supplies', true), { not: world('returned', true) }] }, [rect(2.8, -3, 1.4, 1.1, '#e1d6bc'), rect(3.3, -2.9, 0.3, 0.9, '#637ca9'), label('MOONLIGHT LAUNDRY', 0, -4, 0.42)]),
  laundry(world('stock', 'clean'), 'SIX CLEAN · BACK ON THE SHELF', '#416453'),
  laundry(world('stock', 'wash-needed'), 'RETURNED · WASH LOAD BOOKED', '#796642'),
  laundry(world('stock', 'missing'), 'SIX OUT · MAGS TO COLLECT', '#7d5146'),
  laundry(world('stock', 'late-clean'), 'LATE RETURN · ALL SIX CLEAN', '#59664d'),
  laundry(world('stock', 'late-wash'), 'LATE RETURN · EXTRA WASH LOAD', '#796642'),
  { site: 'linen-washroom', rotate: true, shapes: [rect(-4.5, 3, 9, 1.7, '#4b6873'), label('EAST VILLAGE WASH ROOM', 0, 3.9, 0.53)] },
];
