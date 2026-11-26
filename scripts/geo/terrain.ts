/** Graph positions → fantasy geography as GeoJSON in public/map/. */
import { join } from 'node:path';
import { Delaunay } from 'd3-delaunay';
import { contours } from 'd3-contour';
import { createNoise2D } from 'simplex-noise';
import { BUILD, OUT, readJson, rng, writeJson } from '../lib/util.ts';
import { mergeCells, type Pt, type Ring } from './polygons.ts';
import type { Graph, GraphNode } from '../lib/types.ts';

const W = 1000; // world width in abstract units
const MARGIN = 80;
const CELL = 6; // filler grid spacing
const SPAN = 36; // degrees of longitude the world spans (small, so Mercator distortion is negligible)

const data: Graph = await readJson(join(BUILD, 'graph.json'));
const nodes = data.nodes;
const byId = new Map(nodes.map((n) => [n.id, n]));
const noise = createNoise2D(rng(1234));

// --- drift continents apart so seas open up between them ---------------------------
const EXPLODE = 0.7;
{
  const gx = nodes.reduce((s, n) => s + n.x!, 0) / nodes.length, gy = nodes.reduce((s, n) => s + n.y!, 0) / nodes.length;
  for (const c of data.continents!) {
    const m = nodes.filter((n) => n.continent === c.id);
    const cx = m.reduce((s, n) => s + n.x!, 0) / m.length, cy = m.reduce((s, n) => s + n.y!, 0) / m.length;
    for (const n of m) {
      n.x! += (cx - gx) * EXPLODE;
      n.y! += (cy - gy) * EXPLODE;
    }
  }
}

// --- normalize positions into [MARGIN, W-MARGIN] ---------------------------------
const xs = nodes.map((n) => n.x!), ys = nodes.map((n) => n.y!);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
const scale = (W - 2 * MARGIN) / Math.max(maxX - minX, maxY - minY);
const H = Math.ceil((maxY - minY) * scale + 2 * MARGIN);
for (const n of nodes) {
  n.x = (n.x! - minX) * scale + MARGIN;
  n.y = (n.y! - minY) * scale + MARGIN;
}
const toLngLat = ([x, y]: Pt): Pt => [+(((x - W / 2) / W) * SPAN).toFixed(5), +((-(y - H / 2) / W) * SPAN).toFixed(5)];

// --- land test: near a node, with a noisy radius for natural coasts ---------------
const nodeIndex = Delaunay.from(nodes, (n) => n.x!, (n) => n.y!);
const radius = (n: GraphNode) => 11 + n.activity * 1.8;
function nearest(x: number, y: number): { node: GraphNode; land: boolean } {
  const node = nodes[nodeIndex.find(x, y)];
  const d = Math.hypot(node.x! - x, node.y! - y);
  const wobble = 0.35 * noise(x / 45, y / 45) + 0.15 * noise(x / 12, y / 12);
  return { node, land: d < radius(node) * (1 + wobble) };
}

// --- Voronoi over jittered grid + nodes ------------------------------------------
const jr = rng(99);
const pts: Pt[] = nodes.map((n) => [n.x!, n.y!]);
for (let y = CELL / 2; y < H; y += CELL)
  for (let x = CELL / 2; x < W; x += CELL) pts.push([x + (jr() - 0.5) * CELL * 0.8, y + (jr() - 0.5) * CELL * 0.8]);
const voronoi = Delaunay.from(pts).voronoi([0, 0, W, H]);

const byCountry = new Map<number, Ring[]>();
const byContinent = new Map<number, Ring[]>();
for (let i = 0; i < pts.length; i++) {
  const { node, land } = i < nodes.length ? { node: nodes[i], land: true } : nearest(pts[i][0], pts[i][1]);
  if (!land) continue;
  const cell = voronoi.cellPolygon(i) as Ring | null;
  if (!cell) continue;
  (byCountry.get(node.country!) ?? byCountry.set(node.country!, []).get(node.country!)!).push(cell);
  (byContinent.get(node.continent!) ?? byContinent.set(node.continent!, []).get(node.continent!)!).push(cell);
}

