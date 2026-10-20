import { dayMinute } from './clock';
import type { CampaignDefinition, Claim, WorldOperation } from './model';
import { rides } from './content-rides';
import { bulletins, scenes, ordinaryResponses } from './content-presentation';
import type { CharacterId } from '../narrative/characters';
import type { Mission, MissionCatalogue, MissionDialogueBeat, Condition, Effect } from '../missions/schema';

const freezeFacts = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeFacts(child);
    Object.freeze(value);
  }
  return value;
};

/** Fixed authored facts. Dispatch may vary access, never these dates or sources. */
export const campaignCast = ['mara', 'eli', 'victor', 'celia', 'vale', 'leila', 'harker', 'lena', 'iris', 'tom', 'ruth', 'bea'] as const;
export const NEWSROOM_STOP = 'old-town-south';
export type Material = Readonly<{ title: string; text: string; kind: 'receipt' | 'conversation' | 'document' | 'observation'; source: string }>;
export const materials: Readonly<Record<string, Material>> = freezeFacts({
  'barrier-receipt': { title: 'Temporary barriers · signed delivery', kind: 'receipt', source: 'meridian-site', text: 'Order dated shift 1: Garden Café frontage. Temporary barriers ordered by Meridian Site Services, contact C. Ward. Recipient signed for delivery before the scheduled overnight closure. This is a delivery record, not an explanation for the closure.' },
  'cleaner-note': { title: 'Nico · cancelled cleaning shifts', kind: 'conversation', source: 'nico', text: 'Nico says the café supervisor cancelled the shift-3 cleaning rota during shift 2, before the windows were broken. Nico kept the cancellation message and agreed to let Iris contact them after reaching temporary accommodation.' },
  'cafe-photo': { title: 'Garden Café frontage', kind: 'observation', source: 'driver-photo', text: 'Photo bookmarked at Garden Café: boarded windows, the temporary barriers and a Meridian Site Services notice. The photograph records the condition on this visit; it does not identify who broke the windows.' },
  'eli-docket': { title: 'Borrowed van · repair docket', kind: 'document', source: 'eli-workshop', text: 'Eli supplied his original fleet docket. Meridian van MS-14 was returned with glass in the tyre tread after the shift-2 waterfront closure. The job card orders its removal from the regular service register. Eli identifies the vehicle from work he personally performed.' },
  'contractor-register': { title: 'Site-services purchase register', kind: 'document', source: 'public-registry', text: 'Tom obtained the filed purchase register: MS-14 and overnight closure teams were booked to Garden Café before shift 3. The signatory is Meridian Site Services. The register and workshop docket were created by different organisations.' },
  'lena-order': { title: 'Lena · original patrol reassignment', kind: 'document', source: 'lena-duty', text: 'Lena provided her shift-2 duty instruction, signed by Captain Harker: waterfront patrols withdrawn while Meridian teams had overnight access. It includes her unanswered request for a replacement patrol.' },
  'harker-docket': { title: 'Station transport docket', kind: 'receipt', source: 'police-transport', text: 'Signed transport docket: shift 2 waterfront officers collected at Midtown North for reassignment to East Village. Authorising officer: Captain Harker. Department transport account. Attached to this completed booking.' },
  'patrol-register': { title: 'Dispatch desk carbon copies', kind: 'document', source: 'dispatch-archive', text: 'Tom collected dispatch carbon copies showing Harker cancelling waterfront cover on shifts 2, 5 and 7. No substitute unit was entered despite incident reports at those addresses. The copies retain dispatch timestamps and order numbers.' },
  'complaint-log': { title: 'Harbour traders · unanswered calls', kind: 'document', source: 'traders-association', text: 'Mara passed on the traders association call log, including complaints from businesses that refuse Breakwater protection. Its timed calls match the withdrawn patrol periods. Mara also wants her crew’s own offences kept out of the paper; the log is not an endorsement of her.' },
  'leila-warning': { title: 'Leila · briefing acknowledgement', kind: 'document', source: 'leila-firsthand', text: 'Leila brought her dated briefing copy to the newsroom. Vale initialled receipt on shift 8. It warns that Meridian is arranging closures and using Harker to remove patrols. Leila confirms she briefed him in person, and consents to an attributed interview after reaching a safe address.' },
  'vale-authority': { title: 'Supplier authorisation · filed copy', kind: 'document', source: 'council-register', text: 'Filed authorisation signed by Adrian Vale on shift 9: retain Meridian as the preferred Open Shore operator and decline the requested suspension pending the waterfront review. It references the shift-8 briefing acknowledgement. Tom collected the numbered council copy, not a photograph of a social meeting.' },
  'hearing-copy': { title: 'Committee hearing · certified extract', kind: 'document', source: 'committee-clerk', text: 'Certified committee extract records the clerk delivering the shift-8 interference warning to Vale, his acknowledgement, and his instruction to keep Meridian’s arrangement in place. The clerk’s signed account is independent of Leila and available from the public records desk.' },
  'contract-carbon': { title: 'Reception delivery · contract carbon', kind: 'document', source: 'meridian-contract', text: 'The duplicate supplier sheet attached to Victor’s reception order carries Vale’s shift-9 authorisation number and Meridian’s preferred redevelopment access terms. It was retained as part of the signed delivery paperwork. Venues and donations alone would not establish what Vale knew.' },
  'iris-tenants': { title: 'Tenant interview booking', kind: 'receipt', source: 'tenant-booking', text: 'Iris reached a waterfront tenant interview. The booking retains the address, permission to contact the tenant and the relocation deadline. Iris is investigating tenancy pressure; she has made no allegation about the candidate.' },
  'bea-repair': { title: 'Dispatch office · repaired radio', kind: 'receipt', source: 'bea-office', text: 'Bea’s repaired dispatch radio was delivered and the replacement dispatcher completed a supervised shift. Bea can finally take two evenings off each week. A small piece of the business is running properly again.' },
});

