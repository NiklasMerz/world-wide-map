# How the map is built

Nobody draws the continents. They come out of the connections between specs and groups. The pipeline runs in four steps, each a script in `scripts/`:

```
graph ─▶ cluster ─▶ layout ─▶ geo
```

For adding specs, links or exclusions, see [CONTRIBUTING.md](../CONTRIBUTING.md#overrides).

## 1. Graph

`scripts/graph/build.ts` → `data/build/graph.json`

The graph has one node per spec series and one per group. Edges are weighted:

| Edge | Weight |
|---|---|
| Informative reference (webref) | 1 |
| Spec ↔ its group | 2 |
| Normative reference (webref) | 3 |
| Groups sharing participants (W3C API) | 0.5 – 3.5 |
| Curated link (`links.yaml`) | 1 – 5, default 2 |

If two edges connect the same nodes, the higher weight wins.

## 2. Continents and countries

`scripts/graph/cluster.ts`

- [Louvain community detection](https://en.wikipedia.org/wiki/Louvain_method) runs on the whole weighted graph (resolution 1.0, fixed seed 42). Each community becomes a **continent**.
- Communities with fewer than 3 nodes are marked as **islands**.
- Louvain runs a second time inside each continent to split it into **countries**. Continents with fewer than `MIN_COUNTRY_SPLIT` (8) nodes stay a single country.
- Continents are numbered by size, so 0 is the biggest. Each continent and country gets:
  - an **anchor**: its most connected spec, used for naming;
  - a **subtitle**: its two most common groups.

Because the seed is fixed, the same graph always gives the same clusters.

## 3. Positions

`scripts/graph/layout.ts`

[ForceAtlas2](https://graphology.github.io/standard-library/layout-forceatlas2.html) places the nodes. Edge weights are scaled before the layout runs, so continents stay compact and drift apart from each other:

| Edge | Factor |
|---|---|
| Inside a country | × 4 |
| Inside a continent | × 1.5 |
| Between continents | × 0.15 |

**Starting positions**

- **First build (no seed file):** each continent gets its own slice of angle on a ring around the centre, at a radius of 300, 420 or 540, with some jitter. ForceAtlas2 then runs for 1200 iterations.
- **Later builds:** nodes start where `data/layout-seed.json` last put them. A node that isn't in the seed yet starts near the centre of its continent's existing nodes. ForceAtlas2 runs for 300 iterations.

Every run writes the final positions back to `data/layout-seed.json`. That is how the geography stays stable from one scheduled build to the next. CI keeps its own copy between runs, and the committed file is the fallback.

## 4. Land

`scripts/geo/terrain.ts` → `public/map/*.geojson`

1. **Seas:** each continent is pushed 70% further from the centre of the map (`EXPLODE`), which opens up seas between continents.
2. **Coasts:** a point counts as land if it lies within a radius of its nearest node. The radius grows with the node's activity and is wobbled with simplex noise for natural coastlines.
3. **Shapes:** the space is cut into Voronoi cells over a jittered grid. Land cells are merged into polygons by continent and country (`scripts/geo/polygons.ts`).
4. **Details:** activity becomes hills. Elevation is split into six bands by share of the land: the lowest 40% stays green lowland, and the highest 2.5% is dark brown peak, like the tints on an old school atlas. Specs become cities, groups become guild halls and features become villages.

### Flight and ferry routes

Routes show connections between **countries**, not between single specs. A spec's own connections are listed in the side panel. Routes don't follow the terrain: they are curves drawn straight from one capital to the other, like flight paths on an airline map.

1. Every edge between two different countries adds its weight to that country pair. Spec ↔ group edges are skipped, because they only say who owns what.
2. Pairs are taken strongest first. A pair needs a total weight of at least 6, and each country gets at most 4 routes, so the strongest connections win.
3. A route runs between the two countries' capitals (their anchor specs) as a gentle curve. The curve bends left or right depending on the pair, so parallel routes don't overlap.
4. A route between two countries on the same continent is a solid **flight** line. A route between continents is a dashed **ferry** line.
5. Routes appear from zoom 3.5. They get wider with the square root of their weight.

## Changing the map

Most changes are a YAML edit and a rebuild.

| You want to… | Change | Effect |
|---|---|---|
| Pull two things onto the same continent or country | Add a link in `data/overrides/links.yaml` with weight 3–5 | Louvain clusters on edge weights, so a strong link can move a spec to another continent |
| Add a spec the crawl doesn't know | Add it to `data/overrides/specs.yaml`, plus a link or two | Without links it only sits next to its group |
| Remove a spec | Add it to `data/overrides/exclude.yaml` | Dropped before clustering |
| Get bigger or smaller continents in general | Change the first `communities(all, 1.0)` resolution in `cluster.ts` | Higher gives more, smaller continents; lower gives fewer, bigger ones |
| Split continents into more or fewer countries | Change the second `communities(..., 1.0)` call or `MIN_COUNTRY_SPLIT` in `cluster.ts` | |
| Get wider seas or tighter continents | Change `EXPLODE` in `terrain.ts` or the edge factors in `layout.ts` | |
| Get more or fewer routes | Change the minimum weight (`w < 6`) or the per-country limit (`>= 4`) in the routes section of `terrain.ts` | |
| Get bigger islands or rougher coasts | Change `radius()` or the noise wobble in `terrain.ts` | |

Rebuild from the cache, which needs no network:

```sh
npm run data:offline
npm run dev
```

### The layout seed

`data/layout-seed.json` keeps nodes where they were last time. After a clustering change, existing nodes start from their old positions. They may only shift a little even though they now belong to a different continent.

To see a clean result, lay the map out from scratch, as on the first build:

```sh
rm data/layout-seed.json && npm run data:build
```

That throws the old geography away, so the whole map looks different. Only commit the new seed if you want it as the new baseline. Otherwise, bring the old one back:

```sh
git checkout data/layout-seed.json
```
