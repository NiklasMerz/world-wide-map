/**
 * Fetch raw sources into data/cache/.
 *   --offline  reuse the cache, fail if it is missing
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { CACHE, exists, pool, readJson, writeJson } from '../lib/util.ts';
import { fetchGithubActivity, type ActivityTarget } from './github.ts';
import { loadOverrides } from '../lib/overrides.ts';
import { fetchW3CGroups } from './w3c.ts';

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

// 4. W3C groups and their (hashed) participants
const w3c = await cached('w3c-groups.json', fetchW3CGroups);
console.log(`w3c: ${w3c.length} open groups`);

// 5. GitHub activity per spec (optional, needs GITHUB_TOKEN)
// One target per spec series, using the current level's repo, source path and label.
const ov = await loadOverrides();
const bySeries = new Map<string, ActivityTarget>();
for (const s of index.results) {
  if (!s.nightly?.repository) continue;
  const key: string = s.series?.shortname ?? s.shortname;
  const isCurrent = (s.series?.currentSpecification ?? s.shortname) === s.shortname;
  if (bySeries.has(key) && !isCurrent) continue;
  bySeries.set(key, { key, repo: s.nightly.repository, sourcePath: s.nightly.sourcePath, label: s.shortname });
}
const targets = [...bySeries.values()];
for (const c of ov.specs) if (c.repo) targets.push({ key: c.id, repo: c.repo, label: c.id });

if (offline) {
  console.log('github: offline, keeping cached activity');
} else if (process.env.GITHUB_TOKEN) {
  const activity = await fetchGithubActivity(targets, process.env.GITHUB_TOKEN);
  await writeJson(join(CACHE, 'github.json'), activity);
  const scopes = Object.values(activity.specs).reduce<Record<string, number>>((m, a) => ((m[`commits:${a.commitScope}`] = (m[`commits:${a.commitScope}`] ?? 0) + 1), (m[`issues:${a.issueScope}`] = (m[`issues:${a.issueScope}`] ?? 0) + 1), m), {});
  console.log(`github: activity for ${Object.keys(activity.specs).length} specs since ${activity.since.slice(0, 10)}`, scopes);
} else {
  console.log('github: GITHUB_TOKEN not set, skipping (elevation falls back to reference counts)');
}
