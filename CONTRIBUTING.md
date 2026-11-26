# Contributing

Most of the map is generated from crawled data. To change it, the usual first step is to fix the upstream source:

| Source | What it provides |
|---|---|
| [w3c/browser-specs](https://github.com/w3c/browser-specs) | Specs, their groups and repos |
| [w3c/webref](https://github.com/w3c/webref) | Normative and informative references between specs |
| [web-platform-dx/web-features](https://github.com/web-platform-dx/web-features) | Features (cities) and the spec each one belongs to |
| [W3C API](https://api.w3.org/) | Open W3C groups, their descriptions and participants |

A fix upstream reaches the map with the next scheduled build (Mondays and Thursdays). For things only this map cares about, use the overrides below.

## Overrides

The YAML files in [`data/overrides/`](data/overrides) hold the human curation. `npm run graph` reads them while it builds the graph.

| File | What it does |
|---|---|
| [`specs.yaml`](data/overrides/specs.yaml) | Adds specs and documents that browser-specs doesn't track |
| [`links.yaml`](data/overrides/links.yaml) | Adds connections between specs or groups that the crawled data doesn't show |
| [`exclude.yaml`](data/overrides/exclude.yaml) | Leaves a spec series off the map |

### Ids

Overrides refer to map nodes by id:

* **Specs from browser-specs** use the **series** shortname: `css-grid`, not `css-grid-2`. You can find it as `series.shortname` in [browser-specs' index](https://github.com/w3c/browser-specs/blob/main/index.json).
* **Specs from `specs.yaml`** use the `id` you give them.
* **Groups** use `group:<full group name>`, e.g. `group:Web Platform Incubator Community Group`. Use the name as the W3C API spells it. For non-W3C groups, use the name as browser-specs or `specs.yaml` spells it, e.g. `group:HTML Workstream` (WHATWG) or `group:HTTP Working Group` (IETF). The node list in `data/build/graph.json` shows every id after a build.

The build fails with `overrides reference ids that are not on the map` if any id in `links.yaml` or `exclude.yaml` is unknown, so typos can't slip through.

### `specs.yaml`: adding specs

browser-specs only covers specs aimed at browsers. Specs outside that scope, such as MiniApps, WebView CG reports or explainers, can be added here:

```yaml
- id: miniapp-manifest            # required, unique shortname
  title: MiniApp Manifest         # required, shown as the label
  url: https://w3c.github.io/miniapp-manifest/   # required
  repo: https://github.com/w3c/miniapp-manifest  # optional, used for GitHub activity
  org: W3C                        # optional
  groups: [MiniApps Ecosystem Community Group]   # optional
```

* `id` must not exist in browser-specs. If a spec gets added there later, the build fails and asks you to remove it from `specs.yaml`.
* `groups` are full group names. A name that matches an open W3C group (case and punctuation are ignored) links the spec to that group. Any other name creates a new group.
* A curated spec has no references from webref, so it is only connected to its groups. Add entries to `links.yaml` to place it next to the specs it relates to.
* Curated specs are marked as `curated` in the graph data.

### `links.yaml`: adding connections

```yaml
- source: miniapp-manifest
  target: appmanifest
  weight: 3       # optional, 1 (weak) … 5 (strong), default 2
  note: MiniApp manifest builds on the Web App Manifest   # optional, for reviewers
```

Links are undirected, and they pull the two nodes together in the layout. For a sense of scale, here are the weights the crawled data uses:

| Edge | Weight |
|---|---|
| Informative reference | 1 |
| Spec ↔ its group | 2 |
| Normative reference | 3 |
| Groups sharing participants | 0.5 – 3.5 |

If a crawled edge already connects the two nodes, the higher weight wins. Use this file for real relationships, not to nudge the layout: a link with a high weight between unrelated areas can drag whole continents together.

### `exclude.yaml`: removing specs

A list of browser-specs series shortnames to drop from the map, e.g. for specs that are discontinued or out of scope:

```yaml
- some-series-shortname
```

Only browser-specs series can be excluded. To remove a curated spec, delete it from `specs.yaml`.

### Checking your change

```sh
npm run data:offline   # rebuild from the cache with your overrides
npm test
npm run dev            # look at the result
```

`data/layout-seed.json` stores the last node positions so the geography stays stable between builds. Rebuilding updates it. Commit the change only if you mean to move the committed baseline; CI keeps its own copy between runs.

## Running locally

```sh
npm install
npm run data          # fetch sources (~700 small requests, cached in data/cache/) and build the map data
npm run dev           # http://localhost:5173/world-wide-map/
```

After the first fetch, `npm run data:offline` rebuilds from the cache.
Set `GITHUB_TOKEN` to include repo activity: hills then follow commits and issues from the last 90 days instead of reference counts.

The pipeline runs in steps, which you can also run one at a time:

| Script | Step |
|---|---|
| `npm run fetch` | Download sources into `data/cache/` |
| `npm run graph` | Build `data/build/graph.json` from the cache and the overrides |
| `npm run cluster` | Group nodes into continents (Louvain) |
| `npm run layout` | Place nodes (ForceAtlas2, seeded from `data/layout-seed.json`) |
| `npm run geo` | Turn positions into GeoJSON in `public/map/` |

[docs/how-the-map-is-built.md](docs/how-the-map-is-built.md) explains what each step does and which knobs change the shape of the map.
