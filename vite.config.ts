import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

// Tiny single-file build: assets are data URLs, then JS/CSS are placed in the HTML.
// No runtime loader, external font requests, or server dependency in the output.
function standalone(): Plugin {
  return {
    name: 'standalone-html', enforce: 'post', apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const html = bundle['index.html'];
        if (!html || html.type !== 'asset') throw new Error('Missing index.html');
        let source = String(html.source);
        for (const [name, entry] of Object.entries(bundle)) {
          if (entry.type === 'chunk') {
            const tag = new RegExp(`<script[^>]*src="[^\"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*><\\/script>`);
            if (!tag.test(source)) throw new Error(`Unexpected split JS chunk: ${name}`);
            source = source.replace(tag, () => `<script type="module">${entry.code.replace(/<\/script/gi, '<\\/script')}</script>`); delete bundle[name];
          } else if (name.endsWith('.css')) {
            const tag = new RegExp(`<link[^>]*href="[^\"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
            source = source.replace(tag, () => `<style>${String(entry.source)}</style>`); delete bundle[name];
          }
        }
        const license = readFileSync(new URL('./src/assets/OFL.txt', import.meta.url), 'utf8');
        const audioCredits = readFileSync(new URL('./src/assets/audio/CREDITS.md', import.meta.url), 'utf8');
        html.source = `${source}\n<!-- Embedded Space Grotesk font license:\n${license.replace(/--/g, '—')}\n-->\n<!-- Embedded sound FX credits:\n${audioCredits.replace(/--/g, '—')}\n-->`;
        if (Object.keys(bundle).length !== 1) throw new Error('Standalone build has external assets');
      },
    },
  };
}
export default defineConfig({ plugins: [standalone()], build: { target: 'es2022', assetsInlineLimit: 1000000, cssCodeSplit: false }, server: { port: 5173, strictPort: true } });
