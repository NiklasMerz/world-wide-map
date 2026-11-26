/** Normalize cached sources into data/build/graph.json (one node per spec series, plus group nodes). */
import { join } from 'node:path';
import { BUILD, CACHE, exists, normUrl, readJson, writeJson } from '../lib/util.ts';
import { loadOverrides } from '../lib/overrides.ts';
import type { Feature, Graph, GraphEdge, GraphNode } from '../lib/types.ts';

const index = await readJson(join(CACHE, 'webref-index.json'));
const refs: Record<string, any> = await readJson(join(CACHE, 'refs.json'));
const wf = await readJson(join(CACHE, 'web-features.json'));
const github: Record<string, any> = exists(join(CACHE, 'github.json')) ? await readJson(join(CACHE, 'github.json')) : {};
const ov = await loadOverrides();
const excluded = new Set(ov.exclude);

// --- spec series nodes -------------------------------------------------------
const nodes = new Map<string, GraphNode>();
const urlToSeries = new Map<string, string>(); // normalized url -> series id
const specToSeries = new Map<string, string>(); // spec shortname -> series id

for (const s of index.results) {
  const id: string = s.series?.shortname ?? s.shortname;
  if (excluded.has(id)) continue;
  specToSeries.set(s.shortname, id);
  for (const u of [s.url, s.nightly?.url, s.release?.url, ...(s.nightly?.alternateUrls ?? []), s.series?.nightlyUrl, s.series?.releaseUrl])
    if (u) urlToSeries.set(normUrl(u), id);
  urlToSeries.set(normUrl(`https://www.w3.org/TR/${s.shortname}/`), id);

  // Prefer the current level's metadata for the series node
  const isCurrent = s.series?.currentSpecification === s.shortname || !nodes.has(id);
  if (!isCurrent) continue;
  nodes.set(id, {
    id,
    type: 'spec',
    label: s.series?.shortTitle ?? s.shortTitle ?? s.title,
    url: s.series?.nightlyUrl ?? s.nightly?.url ?? s.url,
    repo: s.nightly?.repository,
    org: s.organization,
    groups: (s.groups ?? []).map((g: any) => g.name),
    standing: s.standing,
    status: s.nightly?.status,
    features: [],
    activity: 0,
  });
}

/** Resolve a URL to a series, falling back to the longest known URL prefix (e.g. HTML multipage). */
const knownUrls = [...urlToSeries.keys()].sort((a, b) => b.length - a.length);
function resolve(u: string | undefined): string | undefined {
  if (!u) return undefined;
  const n = normUrl(u.split('#')[0]);
  return urlToSeries.get(n) ?? urlToSeries.get(knownUrls.find((k) => n.startsWith(k + '/')) ?? '');
}

// --- edges -------------------------------------------------------------------
const edges = new Map<string, GraphEdge>();
function addEdge(a: string, b: string, weight: number, kind: GraphEdge['kind']) {
  if (a === b || !nodes.has(a) || !nodes.has(b)) return;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const e = edges.get(key);
  if (e) {
    // keep the strongest kind, sum weights across levels of a series
    e.weight = Math.max(e.weight, weight);
    if (kind === 'normative') e.kind = kind;
  } else edges.set(key, { source: a < b ? a : b, target: a < b ? b : a, weight, kind });
}

let unresolved = 0;
for (const [shortname, r] of Object.entries(refs)) {
  const from = specToSeries.get(shortname);
  if (!from) continue;
  for (const ref of r.normative ?? []) {
    const to = resolve(ref.url);
    to ? addEdge(from, to, 3, 'normative') : unresolved++;
  }
  for (const ref of r.informative ?? []) {
    const to = resolve(ref.url);
    to ? addEdge(from, to, 1, 'informative') : unresolved++;
  }
}

// group nodes: a spec belongs to its working/community groups
for (const n of [...nodes.values()]) {
  for (const g of n.groups ?? []) {
    const gid = `group:${g}`;
    if (!nodes.has(gid)) nodes.set(gid, { id: gid, type: 'group', label: g, org: n.org, activity: 0 });
    addEdge(n.id, gid, 2, 'group');
  }
}

for (const l of ov.links) addEdge(l.source, l.target, l.weight ?? 2, 'override');

// --- web-features ------------------------------------------------------------
const features: Feature[] = [];
for (const [id, f] of Object.entries<any>(wf.features)) {
  if (f.kind !== 'feature' || !f.spec) continue;
  const specUrls: string[] = Array.isArray(f.spec) ? f.spec : [f.spec];
  const series = specUrls.map(resolve).find(Boolean);
  if (!series) continue;
  features.push({ id, name: f.name, description: f.description, baseline: f.status?.baseline ?? false, spec: series });
  nodes.get(series)!.features!.push(id);
}

// --- activity ----------------------------------------------------------------
const degree = new Map<string, number>();
for (const e of edges.values()) {
  if (e.kind === 'group') continue;
  degree.set(e.target, (degree.get(e.target) ?? 0) + e.weight);
  degree.set(e.source, (degree.get(e.source) ?? 0) + e.weight * 0.3);
}
const hasGithub = Object.keys(github).length > 0;
for (const n of nodes.values()) {
  const gh = n.repo ? github[n.repo.toLowerCase().replace(/\/$/, '')] : undefined;
  n.activity = hasGithub
    ? Math.log1p((gh?.commits90d ?? 0) + (gh?.issues90d ?? 0))
    : Math.log1p(degree.get(n.id) ?? 0) + Math.log1p(n.features?.length ?? 0);
}

const graph: Graph = { nodes: [...nodes.values()], edges: [...edges.values()], features };
await writeJson(join(BUILD, 'graph.json'), graph);
const specCount = graph.nodes.filter((n) => n.type === 'spec').length;
console.log(
  `graph: ${specCount} spec series, ${graph.nodes.length - specCount} groups, ${graph.edges.length} edges, ` +
    `${features.length} features (${unresolved} refs outside the spec set)`,
);