type JobSpec = { id: string; character: CharacterId; title: string; pickup: string; dropoff: string; from: number; until: number; text: string; line: string; rider?: string; records?: string[]; effects?: Effect[]; requires?: Condition; first?: boolean; choice?: { group: string; option: string; options?: string[] } };
const specs: readonly JobSpec[] = [
  { id: 'bea-first-shift', character: 'bea', title: 'The spare radio', pickup: 'old-town-rank', dropoff: 'dockside-deli', from: 1, until: 2, first: true, text: '', line: 'Hey, it’s Bea, your favourite dispatcher. Also your only dispatcher, so don’t let it go to my head. Take this spare radio to Dockside Deli, will you? They help me take bookings when the office phone cuts out.' },
  { id: 'celia-barriers', character: 'celia', title: 'Temporary barriers', pickup: 'dockside-deli', dropoff: 'garden-cafe', from: 1, until: 2, text: 'Could you take me from Dockside Deli to Garden Café? Meridian is putting barriers along the café entrance tonight. The equipment truck and crew are already there, but I need to bring the delivery forms and get them signed.', line: 'The café owner’s worried the barriers will block his customers. I keep telling him they’re temporary. My job is to get the frontage cleared and the delivery signed tonight. Keep your receipt; someone always questions the dates later.', records: ['barrier-receipt'] },
  { id: 'lena-vehicle', character: 'lena', title: 'Collecting the pool car', pickup: 'midtown-north', dropoff: 'east-village', from: 2, until: 2, text: 'Off duty and my car’s at the wrong station again. Lift from Midtown North to East Village?', line: 'We were on the waterfront tonight. Now we’re collecting vehicles across town. Someone changed the assignment after the rota went out. I’ll still be back writing tickets tomorrow, so don’t celebrate.', records: ['harker-docket'] },
  { id: 'vale-road-visit', character: 'vale', title: 'A failed scheduled car', pickup: 'moonlight-hotel', dropoff: 'sunset-beach', from: 1, until: 3, text: 'Adrian Vale’s scheduled car has failed. Beach maintenance visit, ordinary fare. Pickup at Moonlight Hotel. — campaign transport', line: 'That pothole by the café—does it catch your front wheel too? I’ll get the maintenance crew to look at it. Open Shore needs the ordinary things working: beach access, street lighting, jobs that last.', effects: [{ setFlag: 'vale-road-reported' }] },
  { id: 'eli-parts', character: 'eli', title: 'Fleet parts', pickup: 'the-docks', dropoff: 'dockside-deli', from: 1, until: 4, text: 'Lift with a box of filters? I’m taking the fleet-maintenance exam next month. Nothing exciting in the box, unless you like oil filters.', line: 'Mara lets me use the workshop after hours. Useful when it’s quiet. Less useful when somebody arrives with a van they need fixed without a job card. I want fleet work where the paperwork actually stays put.' },
  { id: 'leila-boxes', character: 'leila', title: 'Forgotten leaflets', pickup: 'market-quarter', dropoff: 'woodland-estates', from: 2, until: 5, text: 'Forgotten leaflets and one exhausted volunteer coordinator. Can you get me to Woodland Estates? A supporter lent us a villa for the volunteer meeting.', line: 'The volunteers believe in this. So do I. The beach toilets really were broken for months. I just wish I could pay for a meeting room without owing its owner six phone calls.' },
  { id: 'victor-chairs', character: 'victor', title: 'Reception setup', pickup: 'ocean-walk', dropoff: 'moonlight-hotel', from: 2, until: 5, text: 'Our events supervisor needs a lift to Moonlight Hotel. Chairs, refreshments, a Civic Renewal reception. Please use the main entrance.', line: 'Visitors remember a clean room and a staff member who knows what they’re doing. That’s what I sell. The waterfront could work the same way, with someone responsible for it. People are tired of excuses.' },
  { id: 'iris-interview', character: 'iris', title: 'An afternoon interview', pickup: 'old-town-south', dropoff: 'garden-cafe', from: 2, until: 9, text: 'Interview with a tenant near Garden Café. Could use a lift; my bicycle’s wheel has other ideas. If you ever need to leave paperwork, our newsroom is at Old Town South.', line: 'I’m asking tenants about their leases. Some want redevelopment; some are being offered terms they can’t afford. Today I need to reach one before their next shift, not persuade them of my theory.', records: ['iris-tenants'], effects: [{ setFlag: 'tenant-interview-reached' }] },
  { id: 'tom-register', character: 'tom', title: 'Records desk closing', pickup: 'flower-market', dropoff: 'old-town-south', from: 4, until: 6, text: 'Records desk is closing and I’ve got the numbered site-services copies. Lift to the newsroom? These are public filings; nobody needs to break into anything.', line: 'Same service entrance, different trading name. Often it’s just a change of tenant. I’ve got the purchase register so we can check the dates rather than guessing from the sign.', records: ['contractor-register'] },
  { id: 'mara-calls', character: 'mara', title: 'Traders’ paperwork', pickup: 'the-docks', dropoff: 'old-town-south', from: 7, until: 13, text: 'Traders want their unanswered calls on record. I can bring the association log to Old Town South. Don’t mistake this for charity.', line: 'Some of those shops won’t pay my crew. Their calls went unanswered too. You can check the log. I’d rather the paper stayed on Meridian, but Iris won’t promise me that. Neither should you.', records: ['complaint-log'] },
  { id: 'harker-service', character: 'harker', title: 'Uniform collection', pickup: 'east-village', dropoff: 'midtown-north', from: 4, until: 8, text: 'Uniform collection at East Village, return to Midtown North. Department account. Please retain the transport docket.', line: 'Resources go where they’re needed. People see an empty corner and assume we’ve done nothing. They don’t see the rest of the roster. Take the receipt; procurement will ask you for it.' },
  { id: 'ruth-proofs', character: 'ruth', title: 'Printer proofs', pickup: 'the-arcade', dropoff: 'old-town-south', from: 4, until: 9, text: 'Printer proofs need to get back to our office at Old Town South. Any signed material you want us to look at can come here too. No promises of a story.', line: 'Someone telling Iris a thing is a lead. A dated record is something we can check. Two people repeating the same rumour are still one rumour. We need time to contact people before we print their names.' },
  { id: 'nico-safe-ride', character: 'bea', rider: 'Nico', title: 'A temporary address', pickup: 'market-quarter', dropoff: 'moonlight-hotel', from: 3, until: 8, text: 'Could you take Nico from Market Quarter to Moonlight Hotel? They’re a cleaner at Garden Café and need a temporary place to stay. They’ve agreed to speak to a local reporter about their cancelled shifts once they’re settled. FYI, you won\'t have time for Celia’s booking for a cleaning supervisor if you take this job', line: 'Take it easy with Nico, will you? Their shifts got cancelled before the shop\'s windows were broken, and they’re still waiting for their wages. They need a room tonight. The newspaper interview can wait until they’re settled.', records: ['cleaner-note'], effects: [{ setFlag: 'nico-safe' }], choice: { group: 'nico-trip', option: 'room', options: ['room', 'roster'] } },
  { id: 'celia-roster', character: 'celia', title: 'The replacement roster', pickup: 'market-quarter', dropoff: 'pacific-palm-hotel', from: 3, until: 8, text: 'Could you take me from Market Quarter to Pacific Palm Hotel? I’m bringing the new cleaning schedule after Garden Café’s staff lost their shifts. Bea also needs to get Nico, one of those cleaners, from Market Quarter to a room at Moonlight Hotel. If you pick me up, you won’t be able to take Nico tonight.', line: 'Yes, Nico’s still waiting for their wages. Accounts will have to answer for that. I’ve got a new team starting at Pacific Palm, and if their names don’t match the payroll list, they won’t even get through the staff door. That’s the problem I can fix today.', effects: [{ setFlag: 'meridian-roster-delivered' }], choice: { group: 'nico-trip', option: 'roster' } },
  { id: 'eli-originals', character: 'eli', title: 'The original job card', pickup: 'the-docks', dropoff: 'old-town-south', from: 5, until: 12, text: 'MS-14’s job card is being removed from the register. I kept the original for my invoice. I’ll take it to the newsroom myself if you can drive.', line: 'I’m not asking you to like Mara. I worked on that van, and I know what came out of the tyres. If my name goes on the record, I want it clear that this is my job card, not something I heard in the yard.', records: ['eli-docket'], effects: [{ setFlag: 'eli-original-preserved' }] },
  { id: 'lena-orders', character: 'lena', title: 'A copy of the rota', pickup: 'midtown-north', dropoff: 'old-town-south', from: 6, until: 12, text: 'I’ve kept my original reassignment and the request for cover. I can bring them to the newsroom. This doesn’t change how I deal with your driving.', line: 'Breakwater steals vehicles. I’ve dealt with that myself. It still doesn’t explain why our replacement-cover requests vanished. My instruction has a signature and an order number. They can start there.', records: ['lena-order'] },
  { id: 'tom-patrol-copy', character: 'tom', title: 'Dispatch carbon copies', pickup: 'east-village', dropoff: 'old-town-south', from: 7, until: 9, text: 'Dispatch archive released the carbon copies. Need a ride back from East Village. The traders’ timed call log would let us check them independently.', line: 'Not every missing car means a conspiracy. These are three signed cancellations, with no replacement entered. I want the call times from outside the station before Ruth says anything about the reason.', records: ['patrol-register'] },
  { id: 'leila-safe-copy', character: 'leila', title: 'A quiet departure', pickup: 'moonlight-hotel', dropoff: 'old-town-south', from: 9, until: 12, text: 'I need to reach Iris with my briefing copy before going to a safe address. Adrian received it on shift 8. Collecting me declines Celia’s competing return booking.', line: 'I put the warning in front of him. He initialled it. I thought that meant we’d stop using the arrangement. Don’t leave the original in the car. Iris needs to ask me her own questions.', records: ['leila-warning'], effects: [{ setFlag: 'leila-safe' }], choice: { group: 'leila-trip', option: 'newsroom', options: ['newsroom', 'return'] } },
  { id: 'celia-return', character: 'celia', title: 'Back to the reception', pickup: 'moonlight-hotel', dropoff: 'pacific-palm-hotel', from: 9, until: 12, text: 'Can you pick me up at Moonlight Hotel and take me to Pacific Palm Hotel? The Civic Renewal reception is still going ahead, and I need to check the staff and guest list. Leila has asked for a ride from Moonlight to the newspaper office instead. If you pick me up, she’ll miss that lift.', line: 'I know Leila wants to leave. That’s between her and the campaign. My staff are at Pacific Palm waiting for the guest list, and the guests won’t care why the office phones have stopped ringing. We still have to open the doors.', effects: [{ setFlag: 'meridian-reception-assisted' }], choice: { group: 'leila-trip', option: 'return' } },
  { id: 'tom-authority', character: 'tom', title: 'A numbered council copy', pickup: 'flower-market', dropoff: 'old-town-south', from: 10, until: 13, text: 'The council filed the supplier authorisation. Numbered copy ready at Flower Market. Lift back to the office; verification must finish before election day.', line: 'This is the decision, not the photograph from a reception. It references an earlier briefing. We need to know what that briefing said and who actually delivered it.', records: ['vale-authority'] },
  { id: 'ruth-hearing-copy', character: 'ruth', title: 'The certified extract', pickup: 'midtown-north', dropoff: 'old-town-south', from: 10, until: 13, text: 'Committee clerk has released a certified extract and signed account. I’m collecting it at Midtown North. It can stand independently of a campaign witness.', line: 'The clerk can speak to what was delivered and acknowledged. That matters if a witness withdraws. It doesn’t give us permission to publish every allegation in the same envelope.', records: ['hearing-copy'] },
  { id: 'victor-carbon', character: 'victor', title: 'Signed reception paperwork', pickup: 'fairway-club', dropoff: 'moonlight-hotel', from: 10, until: 13, text: 'I need a lift from Fairway Club back to Moonlight Hotel with the signed reception paperwork. Keep your delivery carbon for accounts.', line: 'The agreement number is on the carbon. We keep copies because the council changes staff, and I don’t intend to renegotiate the same terms every time somebody moves desks.', records: ['contract-carbon'] },
  { id: 'bea-radio-repair', character: 'bea', title: 'Two evenings off', pickup: 'the-arcade', dropoff: 'dockside-deli', from: 8, until: 13, text: 'My office radio’s fixed, and I’ve found someone to cover two evenings a week. Can you collect the radio from the repair shop at The Arcade and bring it to Dockside Deli? I’m training the new dispatcher tonight.', line: 'A working radio and someone else to answer it. That’s all I need for two evenings off a week. I might even eat dinner while it’s hot. Get this back to the deli, will you?', records: ['bea-repair'], effects: [{ setFlag: 'bea-office-ready' }] },
  { id: 'bea-vote', character: 'bea', title: 'A lift to vote', pickup: 'dockside-deli', dropoff: 'ocean-walk', from: 14, until: 14, text: 'Polling day. Could you take me down to Ocean Walk? I’d like to get there before I’m back on the phones. Ordinary fare, same as ever.', line: 'Could we go past Garden Café on the way to Ocean Walk? Shops along the waterfront have been closing, and I’d like a look before I vote. You see more from a taxi than you do from an election leaflet.', effects: [{ setFlag: 'election-ride-finished' }] },
];

