/** Two-level Louvain: communities → continents, sub-communities → countries. */
import { join } from 'node:path';
import UndirectedGraph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { BUILD, readJson, rng, writeJson } from '../lib/util.ts';
import type { Graph, GraphNode } from '../lib/types.ts';

const SEED = 42;
const MIN_COUNTRY_SPLIT = 8; // continents smaller than this stay a single country

const data: Graph = await readJson(join(BUILD, 'graph.json'));
const byId = new Map(data.nodes.map((n) => [n.id, n]));

function toGraph(nodeIds: Set<string>) {
  const g = new (UndirectedGraph as any)({ type: 'undirected' });
  for (const id of nodeIds) g.addNode(id);
  for (const e of data.edges)
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) g.mergeEdge(e.source, e.target, { weight: e.weight });
  return g;
}

function communities(nodeIds: Set<string>, resolution: number): Map<string, number> {
  const g = toGraph(nodeIds);
  const assign: Record<string, number> = louvain(g, { resolution, rng: rng(SEED), getEdgeWeight: 'weight' });
  return new Map(Object.entries(assign));
}

/** Most connected spec in a set: the "anchor" used for stable naming. */
function anchorOf(members: GraphNode[]): GraphNode {
  const ids = new Set(members.map((m) => m.id));
  const deg = new Map<string, number>();
  for (const e of data.edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + e.weight);
      deg.set(e.target, (deg.get(e.target) ?? 0) + e.weight);
    }
  }
  const specs = members.filter((m) => m.type === 'spec');
  const pool = specs.length ? specs : members;
  return pool.reduce((a, b) => ((deg.get(b.id) ?? 0) > (deg.get(a.id) ?? 0) || ((deg.get(b.id) ?? 0) === (deg.get(a.id) ?? 0) && b.id < a.id) ? b : a));
}

function subtitleOf(members: GraphNode[]): string {
  const count = new Map<string, number>();
  for (const m of members) for (const g of m.groups ?? []) count.set(g, (count.get(g) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2);
  return top.map(([g]) => g).join(' · ');
}


// --- continents ---
const all = new Set(data.nodes.map((n) => n.id));
const cont = communities(all, 1.0);
const contMembers = new Map<number, GraphNode[]>();
for (const [id, c] of cont) {
  if (!contMembers.has(c)) contMembers.set(c, []);
  contMembers.get(c)!.push(byId.get(id)!);
}

// Order by size so ids are meaningful (0 = biggest continent)
const ordered = [...contMembers.values()].sort((a, b) => b.length - a.length || anchorOf(a).id.localeCompare(anchorOf(b).id));
data.continents = [];
data.countries = [];
let countryId = 0;
ordered.forEach((members, ci) => {
  const anchor = anchorOf(members);
  data.continents!.push({
    id: ci,
    island: members.length < 3,
    anchor: anchor.id,
    subtitle: subtitleOf(members),
  });
  for (const m of members) m.continent = ci;

  // --- countries inside the continent ---
  let sub: Map<string, number>;
  if (members.length < MIN_COUNTRY_SPLIT) sub = new Map(members.map((m) => [m.id, 0]));
  else sub = communities(new Set(members.map((m) => m.id)), 1.0);
  const subMembers = new Map<number, GraphNode[]>();
  for (const [id, s] of sub) {
    if (!subMembers.has(s)) subMembers.set(s, []);
    subMembers.get(s)!.push(byId.get(id)!);
  }
  for (const cm of [...subMembers.values()].sort((a, b) => b.length - a.length)) {
    const a = anchorOf(cm);
    data.countries!.push({
      id: countryId,
      continent: ci,
      anchor: a.id,
      subtitle: subtitleOf(cm),
    });
    for (const m of cm) m.country = countryId;
    countryId++;
  }
});

await writeJson(join(BUILD, 'graph.json'), data);
const islands = data.continents.filter((c) => c.island).length;
console.log(`cluster: ${data.continents.length - islands} continents, ${islands} islands, ${data.countries.length} countries`);
for (const c of data.continents.slice(0, 10)) {
  const size = data.nodes.filter((n) => n.continent === c.id).length;
  console.log(`  #${String(c.id).padEnd(3)} ${String(size).padStart(4)} nodes  anchor=${c.anchor}  (${c.subtitle})`);
}
