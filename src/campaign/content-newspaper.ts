import type { CampaignMilestone, NewsArticle, Newspaper } from './model';
import day01 from '../assets/newspapers/day-01.webp';
import day02 from '../assets/newspapers/day-02.webp';
import day03 from '../assets/newspapers/day-03.webp';
import day04 from '../assets/newspapers/day-04.webp';
import day05 from '../assets/newspapers/day-05.webp';
import day06 from '../assets/newspapers/day-06.webp';
import day07 from '../assets/newspapers/day-07.webp';

const daily = (day: number, image: string | undefined, title: string, deck: string, body: readonly string[], imageAlt: string, caption: string): NewsArticle => ({ id: `day-${day}`, section: 'Life on the waterfront', image, title, deck, body, imageAlt, caption });
export const newspaper: Newspaper = {
  masthead: 'The Waterfront Record', byline: 'Iris · City desk',
  daily: [
    daily(1, day01, 'Open Shore promises the ordinary things', 'Beach maintenance, harbour jobs and safer streets lead Vale’s waterfront pitch.', [
      'Adrian Vale is visiting local businesses as Civic Renewal opens its Open Shore campaign. Street lighting, beach access and steady work are the promises being carried along the promenade.',
      'For people who start before sunrise, a working lamp matters more than a new poster. Over the coming days this paper will follow what changes on the waterfront, as well as what is promised for it.',
    ], 'Maintenance workers repair a promenade lamp at sunrise', 'Before the speeches: the waterfront still needs its everyday repairs.'),
    daily(2, day02, 'Temporary barriers, lasting questions', 'Garden Café’s frontage is being cleared while customers try to get through.', [
      'Temporary barriers have been ordered for the Garden Café frontage. The equipment is ordinary enough; for a small business, the position of an entrance can decide whether a customer stops at all.',
      'A delivery form records who ordered something and when it arrived. It does not explain every decision behind it. We are keeping the dates, and asking what the work is meant to achieve.',
    ], 'Delivery barriers and a handcart beside an open waterfront café', 'The café is still open. Barriers alone do not establish wrongdoing.'),
    daily(3, day03, 'Garden Café windows broken overnight', 'Staff shifts cancelled after damage to the waterfront premises.', [
      'Garden Café’s windows were broken overnight. Its staff have lost shifts, and the temporary barriers remain along the frontage.',
      'This paper has not established who caused the damage. The people who normally clean the floors and serve breakfast are already living with its consequences. A photograph can record the broken glass; identifying responsibility takes more than a photograph.',
    ], 'Shattered café windows behind temporary waterfront barriers', 'Overnight damage, before the morning boarding work. No perpetrator has been identified.'),
    daily(4, day04, 'A boarded window does not pay the wages', 'The café’s lost shifts leave workers looking elsewhere for a day’s work.', [
      'Plywood now covers Garden Café’s windows. The cancelled shifts leave workers searching for another address to report to, and regular customers finding somewhere else before work.',
      'The Meridian Site Services notice and temporary barriers remain part of the frontage. Their presence is a fact this paper can record, rather than an explanation for what happened to the windows.',
    ], 'Boarded café windows beside a cleaner’s broom and bucket', 'Closed premises have consequences beyond the owner’s accounts.'),
    daily(5, day05, 'A useful source is only the beginning', 'Inside the city desk, checking the dates takes longer than hearing the rumour.', [
      'The Waterfront Record’s newsroom at Old Town South keeps copies while the originals stay with their owners. Ruth’s first question is usually about a date, a signature or someone who can confirm an account independently.',
      'The work is slower than repeating a rumour. That is the point. A checked source may support a story without settling every allegation in the same envelope.',
    ], 'Telephone, proofs and source envelopes on a local newspaper desk', 'Old Town South: the paper’s small city desk.'),
    daily(6, day06, 'The waterfront takes its paperwork to a hearing', 'Behind the café dispute lie leases, livelihoods and the question of who gets heard.', [
      'The scheduled tenancy hearing has taken place. A hearing can examine a closure notice; it cannot give workers back the shifts they have already lost.',
      'The café’s disputed future sits within a larger waterfront argument. A redevelopment promise sounds different from a committee chair than it does from the doorway of a business that cannot open.',
    ], 'Waiting chairs and a folder outside a municipal hearing building', 'The committee’s decision is recorded separately from the promises made outside.'),
    daily(7, day07, 'Who answers when the waterfront calls?', 'An empty street tells residents little about how patrol cover is assigned.', [
      'Harbour traders depend on someone answering the telephone when trouble starts. An empty corner is visible; the instruction that sent a patrol somewhere else is usually not.',
      'We are asking for records that explain the assignments. A missing patrol is a question, rather than proof of its cause. Call times and signed orders can help turn that question into an account we can check.',
    ], 'An empty patrol parking space beside shuttered harbour shops', 'Cover is a matter of assignments as well as vehicles.'),
    daily(8, undefined, 'One radio, a city of small journeys', 'The dispatch office keeps ordinary work moving between the larger headlines.', [
      'Before the first fare, someone has to answer the telephone. Bea’s dispatch desk connects shifts, deliveries and appointments that never become a campaign speech.',
      'A spare radio and a colleague who can cover an evening are modest ambitions. For a small operator, they can be the difference between a business and a job that never ends.',
    ], 'An old radio, booking slips and tea on a taxi dispatch desk', 'Dispatch continues while the waterfront story develops.'),
    daily(9, undefined, 'The reception needs someone to stack the chairs', 'Hotel staff prepare the waterfront’s public face.', [
      'Civic Renewal’s reception preparations bring chairs, refreshments and staff rotas into the hotels. Victor’s customers expect the doors to open whatever is happening on the campaign telephones.',
      'A venue booking is not evidence of misconduct. It is also work: someone carries the boxes, checks the guest list and waits to hear whether another shift has been added.',
    ], 'Chairs and empty sign stands outside a modest seaside hotel', 'The public appearance depends on work done out of sight.'),
    daily(10, undefined, 'The numbered copy is still on file', 'Public records offer a quieter route through the waterfront argument.', [
      'A register does not raise its voice. A numbered council copy can still say when an agreement was made and whose authority was used.',
      'Tom’s records-desk trips are a reminder that an original document and a photograph of people meeting establish different things. Following an authorisation means checking what it refers to, as well as the signature at the bottom.',
    ], 'A supplier register and carbon copies at a public records counter', 'A filing is a starting point for checking a decision.'),
    daily(11, undefined, 'At the quay, the next shift still starts early', 'Harbour businesses keep working through the redevelopment debate.', [
      'The harbour still needs filters, repairs and deliveries while the waterfront’s future is being discussed elsewhere. The people waiting at a workshop door have an immediate timetable of their own.',
      'Traders do not all want the same future. Their accounts deserve checking on their own terms, including when the person offering a useful record has interests they would rather keep out of the paper.',
    ], 'Working boats, crates and closed workshop doors on the quay', 'The harbour’s daily business continues between the headlines.'),
    daily(12, undefined, 'A quiet departure leaves a long paper trail', 'For a source, reaching a safe address can matter as much as reaching the newsroom.', [
      'Not every important journey ends at a public meeting. A person carrying a record may also need a room, a lift or time away from the people named in it.',
      'This paper will not print a source’s destination to make an account sound more dramatic. An interview is checked independently; a safe address is allowed to remain private.',
    ], 'A suitcase beside a quiet shelter near temporary lodging', 'Illustration: protecting a destination is part of protecting a source.'),
    daily(13, undefined, 'Last chance to make the morning edition', 'The city desk prepares its election-day printing deadline.', [
      'The election-day edition is due tomorrow at 06:00. Source checks take three hours, and a complete story still needs the editor’s approval before it can be scheduled.',
      'A copy left on a desk is not a published finding. The original records will remain in the notebook even if the deadline passes. Tonight, a date matters in a very practical way.',
    ], 'An old printing press feeding a fresh stack of newspapers', 'Tomorrow’s election-day edition closes at 06:00.'),
    daily(14, undefined, 'Polling day waits at the door', 'Stations prepare to open as the waterfront campaign reaches its last day.', [
      'Polling stations are due to open at 07:00. Vale remains the favourite as the city reaches the last day of the Open Shore campaign; this edition makes no prediction about the result.',
      'The waterfront’s shops, jobs and disputed records will still exist after the last election-day booking. People who have an early shift will need a lift, whatever they decide at the ballot box.',
    ], 'A quiet polling-station entrance before its doors open', 'Before opening time: no vote count or election result is implied.'),
  ],
  investigations: {
    coordination: { id: 'closure-investigation', section: 'Investigation / Garden Café', image: undefined,
      title: 'Café closure preparations preceded the damage', deck: 'Independently checked records connect Meridian to arrangements made before the windows were broken.',
      body: ['Records and independent accounts checked by this paper establish preparations for Garden Café’s closure before the overnight damage. The material connects those arrangements to Meridian Site Services.', 'The findings concern the sequence of the closure preparations. They do not identify the person who broke the windows. Meridian’s café security contract remains in place as this report first goes to press.'],
      imageAlt: 'Barrier feet and glass at the threshold of a shuttered café', caption: 'The frontage records the damage. Establishing the chronology required independent sources.' },
    policing: { id: 'patrol-investigation', section: 'Investigation / Patrol cover', image: undefined,
      title: 'Signed orders withdrew waterfront patrol cover', deck: 'Independent records corroborate the reassignment of officers while the waterfront needed cover.',
      body: ['Signed instructions and independent records checked by this paper establish the withdrawal of waterfront patrols under Captain Harker’s authority.', 'The account concerns the orders and the absence of replacement cover. It does not clear other harbour operators of their own offences. The department’s response will follow publication; an inquiry has not yet been recorded in this printing.'],
      imageAlt: 'Patrol reassignment sheets and a log beside a station radio', caption: 'Illustration: signed orders and corroborating records underpin the account.' },
    knowledge: { id: 'warning-investigation', section: 'Investigation / Open Shore', image: undefined,
      title: 'Vale retained Meridian after receiving warning', deck: 'Acknowledged briefing and retained agreement connect the waterfront findings to the candidate’s office.',
      body: ['Independently checked material establishes that Adrian Vale received a warning about Meridian’s closure arrangements and the withdrawal of patrols before retaining the supplier’s agreement.', 'This report follows the paper’s published findings about the café preparations and withdrawn cover. Vale’s waterfront appearance remains booked as this report first goes to press. Any later cancellation is a subsequent event, not a fact this edition can anticipate.'],
      imageAlt: 'An acknowledged briefing folder beside a retained supplier agreement', caption: 'Illustration: the warning and subsequent authorisation establish more than a reception photograph.' },
  },
  briefs: [
    { id: 'tenancy-review', requires: { worldEquals: { key: 'cafe', value: 'tenancy-review' } }, title: 'Tenants secure review', text: 'Garden Café’s closure remains under tenancy review. The boards have not come down.' },
    { id: 'tenancy-closed', requires: { worldEquals: { key: 'cafe', value: 'closed' } }, title: 'Café account closes', text: 'The hearing has not secured a tenancy review. The waterfront loses another working address.' },
    { id: 'contract-suspended', requires: { worldEquals: { key: 'security', value: 'suspended' } }, title: 'Contract suspended', text: 'Following the closure investigation, Meridian’s café security contract has been suspended. The café remains boarded.' },
    { id: 'patrol-inquiry', requires: { worldEquals: { key: 'patrol', value: 'inquiry' } }, title: 'Patrol inquiry opened', text: 'The patrol commander faces an inquiry after publication of the withdrawal records.' },
    { id: 'appearance-cancelled', requires: { worldEquals: { key: 'appearance', value: 'cancelled' } }, title: 'Appearance cancelled', text: 'Civic Renewal has cancelled its waterfront appearance following the paper’s warning and agreement report. Supporters remain divided.' },
  ],
};
export const milestones: readonly CampaignMilestone[] = [
  { requires: { reacted: 'coordination' }, title: 'Meridian’s café contract suspended', text: 'Your reporting helped establish the closure preparations. The café still needs a future.', missedTitle: 'Closure arrangements remained unresolved', missedText: 'No suspension followed a published closure investigation during this campaign.' },
  { requires: { reacted: 'policing' }, title: 'Waterfront patrol inquiry opened', text: 'The signed withdrawals reached print, and the commander faces an inquiry.', missedTitle: 'Patrol orders stayed out of public scrutiny', missedText: 'No inquiry followed a published patrol investigation during this campaign.' },
  { requires: { reacted: 'knowledge' }, title: 'Vale’s waterfront appearance cancelled', text: 'The acknowledged warning and retained agreement became public.', missedTitle: 'Vale’s waterfront appearance remained booked', missedText: 'The warning and retained agreement did not produce a published challenge and response before the deadline.' },
  { requires: { worldEquals: { key: 'cafe', value: 'tenancy-review' } }, title: 'The tenants secured a hearing outcome', text: 'Iris reached the interview, and the café closure remains under review.', missedTitle: 'The café’s tenancy review was not secured', missedText: 'The scheduled hearing ended without that protection for its tenants.' },
  { requires: { flag: 'bea-office-ready' }, title: 'Bea got two evenings back', text: 'A repaired radio and a trained replacement made room for life outside dispatch.', missedTitle: 'Bea’s office still needed its spare pair of hands', missedText: 'The radio repair delivery was not completed during the campaign.' },
  { requires: { flag: 'leila-safe' }, title: 'Leila reached the newsroom', text: 'You took her briefing copy to Iris before her move to a safe address.', missedTitle: 'Leila’s quiet departure was not completed', missedText: 'Her ride to the newsroom was not completed. Independent public records offered another route into the investigation.' },
];