const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
const poly = (rings: Ring[][]) => ({ type: 'MultiPolygon', coordinates: rings.map((p) => p.map((r) => r.map(toLngLat))) });

const countryFeatures = [...byCountry].map(([id, cells]) => {
  const c = data.countries![id];
  return { type: 'Feature', id, properties: { id, continent: c.continent, tint: id % 6 }, geometry: poly(mergeCells(cells)) };
});
const continentFeatures = [...byContinent].map(([id, cells]) => {
  return { type: 'Feature', id, properties: { id }, geometry: poly(mergeCells(cells)) };
});

// --- elevation: activity hills, contoured on a grid --------------------------------
const STEP = 4;
const gw = Math.ceil(W / STEP), gh = Math.ceil(H / STEP);
const elev = new Float64Array(gw * gh);
const SIGMA = 22;
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const x = gx * STEP, y = gy * STEP;
    if (!nearest(x, y).land) { elev[gy * gw + gx] = -1; continue; }
    let h = 0.05;
    for (const n of nodes) {
      const dx = n.x! - x, dy = n.y! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9 * SIGMA * SIGMA) h += n.activity * Math.exp(-d2 / (SIGMA * SIGMA));
    }
    elev[gy * gw + gx] = h * (1 + 0.15 * noise(x / 30, y / 30));
  }
}
const maxElev = Math.max(...elev);
const thresholds = [0.12, 0.22, 0.35, 0.5, 0.68, 0.85].map((t) => t * maxElev);
const contourFeatures = contours().size([gw, gh]).thresholds(thresholds)(Array.from(elev)).map((c, i) => ({
  type: 'Feature',
  properties: { level: i, value: +(c.value / maxElev).toFixed(2) },
  geometry: { type: 'MultiPolygon', coordinates: c.coordinates.map((p) => p.map((r) => r.map(([x, y]) => toLngLat([x * STEP, y * STEP])))) },
}));

// --- roads between countries -----------------------------------------------------
const pair = new Map<string, number>();
for (const e of data.edges) {
  if (e.kind === 'group') continue;
  const a = byId.get(e.source)!.country!, b = byId.get(e.target)!.country!;
  if (a === b) continue;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  pair.set(k, (pair.get(k) ?? 0) + e.weight);
}
const capital = (countryId: number) => byId.get(data.countries![countryId].anchor)!;
const perCountry = new Map<number, number>();
const roadFeatures: any[] = [];
for (const [k, w] of [...pair].sort((a, b) => b[1] - a[1])) {
  if (w < 6) break;
  const [a, b] = k.split('|').map(Number);
  if ((perCountry.get(a) ?? 0) >= 4 || (perCountry.get(b) ?? 0) >= 4) continue;
  perCountry.set(a, (perCountry.get(a) ?? 0) + 1);
  perCountry.set(b, (perCountry.get(b) ?? 0) + 1);
  const p = capital(a), q = capital(b);
  const mx = (p.x! + q.x!) / 2, my = (p.y! + q.y!) / 2;
  const dx = q.x! - p.x!, dy = q.y! - p.y!;
  const bend = 0.18 * (((a * 31 + b) % 2) ? 1 : -1);
  const cx = mx - dy * bend, cy = my + dx * bend;
  const line: Pt[] = [];
  for (let t = 0; t <= 1.0001; t += 1 / 24)
    line.push(toLngLat([(1 - t) ** 2 * p.x! + 2 * (1 - t) * t * cx + t * t * q.x!, (1 - t) ** 2 * p.y! + 2 * (1 - t) * t * cy + t * t * q.y!]));
  const sameContinent = data.countries![a].continent === data.countries![b].continent;
  roadFeatures.push({ type: 'Feature', properties: { weight: w, kind: sameContinent ? 'road' : 'sea-route', from: p.id, to: q.id }, geometry: { type: 'LineString', coordinates: line } });
}

