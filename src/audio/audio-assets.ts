// ?inline forces data URLs in dev AND production. No file:// fetch/CORS dependency.
import engine from '../assets/audio/engine.wav?inline';
import engineLoad from '../assets/audio/engine-load.wav?inline';
import skid from '../assets/audio/skid.wav?inline';
import fire from '../assets/audio/fire.wav?inline';
import siren from '../assets/audio/siren.wav?inline';
import boostLoop from '../assets/audio/boost-loop.wav?inline';
import boostStart from '../assets/audio/boost-start.mp3?inline';
import boostEnd from '../assets/audio/boost-end.mp3?inline';
import bump0 from '../assets/audio/bump-0.mp3?inline';
import bump1 from '../assets/audio/bump-1.mp3?inline';
import crunch0 from '../assets/audio/crunch-0.mp3?inline';
import crunch1 from '../assets/audio/crunch-1.mp3?inline';
import crash0 from '../assets/audio/crash-0.mp3?inline';
import crash1 from '../assets/audio/crash-1.mp3?inline';
import wood0 from '../assets/audio/wood-0.mp3?inline';
import wood1 from '../assets/audio/wood-1.mp3?inline';
import metal0 from '../assets/audio/metal-0.mp3?inline';
import metal1 from '../assets/audio/metal-1.mp3?inline';
import glass0 from '../assets/audio/glass-0.mp3?inline';
import glass1 from '../assets/audio/glass-1.mp3?inline';
import body0 from '../assets/audio/body-0.mp3?inline';
import body1 from '../assets/audio/body-1.mp3?inline';
import explosion0 from '../assets/audio/explosion-0.mp3?inline';
import explosion1 from '../assets/audio/explosion-1.mp3?inline';
import rumble from '../assets/audio/rumble.mp3?inline';
import pulp from '../assets/audio/pulp.mp3?inline';

export const audioAssets = {
  engine, 'engine-load': engineLoad, skid, fire, siren, 'boost-loop': boostLoop, 'boost-start': boostStart, 'boost-end': boostEnd,
  'bump-0': bump0, 'bump-1': bump1, 'crunch-0': crunch0, 'crunch-1': crunch1, 'crash-0': crash0, 'crash-1': crash1,
  'wood-0': wood0, 'wood-1': wood1, 'metal-0': metal0, 'metal-1': metal1, 'glass-0': glass0, 'glass-1': glass1,
  'body-0': body0, 'body-1': body1, 'explosion-0': explosion0, 'explosion-1': explosion1, rumble, pulp,
};
export type AudioAsset = keyof typeof audioAssets;
