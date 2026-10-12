import type { StoryMessage } from '../story';
import { everydayJobs, openShoreCatalogue } from './content';
import type { Campaign } from './state';

/** Spoken during physical travel and on arrival, rather than a second dispatch popup. */
const rides: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  'bea-first-shift': ['Deli’s on the corner. The owner keeps the radio behind the till, next to a tin of coins nobody admits borrowing from. Tell him the aerial still sticks.', 'That’s our backup line working again. I’ve got a normal fare after this, then I’ll pass on any local bookings. You can always ask me for another fare.'],
  'celia-barriers': ['There’s already a van at the yard with our name painted over the old lettering. Same driver, different invoice. The foreman says to leave a gap for the service door.', 'I’ll get both sheets signed by the crew. One for accounts, one for your glovebox. I don’t want them ringing you next week because they’ve lost theirs.'],
  'lena-vehicle': ['I was supposed to be walking that café stretch. Then the radio sent us east. Nobody would tell me who was covering the empty beat.', 'Here’s the department transport slip. Same order number as my reassignment. Hang onto yours; ours tend to end up in the wrong drawer.'],
  'vale-road-visit': ['My father drove this road to work. Used to complain about the lighting every winter. I’d rather be remembered for fixing it than for another speech in a hotel.', 'Thanks for the lift. They’ll photograph me by the beach entrance, then I’ve got three more rooms to shake hands in. You’ve got the better route today.'],
  'eli-parts': ['See that filter box? Eight hours’ wages if somebody drops it. I can fix a van, but I can’t afford to replace every part I touch.', 'Cheers. If you ever need a job card looked at, find me at the docks. I write the mileage down even when the customer tells me not to.'],
  'leila-boxes': ['We printed leaflets with the old bus timetable. I spent lunch putting stickers over it. No, the candidate doesn’t know. I’d like one problem he never has to hear about.', 'Volunteer meeting’s through the side door. If someone offers you a leaflet, take two. It’ll make their evening.'],
  'victor-chairs': ['The hotel manager wants the tables moved again. Guests pay to see the water, apparently, even when the room is full of people giving speeches.', 'Main entrance, please. I don’t send staff around the bins unless there’s actually a delivery to unload.'],
  'iris-interview': ['She finishes work soon. If we get there in time I can take down her account before the committee closes the list of tenants asking to be heard.', 'I’ll go in alone. Keep your booking slip. If you come across something you want us to check, bring a copy to Old Town South.'],
  'tom-register': ['The clerk stamped every page in front of me. I asked for the register from before the windows went as well as the new one. Took most of the afternoon.', 'Thanks. Iris can call the clerk directly. I’d rather spend another hour checking a date than a month correcting it.'],
  'mara-calls': ['That shop on the corner told my boys to leave. Fair enough. Then their shutters went and no patrol came. I’ve got their calls in the same log as everyone else’s.', 'The log stays with Iris. If she writes about my crew as well, I can hardly say she didn’t warn me.'],
  'harker-service': ['I have officers in three places asking for the same two cars. Everybody thinks their street should get the first one. You know what that’s like, driving dispatch.', 'Leave me at the station entrance. And do slow down past the school. I’m off duty; the camera isn’t.'],
  'ruth-proofs': ['People ask whether we believe them. Usually I ask whether there’s someone else I can telephone. That gets a less friendly answer.', 'Copies go to the desk. We check the source before we call a story ready; after that I still need someone to ask for it to go in the edition.'],
  'nico-safe-ride': ['Nico says the message came before the windows went: “Don’t come in tomorrow.” They’ve still got it on the phone. Tonight they want a key that works and a door that locks.', 'They’ve reached the room. The cancellation account is in your notebook. Iris will have to ask Nico for permission herself; this lift doesn’t make it public.'],
  'celia-roster': ['The new team keeps asking which list to use. I told them the one payroll sent this morning. I’ve got it here; reception can check the names when we arrive.', 'Reception will sign. Nico’s room booking was released when we took the slot; don’t send the hotel another car on my account.'],
  'eli-originals': ['There was glass right through the tyre tread. MS-14. I wrote it down before anybody asked what the van had been doing. My invoice still has that first job card attached.', 'I’ll speak to Iris. Keep the copy I gave you; the dates on the card are mine. I don’t want anyone deciding later that I remembered them differently.'],
  'lena-orders': ['My request for replacement cover is still unanswered. The copy has the time I sent it and the signature on the order pulling us out.', 'I’m taking the original inside. Your copy is separate. This won’t get you out of a speeding ticket, by the way.'],
  'tom-patrol-copy': ['The carbon is faint on the last sheet. Order number is clear, though. I want the traders’ call times beside it before we decide what the gaps mean.', 'Drop me at the desk. If Mara turns up with that log, Iris can compare it to the station’s own timestamps.'],
  'leila-safe-copy': ['I stood beside his desk while he initialled it. I thought he’d call Celia straight away. The next instruction kept the arrangement running.', 'Please don’t wait outside. Iris has a quiet way out for me after we talk. You’ve got the briefing copy; I’ve got to answer for my own name on it.'],
  'celia-return': ['Half the guest list is already seated. Whatever Leila has told you, I still have staff who expect to be paid for tonight.', 'Thank you. Reception’s expecting me. Leila’s travelling privately now; that was the slot we released.'],
  'tom-authority': ['The numbered copy points back to the earlier briefing. The clerk let me check the reference against the original before stamping this one.', 'Here we are. No missing page this time. Iris can ask what was acknowledged before Ruth decides how to word it.'],
  'ruth-hearing-copy': ['The clerk signed an account of delivering the warning. We can call them independently of Leila. Nobody has to rely on a campaign aide staying willing to talk.', 'I’ll put the extract with the contract copy if we have it. The café and patrol reporting need their own sources too.'],
  'victor-carbon': ['Council authorisation number’s in the corner. I insisted on that after the last manager disputed our access terms. Copies are cheaper than lawyers.', 'Your carbon is yours. Accounts has the other one. Please don’t leave either on the reception table with the menus.'],
  'bea-radio-repair': ['Replacement dispatcher’s done two supervised evenings. He still calls every motorbike a van, but the phone gets answered. I’ll take that.', 'Radio delivered. Two evenings off, at last. Don’t use them to ring me about the office keys.'],
  'bea-vote': ['I’ve booked this half hour for myself. Phones can wait. Take the café road; I want to see whether the notice is still up.', 'Thanks. Same fare as everyone else. I’m going in to vote, then I’ll be back on the radio.'],
});

