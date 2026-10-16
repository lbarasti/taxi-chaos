import type { Renderer } from './renderer';
import type { Prop } from './world';
import { vec, type Vec } from './physics';
import { artworkImages } from './artwork/images';

/** One continuous roof per merged footprint. Fixtures stay in metres rather than
 * stretching shop sprites (which would also enlarge doors, vents and skylights). */
export function drawCityBuilding(r: Renderer, prop: Prop, shadow: Vec, shadowAlpha: number): boolean {
  const building = prop.building;
  if (!building || building.width === 10 && building.height === 10) return false;
  const c = r.ctx, w = building.width, h = building.height;
  const left = -w / 2, top = -h / 2 - 0.6, right = w / 2, bottom = h / 2;
  const landmark = building.storeys === 8;
  c.save(); c.globalAlpha *= shadowAlpha;
  r.rect(left + shadow.x + 0.8, top + shadow.y + 1.3, w + 0.5, h + 0.5, '#13212880'); c.restore();
  r.rect(left, -h / 2, w, h, '#1d2d33');
  r.rect(left - 0.25, top, w + 0.25, h + 0.6, prop.color, '#a6afa16b');
  r.rect(left + 0.4, top + 0.6, w - 1, h - 0.5, '#1b292f66');
  artworkImages.roof(c, { x: left + 0.4, y: top + 0.6, width: w - 1, height: h - 0.5 });
  // Roof membrane seams and shallow weather marks; independent of gameplay RNG.
  for (let x = left + 0.8; x < right - 0.6; x += 3.6) {
    r.rect(x, top + 0.7, 0.055, h - 1, '#b5b9a329');
    for (let y = top + 1; y < bottom - 1; y += 4.2) {
      r.rect(x + 0.2, y, 2.4, 0.04, '#101d2d40');
      r.rect(x + 0.45, y + 0.8, 1.6, 0.35, '#adc0b007');
    }
  }
  // Parapets and a real-size maintenance walkway around the roof plant.
  r.rect(left + 0.15, top + 0.2, w - 0.35, 0.22, '#a0a69a80');
  r.rect(left + 0.15, top + 0.2, 0.22, h - 0.05, '#a0a69a60');
  r.rect(right - 0.35, top + 0.2, 0.25, h - 0.05, '#111e2c80');
  r.rect(left + 0.1, bottom - 0.65, w - 0.2, 0.45, '#c4bfa36b');
  if (landmark) {
    // Setback upper floors keep whole-block buildings legible as a single mass.
    r.rect(left + 3.4, top + 3.6, w - 6, h - 7, '#13212877');
    r.rect(left + 3, top + 3, w - 6, h - 7, prop.color, '#b4c2b17a');
    r.rect(left + 3.5, top + 3.5, w - 7, h - 8, '#8b9c9c22');
    for (let x = left + 4; x < right - 4; x += 2.3) r.rect(x, bottom - 4.4, 1.2, 0.45, '#d2d6b86b');
  }
  const plantY = top + (landmark ? 4.4 : 1.6);
  for (let x = left + (landmark ? 4.4 : 1.5); x < right - 2.6; x += 5.2) {
    r.rect(x + 0.2, plantY + 0.25, 2.1, 1.6, '#101f2f66');
    r.rect(x, plantY, 1.8, 1.4, '#7c8e8b', '#b7b8a48c');
    r.circle(vec(x + 0.7, plantY + 0.7), 0.46, '#354953');
    r.circle(vec(x + 0.7, plantY + 0.7), 0.18, '#7c8e8b');
    r.rect(x + 1.15, plantY + 0.2, 0.4, 0.95, '#4b6465');
    r.rect(x + 0.75, plantY + 1.4, 0.25, 1.25, '#728582');
  }
  const skylightY = landmark ? top + 9 : h > 10 ? top + 9 : top + 4.7;
  for (let x = left + 1.5; x < right - 2.7; x += 5.2) {
    r.rect(x, skylightY, 2.2, 1.6, '#203742', '#7893918c');
    r.rect(x + 0.15, skylightY + 0.15, 1.9, 1.3, '#8db5bf45');
    r.rect(x + 1, skylightY + 0.1, 0.1, 1.4, '#acc8c280');
  }
  // Street frontage bays: human-scale doors, glazing and awnings on a wider facade.
  for (let x = left + 1; x < right - 2; x += 4.2) {
    r.rect(x, bottom - 0.5, 2.8, 0.45, '#f4cf8b6b');
    r.rect(x + 1.25, bottom - 0.5, 0.12, 0.45, '#293f48');
    r.rect(x - 0.2, bottom - 0.15, 3.2, 0.45, landmark ? '#829fa1' : '#c2aa80');
    r.rect(x, bottom - 0.1, 0.12, 0.4, '#30454c80');
  }
  r.rect(-0.65, bottom - 0.65, 1.3, 0.65, '#182b35');
  r.rect(-0.05, bottom - 0.4, 0.08, 0.3, '#e1d8ad');
  const signWidth = Math.min(14, w - 1.6);
  r.rect(-signWidth / 2, bottom - 2.25, signWidth, 1.05, '#152830dd');
  // Rasterize text at normal font sizes, matching the small shop artwork pass.
  c.save(); c.scale(0.05, 0.05);
  r.label(prop.label, 0, (bottom - 1.72) * 20, Math.min(0.78, signWidth / Math.max(1, prop.label.length * 0.6)) * 20, prop.label === 'HOSPITAL' ? '#b5e0d8' : '#eadab8', '700');
  c.restore();
  if (prop.label === 'HOSPITAL') {
    r.rect(3.4, -2.4, 4.8, 4.8, '#d0dbcb');
    r.rect(5.2, -1.65, 1.2, 3.3, '#b95852'); r.rect(4.15, -0.6, 3.3, 1.2, '#b95852');
  }
  return true;
}
