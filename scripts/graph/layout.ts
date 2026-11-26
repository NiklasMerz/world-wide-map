/**
 * ForceAtlas2 layout. Intra-cluster edges are boosted so continents stay compact.
 * Seeded from data/layout-seed.json so nightly builds keep the geography stable.
 */
import { join } from 'node:path';
import UndirectedGraph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { BUILD, ROOT, exists, hash, readJson, rng, writeJson } from '../lib/util.ts';
import type { Graph } from '../lib/types.ts';

const SEED_FILE = join(ROOT, 'data', 'layout-seed.json');
const data: Graph = await readJson(join(BUILD, 'graph.json'));
const seed: Record<string, [number, number]> = exists(SEED_FILE) ? await readJson(SEED_FILE) : {};
const byId = new Map(data.nodes.map((n) => [n.id, n]));

const g = new (UndirectedGraph as any)({ type: 'undirected' });

// Initial positions: seed if known; else around the seeded centroid of the continent; else a ring by continent
const r = rng(7);
const contCentroid = new Map<number, [number, number, number]>();
for (const n of data.nodes) {
  const p = seed[n.id];
  if (!p) continue;
  const c = contCentroid.get(n.continent!) ?? [0, 0, 0];
  contCentroid.set(n.continent!, [c[0] + p[0], c[1] + p[1], c[2] + 1]);
}
const nCont = data.continents!.length;
for (const n of data.nodes) {
  let p = seed[n.id];
  if (!p) {
    const c = contCentroid.get(n.continent!);
    const jitter = () => (r() - 0.5) * 20;
    if (c) p = [c[0] / c[2] + jitter(), c[1] / c[2] + jitter()];
    else {
      const a = (n.continent! / nCont) * Math.PI * 2 + (hash(n.id) % 100) / 300;
      const rad = 300 + (n.continent! % 3) * 120;
      p = [Math.cos(a) * rad + jitter(), Math.sin(a) * rad + jitter()];
    }
  }
  g.addNode(n.id, { x: p[0], y: p[1], size: 1 + n.activity });
}

for (const e of data.edges) {
  const a = byId.get(e.source)!, b = byId.get(e.target)!;
  const factor = a.country === b.country ? 4 : a.continent === b.continent ? 1.5 : 0.15;
  g.mergeEdge(e.source, e.target, { weight: e.weight * factor });
}

// Islands (and other disconnected bits) need something to hold them near the mainland:
// a weak tether to their continent's anchor would be circular, so use global gravity instead.
forceAtlas2.assign(g, {
  iterations: Object.keys(seed).length ? 300 : 1200,
  getEdgeWeight: 'weight',
  settings: {
    ...forceAtlas2.inferSettings(g),
    gravity: 1,
    scalingRatio: 8,
    edgeWeightInfluence: 1,
    barnesHutOptimize: true,
    adjustSizes: false,
  },
});

const next: Record<string, [number, number]> = {};
g.forEachNode((id: string, attr: any) => {
  const n = byId.get(id)!;
  n.x = attr.x;
  n.y = attr.y;
  next[id] = [Math.round(attr.x * 100) / 100, Math.round(attr.y * 100) / 100];
});

// Stable key order keeps the seed file diff small
const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
await writeJson(SEED_FILE, sorted, true);
await writeJson(join(BUILD, 'graph.json'), data);
console.log(`layout: ${data.nodes.length} nodes placed (${Object.keys(seed).length ? 'seeded' : 'fresh'})`);