export const jobWindows: Readonly<Record<string, Readonly<{ from: number; until: number }>>> = freezeFacts(Object.fromEntries(specs.map(s => [s.id, { from: dayMinute(s.from), until: s.id === 'celia-barriers' ? dayMinute(2, 23) : dayMinute(s.until + 1) }])));

const dialogue: Record<string, MissionDialogueBeat> = {};
const missions: Record<string, Mission> = {};
export const jobMaterials: Readonly<Record<string, readonly string[]>> = Object.freeze(Object.fromEntries(specs.map(s => [s.id, Object.freeze(s.records ?? [])])));
export const jobNames: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(specs.filter(s => s.rider).map(s => [s.id, s.rider!])));
for (const s of specs) {
  dialogue[s.id] = { character: s.character, category: 'lore', channel: s.rider ? 'sender' : 'passenger', text: s.line.replace(/shift-(\d+)/g, 'day-$1').replace(/shift (\d+)/g, 'day $1') };
  dialogue[`${s.id}-sender`] = { character: s.character, category: 'lore', channel: 'sender', text: s.line.replace(/shift-(\d+)/g, 'day-$1').replace(/shift (\d+)/g, 'day $1') };
  missions[s.id] = {
    title: s.title, chapter: 1, category: 'lore', repeat: 'once', abandon: { retry: 'always' }, passenger: s.character,
    ...(s.first ? { dispatchRadius: 120 } : { offer: { character: s.character, text: s.text.replace(/shift/g, 'day') } }),
    requires: { all: [{ minuteAtLeast: jobWindows[s.id].from }, { minuteBefore: jobWindows[s.id].until }, { not: { flag: `contact-${(s.rider ?? s.character).toLowerCase()}-lost` } }, ...(s.requires ? [s.requires] : [])] },
    contactLost: { effects: [{ setFlag: `contact-${(s.rider ?? s.character).toLowerCase()}-lost` }] },
    allowed: { jobs: s.first ? ['fare', 'parcel'] : ['fare'] }, stops: { pickup: s.pickup, dropoff: s.dropoff }, beats: { pickup: s.id, pickupSender: `${s.id}-sender` },
    ...(s.choice ? { pickupChoice: { group: s.choice.group, choice: s.choice.option }, ...(s.choice.options ? { choices: [{ id: s.choice.group, commit: 'pickup', options: s.choice.options.map(id => ({ id })) }] } : {}) } : {}),
    effects: [...(s.effects ?? []), ...(s.records ?? []).map(acquireMaterial => ({ acquireMaterial }))],
  };
}
export const openShoreCatalogue: MissionCatalogue = freezeFacts({ schemaVersion: 1, dialogue, missions });