// --- places: specs (cities), groups (guild halls), features (villages) ---------------
const capitals = new Set(data.countries!.map((c) => c.anchor));
const placeFeatures: any[] = [];
for (const n of nodes) {
  placeFeatures.push({
    type: 'Feature',
    id: placeFeatures.length,
    properties: { id: n.id, label: n.label, kind: n.type === 'group' ? 'group' : capitals.has(n.id) ? 'capital' : 'city', activity: +n.activity.toFixed(2), rank: capitals.has(n.id) ? 0 : n.type === 'group' ? 2 : 1 },
    geometry: { type: 'Point', coordinates: toLngLat([n.x!, n.y!]) },
  });
}
const featuresBySpec = new Map<string, number>();
for (const f of data.features) {
  const s = byId.get(f.spec)!;
  const i = featuresBySpec.get(f.spec) ?? 0;
  featuresBySpec.set(f.spec, i + 1);
  const a = i * 2.39996, r = 3 + 1.6 * Math.sqrt(i + 1);
  placeFeatures.push({
    type: 'Feature',
    id: placeFeatures.length,
    properties: { id: `feature:${f.id}`, label: f.name, kind: 'feature', baseline: f.baseline || 'none', rank: 3 },
    geometry: { type: 'Point', coordinates: toLngLat([s.x! + Math.cos(a) * r, s.y! + Math.sin(a) * r]) },
  });
}

// --- labels at cluster centroids -----------------------------------------------------
function centroid(members: GraphNode[]): Pt {
  const w = members.reduce((s, m) => s + 1 + m.activity, 0);
  return [members.reduce((s, m) => s + m.x! * (1 + m.activity), 0) / w, members.reduce((s, m) => s + m.y! * (1 + m.activity), 0) / w];
}
const labelFeatures = [
  ...data.continents!.map((c) => {
    const members = nodes.filter((n) => n.continent === c.id);
    return { type: 'Feature', properties: { kind: c.island ? 'island' : 'continent', subtitle: c.subtitle, size: members.length }, geometry: { type: 'Point', coordinates: toLngLat(centroid(members)) } };
  }),
];

// --- index for the side panel and search -----------------------------------------------
const neighbors = new Map<string, { id: string; w: number }[]>();
for (const e of data.edges) {
  if (e.kind === 'group') continue;
  (neighbors.get(e.source) ?? neighbors.set(e.source, []).get(e.source)!).push({ id: e.target, w: e.weight });
  (neighbors.get(e.target) ?? neighbors.set(e.target, []).get(e.target)!).push({ id: e.source, w: e.weight });
}
const index = {
  generated: new Date().toISOString(),
  continents: data.continents,
  countries: data.countries,
  nodes: Object.fromEntries(nodes.map((n) => [n.id, {
    label: n.label, type: n.type, url: n.url, repo: n.repo, org: n.org, groups: n.groups, status: n.status, standing: n.standing,
    continent: n.continent, country: n.country, features: n.features, at: toLngLat([n.x!, n.y!]),
    neighbors: (neighbors.get(n.id) ?? []).sort((a, b) => b.w - a.w).slice(0, 10).map((x) => x.id),
    members: n.type === 'group' ? nodes.filter((m) => m.groups?.includes(n.label)).map((m) => m.id) : undefined,
  }])),
  features: Object.fromEntries(data.features.map((f) => [f.id, { name: f.name, baseline: f.baseline, spec: f.spec, description: f.description }])),
};

await Promise.all([
  writeJson(join(OUT, 'countries.geojson'), fc(countryFeatures)),
  writeJson(join(OUT, 'continents.geojson'), fc(continentFeatures)),
  writeJson(join(OUT, 'contours.geojson'), fc(contourFeatures)),
  writeJson(join(OUT, 'roads.geojson'), fc(roadFeatures)),
  writeJson(join(OUT, 'places.geojson'), fc(placeFeatures)),
  writeJson(join(OUT, 'labels.geojson'), fc(labelFeatures)),
  writeJson(join(OUT, 'index.json'), index),
]);
const bounds = [toLngLat([0, H]), toLngLat([W, 0])];
await writeJson(join(OUT, 'meta.json'), { bounds });
console.log(`geo: ${countryFeatures.length} countries, ${contourFeatures.length} contour bands, ${roadFeatures.length} roads, ${placeFeatures.length} places → public/map/`);
