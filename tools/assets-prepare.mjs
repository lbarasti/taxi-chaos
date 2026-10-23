import { optimizeArtwork } from './artwork-optimize.mjs';
import { prepareArtwork } from './artwork-prep.mjs';
import { withArtworkRuntime } from './artwork-runtime.mjs';

if (process.argv.length > 2) throw new Error('Usage: npm run assets:prepare');
const { decoded, reused } = await withArtworkRuntime(async runtime => {
  await optimizeArtwork(runtime);
  await prepareArtwork(runtime, ['--write']);
});
console.log(`PNG measurements: ${decoded} decoded, ${reused} reused`);