/** Independent documents/testimony; repeating a source never supplies another link. */
export const corroboration = freezeFacts({
  coordination: [['barrier-receipt', 'cleaner-note', 'cafe-photo'], ['eli-docket', 'contractor-register']],
  policing: [['lena-order', 'harker-docket'], ['patrol-register', 'complaint-log']],
  knowledge: [['leila-warning', 'vale-authority'], ['hearing-copy', 'contract-carbon']],
} as const);
export type Allegation = keyof typeof corroboration;

const everydaySpecs = [
  { name: 'Sam', family: 'Staff transport', lines: ['Late shift, early alarm. Home, please.', 'Same shift, same bus I just missed.', 'First proper evening off. A lift to meet a friend?'] },
  { name: 'June', family: 'Small deliveries', lines: ['Birthday cake. Yes, it really is just a birthday cake.', 'Laundry collection; the blue bag is mine.', 'Groceries for my dad. He’ll try to tip you in tomatoes.'] },
  { name: 'Ravi', family: 'Personal journeys', lines: ['Interview today. I’ve checked the address four times.', 'I got the job! Could you take me in?', 'First payday. We’re celebrating at the arcade.'] },
  { name: 'Cleo', family: 'Vehicle assistance', lines: ['My car won’t start. Mechanic’s meeting me there.', 'New battery, same car. Much cheaper than my last idea.', 'Dropping off the borrowed jump leads.'] },
  { name: 'Oscar', family: 'Event logistics', lines: ['Community hall setup. Please mind the flowers.', 'The reunion went well. Nobody recognised my haircut.', 'Taking the leftover tablecloths back.'] },
];

