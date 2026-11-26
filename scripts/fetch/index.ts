/**
 * Fetch raw sources into data/cache/.
 *   --offline  reuse the cache, fail if it is missing
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { CACHE, exists, pool, readJson, writeJson } from '../lib/util.ts';
import { fetchGithubActivity } from './github.ts';

const offline = process.argv.includes('--offline');
const WEBREF = 'https://raw.githubusercontent.com/w3c/webref/main/ed/';

async function get(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function cached<T>(file: string, load: () => Promise<T>): Promise<T> {
  const path = join(CACHE, file);
  // refs files are keyed by crawl date, so a cached copy is always current
  if (offline || (file.startsWith('refs/') && exists(path))) {
    if (!exists(path)) throw new Error(`offline but ${path} is missing`);
    return readJson(path);
  }
  const data = await load();
  await writeJson(path, data);
  return data;
}

// 1. webref crawl index (built on browser-specs, so it includes groups, repos, series)
const index = await cached('webref-index.json', () => get(WEBREF + 'index.json'));
console.log(`webref: ${index.results.length} specs`);

// 2. per-spec references. Cache by crawl date so unchanged specs are not refetched.
const withRefs = index.results.filter((s: any) => s.refs);
let n = 0;
const refs: Record<string, any> = {};
await pool(withRefs, 16, async (s: any) => {
  const file = `refs/${s.shortname}@${(s.crawled ?? s.date ?? '').toString().slice(0, 10)}.json`;
  try {
    refs[s.shortname] = (await cached(file, () => get(WEBREF + s.refs))).refs;
  } catch (e) {
    console.warn(`  refs failed for ${s.shortname}: ${(e as Error).message}`);
  }
  if (++n % 100 === 0) console.log(`  refs ${n}/${withRefs.length}`);
});
await writeJson(join(CACHE, 'refs.json'), refs);

// 3. web-features (pinned via npm)
const require = createRequire(import.meta.url);
const wf = require('web-features/data.json');
await writeJson(join(CACHE, 'web-features.json'), { features: wf.features, groups: wf.groups });
console.log(`web-features: ${Object.keys(wf.features).length} entries`);

// 4. GitHub activity (optional, needs GITHUB_TOKEN)
const repos = [...new Set(index.results.map((s: any) => s.nightly?.repository).filter(Boolean))] as string[];
if (offline) {
  console.log('github: offline, keeping cached activity');
} else if (process.env.GITHUB_TOKEN) {
  const activity = await fetchGithubActivity(repos, process.env.GITHUB_TOKEN);
  await writeJson(join(CACHE, 'github.json'), activity);
  console.log(`github: activity for ${Object.keys(activity).length} repos`);
} else {
  console.log('github: GITHUB_TOKEN not set, skipping (elevation falls back to reference counts)');
}
