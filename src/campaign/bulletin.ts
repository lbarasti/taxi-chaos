import type { Campaign } from './state';

/** Public coverage is distinct from the later physical/institutional response. */
export function cityBulletin(state: Campaign): string {
  const published = state.publications.map(p => p.allegation), w = state.world;
  if (w.appearance === 'cancelled') return 'Civic Renewal cancels waterfront appearance after the paper publishes Vale’s acknowledged warning and retained Meridian agreement. Supporters remain divided.';
  if (published.includes('knowledge')) return 'Paper publishes Vale’s acknowledged warning and retained Meridian agreement. Civic Renewal has yet to respond; the waterfront appearance remains booked.';
  if (w.patrol === 'inquiry') return 'Patrol commander faces inquiry over withdrawn waterfront cover. Vale promises an independent review; campaign appearances continue.';
  if (published.includes('policing')) return 'Paper publishes the signed waterfront patrol withdrawals. Department response is expected later this morning.';
  if (w.security === 'suspended') return 'Meridian’s café security contract is suspended following the paper’s account of planned closures and damage. The boards remain; the contractor notice has come down.';
  if (published.includes('coordination')) return 'Meridian faces questions over planned closures and waterfront damage. The café security contract remains in place pending a response.';
  if (w.polls || state.finished) return `Polling stations open. Vale remains the favourite. ${w.cafe === 'tenancy-review' ? 'Garden Café tenants secured a hearing; their closure remains under review.' : 'Open Shore reception preparations continue; redevelopment surveys proceed.'}`;
  if (w.operator === 'preferred') return 'Civic Renewal announces preferred waterfront operator talks. Open Shore signs appear at hotels and beach properties.';
  if (w.hearing === 'held') return w.cafe === 'tenancy-review' ? 'Garden Café tenants contest their closure notice. Shutters remain up while the tenancy is disputed.' : 'Another waterfront account closes. Meridian announces expanded security cover.';
  if (w.cafe === 'boarded') return 'Garden Café windows broken overnight. Staff shifts cancelled. Campaign posters promise to restore waterfront order.';
  // The night-time incident is backstage until morning; the site can be inspected directly.
  return 'Open Shore launch: beach maintenance, harbour jobs and safer streets. Adrian Vale visits local businesses as the campaign opens.';
}
