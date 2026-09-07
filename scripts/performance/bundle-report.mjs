import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv[2] ?? '.');
const routes = ['home', 'groups/[groupId]', 'groups/[groupId]/matches/new', 'groups/[groupId]/players/[playerId]/analytics', 'login'];
const reports = routes.map(route => {
  const manifestFile = join(root, '.next/server/app', route, 'page_client-reference-manifest.js');
  const context = { globalThis: {} };
  runInNewContext(readFileSync(manifestFile, 'utf8'), context);
  const manifest = Object.values(context.globalThis.__RSC_MANIFEST)[0];
  const paths = new Set(Object.values(manifest.clientModules).flatMap(mod => mod.chunks ?? []).filter(c => typeof c === 'string' && c.endsWith('.js')));
  const chunks = [...paths].map(url => {
    const file = join(root, '.next', url.replace(/^\/_next\//, ''));
    if (!existsSync(file)) throw new Error(`Missing chunk: ${file}`);
    const content = readFileSync(file);
    const text = content.toString();
    return { url, bytes: content.length, gzipBytes: gzipSync(content).length,
      markers: ['ComposedChart', 'Zod', 'RealtimeClient', 'GoTrueClient'].filter(marker => text.includes(marker)) };
  });
  return { route, bytes: chunks.reduce((sum,c) => sum+c.bytes, 0), gzipBytes: chunks.reduce((sum,c) => sum+c.gzipBytes, 0), chunks };
});
console.log(JSON.stringify({ methodology: 'Unique client-reference JavaScript chunks per route; excludes framework runtime, CSS, RSC payload and deferred chunks not referenced by this manifest. Markers are indicative, not exact dependency attribution.', reports }, null, 2));
