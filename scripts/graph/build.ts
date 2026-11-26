/** Normalize cached sources into data/build/graph.json (one node per spec series, plus group nodes). */
import { join } from 'node:path';
import { BUILD, CACHE, exists, normUrl, readJson, writeJson } from '../lib/util.ts';
import { loadOverrides } from '../lib/overrides.ts';
import type { Feature, Graph, GraphEdge, GraphNode } from '../lib/types.ts';
import type { W3CGroup } from '../fetch/w3c.ts';

const index = await readJson(join(CACHE, 'webref-index.json'));
const refs: Record<string, any> = await readJson(join(CACHE, 'refs.json'));
const wf = await readJson(join(CACHE, 'web-features.json'));
const github: Record<string, any> = exists(join(CACHE, 'github.json')) ? await readJson(join(CACHE, 'github.json')) : {};
const w3c: W3CGroup[] = exists(join(CACHE, 'w3c-groups.json')) ? await readJson(join(CACHE, 'w3c-groups.json')) : [];
const ov = await loadOverrides();
const excluded = new Set(ov.exclude);
const allSeries = new Set<string>(index.results.map((s: any) => s.series?.shortname ?? s.shortname));

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

// --- curated specs browser-specs doesn't track ---------------------------------------
for (const s of ov.specs) {
  if (nodes.has(s.id)) throw new Error(`specs.yaml: "${s.id}" already exists in browser-specs, remove it from specs.yaml`);
  nodes.set(s.id, { id: s.id, type: 'spec', label: s.title, url: s.url, repo: s.repo, org: s.org, groups: s.groups ?? [], features: [], activity: 0, curated: true });
  urlToSeries.set(normUrl(s.url), s.id);
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

// --- groups --------------------------------------------------------------------
// Every open W3C group becomes a node; groups only named by specs (WHATWG, TC39, …) are added too.
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const w3cByName = new Map(w3c.map((g) => [normName(g.name), g]));
function groupNode(name: string, org?: string): string {
  const api = w3cByName.get(normName(name));
  const gid = `group:${api?.name ?? name}`;
  if (!nodes.has(gid))
    nodes.set(gid, {
      id: gid,
      type: 'group',
      label: api?.name ?? name,
      org: api ? 'W3C' : org,
      url: api?.homepage,
      groupType: api?.type ?? 'other',
      description: api?.description,
      participants: api?.participants.length,
      activity: 0,
    });
  return gid;
}
for (const g of w3c) groupNode(g.name);
for (const n of [...nodes.values()]) {
  if (n.type !== 'spec') continue;
  n.groups = (n.groups ?? []).map((g) => nodes.get(groupNode(g, n.org))!.label);
  for (const g of n.groups) addEdge(n.id, `group:${g}`, 2, 'group');
}

// Groups that share participants are neighbours. Cosine similarity of the participant sets;
// each group keeps its strongest few links so big groups don't connect to everything.
const PEOPLE_TOP_K = 3, PEOPLE_MIN_SHARED = 3;
const sets = w3c.filter((g) => g.participants.length).map((g) => ({ id: `group:${g.name}`, set: new Set(g.participants) }));
const best = new Map<string, { other: string; shared: number; cos: number }[]>();
for (let i = 0; i < sets.length; i++) {
  for (let j = i + 1; j < sets.length; j++) {
    const [a, b] = sets[i].set.size < sets[j].set.size ? [sets[i], sets[j]] : [sets[j], sets[i]];
    let shared = 0;
    for (const p of a.set) if (b.set.has(p)) shared++;
    if (shared < PEOPLE_MIN_SHARED) continue;
    const cos = shared / Math.sqrt(a.set.size * b.set.size);
    for (const [x, y] of [[a.id, b.id], [b.id, a.id]]) (best.get(x) ?? best.set(x, []).get(x)!).push({ other: y, shared, cos });
  }
}
let peopleEdges = 0;
for (const [id, list] of best) {
  for (const l of list.sort((p, q) => q.cos - p.cos).slice(0, PEOPLE_TOP_K)) {
    const before = edges.size;
    addEdge(id, l.other, +(0.5 + 3 * l.cos).toFixed(2), 'people');
    if (edges.size > before) peopleEdges++;
  }
}

// --- curated links (fail loudly on typos) --------------------------------------------
const unknown = [
  ...ov.links.flatMap((l) => [l.source, l.target]).filter((id) => !nodes.has(id)).map((id) => `links.yaml: unknown id "${id}"`),
  ...ov.exclude.filter((id) => !allSeries.has(id)).map((id) => `exclude.yaml: unknown id "${id}"`),
];
if (unknown.length) throw new Error(`overrides reference ids that are not on the map:\n  ${unknown.join('\n  ')}`);
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
  if (n.type === 'group') {
    n.activity = 0.6 * Math.log1p(n.participants ?? 0);
    continue;
  }
  const gh = n.repo ? github[n.repo.toLowerCase().replace(/\/$/, '')] : undefined;
  n.activity = hasGithub
    ? Math.log1p((gh?.commits90d ?? 0) + (gh?.issues90d ?? 0))
    : Math.log1p(degree.get(n.id) ?? 0) + Math.log1p(n.features?.length ?? 0);
  // curated specs have no crawled references, so give them a floor to keep them visible
  if (n.curated) n.activity = Math.max(n.activity, 1.5);
}

const graph: Graph = { nodes: [...nodes.values()], edges: [...edges.values()], features };
await writeJson(join(BUILD, 'graph.json'), graph);
const specCount = graph.nodes.filter((n) => n.type === 'spec').length;
console.log(
  `graph: ${specCount} spec series (${ov.specs.length} curated), ${graph.nodes.length - specCount} groups, ` +
    `${graph.edges.length} edges (${peopleEdges} shared-participant links), ` +
    `${features.length} features (${unresolved} refs outside the spec set)`,
);
