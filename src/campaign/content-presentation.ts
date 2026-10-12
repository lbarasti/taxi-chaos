import type { ConditionalText, SceneLayer, ScenePrimitive } from './model';
import type { Condition } from '../missions/schema';

/** Open Shore coverage and scene art. Priority is authored array order. */
const world = (key: string, value: string | boolean): Condition => ({ worldEquals: { key, value } });
export const bulletins: readonly ConditionalText[] = [
  { requires: world('appearance', 'cancelled'), text: 'Civic Renewal cancels waterfront appearance after the paper publishes Vale’s acknowledged warning and retained Meridian agreement. Supporters remain divided.' },
  { requires: { published: 'knowledge' }, text: 'Paper publishes Vale’s acknowledged warning and retained Meridian agreement. Civic Renewal has yet to respond; the waterfront appearance remains booked.' },
  { requires: world('patrol', 'inquiry'), text: 'Patrol commander faces inquiry over withdrawn waterfront cover. Vale promises an independent review; campaign appearances continue.' },
  { requires: { published: 'policing' }, text: 'Paper publishes the signed waterfront patrol withdrawals. Department response is expected later this morning.' },
  { requires: world('security', 'suspended'), text: 'Meridian’s café security contract is suspended following the paper’s account of planned closures and damage. The boards remain; the contractor notice has come down.' },
  { requires: { published: 'coordination' }, text: 'Meridian faces questions over planned closures and waterfront damage. The café security contract remains in place pending a response.' },
  { requires: { all: [world('polls', true), world('cafe', 'tenancy-review')] }, text: 'Polling stations open. Vale remains the favourite. Garden Café tenants secured a hearing; their closure remains under review.' },
  { requires: world('polls', true), text: 'Polling stations open. Vale remains the favourite. Open Shore reception preparations continue; redevelopment surveys proceed.' },
  { requires: world('operator', 'preferred'), text: 'Civic Renewal announces preferred waterfront operator talks. Open Shore signs appear at hotels and beach properties.' },
  { requires: { all: [world('hearing', 'held'), world('cafe', 'tenancy-review')] }, text: 'Garden Café tenants contest their closure notice. Shutters remain up while the tenancy is disputed.' },
  { requires: world('hearing', 'held'), text: 'Another waterfront account closes. Meridian announces expanded security cover.' },
  { requires: world('cafe', 'boarded'), text: 'Garden Café windows broken overnight. Staff shifts cancelled. Campaign posters promise to restore waterfront order.' },
  { text: 'Open Shore launch: beach maintenance, harbour jobs and safer streets. Adrian Vale visits local businesses as the campaign opens.' },
];
export const ordinaryResponses: readonly ConditionalText[] = [
  { requires: world('appearance', 'cancelled'), text: 'They’ve covered the posters at the hotel. My sister was meant to work that reception; she’s waiting to hear about her hours.' },
  { requires: world('security', 'suspended'), text: 'The contractor notice has come down at the café. Still no sign of it opening, though.' },
  { requires: { not: world('cafe', 'open') }, text: 'I used to get breakfast at that café. Boards across the windows now. I’ve had to find somewhere else before work.' },
];
const rect = (x: number, y: number, w: number, h: number, color: string): ScenePrimitive => ({ rect: [x, y, w, h, color] });
const label = (text: string, x: number, y: number, size: number, color: string, weight = '700'): ScenePrimitive => ({ label: [text, x, y, size, color, weight] });
const closed: Condition = { not: world('cafe', 'open') };
export const scenes: readonly SceneLayer[] = [
  { site: 'cafe', rotate: true, shapes: [rect(-4.1, 2.6, 8.2, 1.4, '#223b3c'), label('GARDEN CAFÉ', 0, 3.3, 0.7, '#f0dfb7')] },
  { site: 'cafe', rotate: true, requires: world('cafe', 'broken'), shapes: [-3.5, -1.2, 1.1, 3.4].flatMap(x => [rect(x - 0.8, -4.1, 1.6, 1.7, '#151e27'), label('×', x, -3.2, 1, '#b5d3dd', '400')]) },
  { site: 'cafe', rotate: true, requires: { all: [closed, { not: world('cafe', 'broken') }] }, shapes: [-3.5, -1.2, 1.1, 3.4].flatMap(x => [rect(x - 0.8, -4.1, 1.6, 1.7, '#856f55'), rect(x - 0.8, -3.5, 1.6, 0.16, '#c3aa80')]) },
  { site: 'cafe', rotate: true, requires: closed, shapes: [rect(-4, 4.4, 8, 0.9, '#76654c')] },
  ...[
    { condition: world('security', 'suspended'), text: 'CONTRACT SUSPENDED' },
    { condition: { all: [{ not: world('security', 'suspended') }, world('cafe', 'tenancy-review')] }, text: 'TENANCY UNDER REVIEW' },
    { condition: { all: [{ not: world('security', 'suspended') }, world('cafe', 'closed')] }, text: 'ACCOUNT CLOSED / MERIDIAN' },
    { condition: { all: [{ not: world('security', 'suspended') }, { not: { any: [world('cafe', 'tenancy-review'), world('cafe', 'closed')] } }] }, text: 'MERIDIAN SITE SERVICES' },
  ].map(({ condition, text }): SceneLayer => ({ site: 'cafe', rotate: true, requires: { all: [closed, condition as Condition] }, shapes: [label(text, 0, 5.8, 0.55, '#e9c788')] })),
  { site: 'cafe', rotate: true, requires: { all: [{ flag: 'vale-road-reported' }, { shiftAtLeast: 2 }] }, shapes: [rect(-7, -4, 1.5, 7, '#566564'), label('REPAIRED', -6.3, 4.2, 0.45, '#b6c7b8', '400')] },
  { vehicle: 'campaign-ms14', shapes: [label('MERIDIAN / MS-14', 0, -2, 0.48, '#f0dfb7')] },
  { site: 'newsroom', shapes: [rect(-4, 2.5, 8, 1.5, '#47384f'), label('CITY DESK', 0, 3.2, 0.7, '#e4d8ee')] },
  { site: 'hotel', requires: world('appearance', 'cancelled'), shapes: [rect(-4, 4.4, 8, 1.5, '#665f59'), label('APPEARANCE CANCELLED', 0, 5.1, 0.52, '#eee6c8')] },
  { site: 'hotel', requires: { not: world('appearance', 'cancelled') }, shapes: [rect(-4, 4.4, 8, 1.5, '#355d60')] },
  { site: 'hotel', requires: { all: [{ not: world('appearance', 'cancelled') }, world('operator', 'preferred')] }, shapes: [label('OPEN SHORE / VALE', 0, 5.1, 0.52, '#eee6c8')] },
  { site: 'hotel', requires: { all: [{ not: world('appearance', 'cancelled') }, { not: world('operator', 'preferred') }] }, shapes: [label('CIVIC RENEWAL', 0, 5.1, 0.52, '#eee6c8')] },
];