export function rideMessage(id: string, stage: 'during' | 'arrival', parcel = false): StoryMessage | null {
  const mission = openShoreCatalogue.missions[id], lines = rides[id];
  if (!mission || !lines) return null;
  return { speaker: mission.passenger as StoryMessage['speaker'], category: 'lore', channel: parcel || mission.beats.pickupSender && id === 'nico-safe-ride' ? 'sender' : 'passenger', text: lines[stage === 'during' ? 0 : 1] };
}
export const rideDialogueIds = Object.freeze(Object.keys(rides));

export function ordinaryDuring(name: string, state: Campaign): string {
  if (state.world.appearance === 'cancelled') return 'They’ve covered the posters at the hotel. My sister was meant to work that reception; she’s waiting to hear about her hours.';
  if (state.world.security === 'suspended') return 'The contractor notice has come down at the café. Still no sign of it opening, though.';
  if (state.world.cafe !== 'open') return 'I used to get breakfast at that café. Boards across the windows now. I’ve had to find somewhere else before work.';
  const index = everydayJobs.findIndex(job => job.name === name);
  return ['Could you leave me by the side entrance? The front door locks before my shift finishes.', 'Please take the corners gently. That box has survived the bus; I’d like it to survive the last street.', 'I nearly took the wrong bus again. It’s easier to ask you than pretend I know where I’m going.', 'My mechanic says it’ll be ready tomorrow. He said that yesterday too.', 'We borrowed the flowers from a neighbour. Now I’ve got to get them home in one piece.'][Math.max(0, index)];
}
