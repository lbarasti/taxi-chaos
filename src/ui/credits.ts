// Credits page data. Standalone builds also embed src/assets/audio/CREDITS.md
// and src/assets/OFL.txt as HTML comments (see vite.config.ts).
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const link = (label: string, href: string) => `<a href="${href}" target="_blank" rel="noopener">${escape(label)}</a>`;

const LICENCE_URL = { CC0: 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/' } as const;

// Sound samples, grouped by the role each one plays in the mix.
type AudioCredit = { role: string; label: string; href: string; licence: keyof typeof LICENCE_URL };
export const audioCredits: readonly AudioCredit[] = [
  { role: 'Player engine (interior)', label: 'Nox Sound Design', href: 'https://freesound.org/people/Nox_Sound/sounds/522223/', licence: 'CC0' },
  { role: 'Player engine (exterior)', label: 'Nox Sound Design', href: 'https://freesound.org/people/Nox_Sound/sounds/522225/', licence: 'CC0' },
  { role: 'Traffic engine & horns', label: 'GGBotNet', href: 'https://opengameart.org/content/car-sound-effects-pack-low-quality', licence: 'CC0' },
  { role: 'Impacts & explosions', label: 'Kenney', href: 'https://kenney.nl/assets', licence: 'CC0' },
  { role: 'Sirens', label: 'aquinn', href: 'https://opengameart.org/content/sirens-and-alarm-noise', licence: 'CC0' },
  { role: 'Tyres', label: 'audible-edge / Tom Haigh, loop by qubodup', href: 'https://opengameart.org/content/car-tire-squeal-skid-loop', licence: 'CC BY 3.0' },
  { role: 'Boost', label: 'Iwan Gabovitch / qubodup', href: 'https://opengameart.org/content/racing-speed-boost-sound', licence: 'CC BY 3.0' },
  { role: 'Fire', label: 'qubodup', href: 'https://opengameart.org/content/fire-loop', licence: 'CC BY 3.0' },
];

const row = (role: string, value: string, tag = '') =>
  `<div class="credit-row"><dt>${escape(role)}</dt><dd>${value}${tag ? ` <span class="credit-tag">${escape(tag)}</span>` : ''}</dd></div>`;
const section = (id: string, title: string, rows: string, notes = '') =>
  `<section class="credits-section" aria-labelledby="${id}"><h3 class="credits-title" id="${id}">${escape(title)}</h3><dl class="credits-list">${rows}</dl>${notes}</section>`;

// The Credits page. Content is grouped by discipline, the way film and game
// credits list who did what, and preserves every source link and licence.
export function creditsMarkup() {
  const soundRows = audioCredits.map(credit => row(credit.role, link(credit.label, credit.href), credit.licence)).join('');
  return `<p class="intro-copy">Taxi Chaos is original work rolling on parts other people shared. Credits are grouped by craft.</p>
    ${section('credits-physics', 'Driving physics',
      row('Physics foundation', link("Pat Kerr's Motion Lab v0.8.2", 'https://patkerr.co.uk/motion-lab/')),
      '<p class="credit-note">Driving and rigid-body fundamentals are adapted from Pat Kerr\u2019s Motion Lab v0.8.2. The city generation, traffic, missions and destruction are Taxi Chaos\u2019 own.</p>')}
    ${section('credits-sound', 'Sound FX', soundRows,
      `<p class="credit-note">Materials are used under ${link('CC0', LICENCE_URL.CC0)} and ${link('CC BY 3.0', LICENCE_URL['CC BY 3.0'])}. Samples edited for mono, loudness, loop seams and size; pitch/filter changes in-game.</p>
      <p class="credit-note">Pickup, payment, purchase, repair, escape and arrest cues are short procedural Web Audio tones created for Taxi Chaos. No music or voice recordings are included.</p>`)}
    ${section('credits-type', 'Typography',
      row('Typeface', `${link('Space Grotesk', 'https://fonts.google.com/specimen/Space+Grotesk')} by Florian Karsten`),
      `<p class="credit-note">Distributed under the ${link('SIL Open Font License 1.1', 'https://github.com/floriankarsten/space-grotesk/blob/master/OFL.txt')} and embedded in the standalone build.</p>`)}
    ${section('credits-art', 'Art & characters',
      row('City art', 'Drawn procedurally, not texture-based.') +
      row('Portraits', 'User-supplied PNG portraits for the Open Shore cast, plus the bundled officer portrait.') +
      row('Legacy placeholders', 'Mia and Frankie keep their stable ids on original neutral placeholder cards (legacy-mia.png, legacy-frankie.png) created for Taxi Chaos; no supplied portrait art is shipped for them.'),
      '<p class="credit-note">Every portrait is bundled inline as a WebP data URL derived from its full-resolution master, with no external image service.</p>')}`;
}