export const everydayJobs = freezeFacts(everydaySpecs.map((job, i) => ({ ...job, during: [
  'Could you leave me by the side entrance? The front door locks before my shift finishes.',
  'Please take the corners gently. That box has survived the bus; I’d like it to survive the last street.',
  'I nearly took the wrong bus again. It’s easier to ask you than pretend I know where I’m going.',
  'My mechanic says it’ll be ready tomorrow. He said that yesterday too.',
  'We borrowed the flowers from a neighbour. Now I’ve got to get them home in one piece.',
][i] })));

const change = (changes: Record<string, string | boolean>): Effect[] => Object.entries(changes).map(([key, value]) => ({ setWorld: { key, value } }));
export const worldOperations: readonly WorldOperation[] = freezeFacts([
  { id: 'waterfront-cover-withdrawn', at: dayMinute(2, 21), effects: change({ patrol: 'withdrawn' }) },
  { id: 'ms14-arrives', at: dayMinute(2, 22), effects: change({ van: 'at-cafe', security: 'contracted' }) },
  { id: 'cafe-windows-broken', at: dayMinute(2, 23), effects: change({ cafe: 'broken' }) },
  { id: 'cafe-boarded', at: dayMinute(3, 7), effects: change({ cafe: 'boarded' }) },
  { id: 'ms14-departs', at: dayMinute(3, 12), effects: change({ van: 'departed', patrol: 'normal' }) },
  { id: 'tenancy-hearing', at: dayMinute(5, 10), effects: change({ hearing: 'held' }), outcomes: [
    { id: 'tenancy-review', requires: { flag: 'tenant-interview-reached' }, effects: change({ cafe: 'tenancy-review' }) },
    { id: 'closed', effects: change({ cafe: 'closed' }) },
  ] },
  { id: 'preferred-operator', at: dayMinute(9, 10), effects: change({ operator: 'preferred' }) },
  { id: 'polls-open', at: dayMinute(14, 7), effects: change({ polls: true }) },
]);
const dependencies = (state: 'verified' | 'approved'): Condition => ({ all: ['coordination', 'policing'].map(id => ({ caseState: { id, state } })) });
export const claims: Readonly<Record<string, Claim>> = freezeFacts({
  coordination: { title: 'The café closure and contractor records', routes: corroboration.coordination, reactionEffects: change({ security: 'suspended' }) },
  policing: { title: 'The withdrawn waterfront patrols', routes: corroboration.policing, reactionEffects: change({ patrol: 'inquiry' }) },
  knowledge: { title: 'Vale’s warning and the retained agreement', routes: corroboration.knowledge,
    verifyRequires: dependencies('verified'), approveRequires: dependencies('approved'),
    publishRequires: { all: [{ published: 'coordination' }, { published: 'policing' }] }, reactionEffects: change({ appearance: 'cancelled' }) },
});
export const campaignDefinition: CampaignDefinition = freezeFacts({
  id: 'open-shore', title: 'Open Shore', finishedLabel: 'ELECTION DAY · OFF THE CLOCK', completionText: 'Election-day campaign complete.',
  initialWorld: { cafe: 'open', van: 'absent', patrol: 'normal', security: 'none', hearing: 'pending', appearance: 'booked', operator: 'unannounced', polls: false },
  operations: worldOperations, materials, claims, missions: openShoreCatalogue, jobWindows, jobNames, handlers: [],
  dispatcher: 'bea',
  newsroom: { stop: NEWSROOM_STOP, name: 'Old Town South', editor: 'Ruth', guide: 'Dispatch mixes ordinary work with recurring customers. Texts let you choose a booking; its deadline is for pickup. Stop near the boarded Garden Café and use the camera icon in the quick actions to record its frontage. A check mark means the observation is already in your Dispatch notebook. The newsroom is at Old Town South: stop nearby and choose material to leave. Source checks take three game hours. Return to ask Ruth to run a ready story in the next 06:00 edition. Public responses happen later. The last edition is Day 14 at 06:00.' },
  sites: { cafe: 'garden-cafe', newsroom: NEWSROOM_STOP, hotel: 'moonlight-hotel' },
  observations: [{ id: 'cafe-photo', stop: 'garden-cafe', radius: 16,
    requires: { any: ['boarded', 'tenancy-review', 'closed'].map(value => ({ worldEquals: { key: 'cafe', value } })) },
    label: 'Record café frontage', unavailable: 'Stop near Garden Café from day 3 onward to record its frontage.', success: 'Observation saved: Garden Café frontage. In Dispatch notebook; bring a copy to the newsroom.' }],
  vehicles: [{ id: 'campaign-ms14', model: 'van', stop: 'garden-cafe', offsets: [{ x: 2.5, y: 12 }, { x: 2.5, y: 18 }, { x: -7, y: 12 }], angle: Math.PI / 2, color: '#d4c6ab', present: { worldEquals: { key: 'van', value: 'at-cafe' } }, departTo: 'the-docks' }],
  scenes, bulletins, ordinaryResponses,
  rides: Object.fromEntries(Object.entries(rides).map(([id, [during, arrival]]) => [id, { during, arrival, ...(jobNames[id] ? { channel: 'sender' as const } : {}) }])),
  everydayJobs,
});
