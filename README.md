# World Wide Map

A fictional map of how the web is built at W3C, WHATWG and more.

## Why?

So much is going on in web standards and build the web and related technology it's hard to keep track and find connections. TPAC and other conferences are great, but more connections should be made on a regular basis.

Sometimes standards are built without looking into related things.

* MiniApps and the web don't connect very well
* web-features

## What?

> The idea of what this could become

* A map that clusters groups, standards and activities visually, shows connections.
* A way to subscribe to topics after logging in with GitHub
* A regular update newsletter for stuff that might interest you
* Submit PRs and issues to add or change information
* Curated homepage, blog or newsletter that shows what's going on

## How?

### Input

Datasources and information to grab:

* webref
* w3c/browser-specs
* web-platform-dx/web-features
* mdn/browser-compat-data
* W3C API (api.w3.org): All groups, chairs, specs, activity.
* GitHub repos

### Output

* A topological map: continents with related ares, groups & projects as countries, hills for high activity, flight and ferry routes for connections
* Clickable areas & peaks for getting links to web-features, repos, groups etc.
* Who to ask (possibly sensitive but usually public info (GH profiles)): people active in something and points of contact
* Statically rendered from compiled json/yaml sources
* User editable consistent data

## Status

The first milestone works: a data pipeline and a clickable map, deployed to GitHub Pages every night.

```
fetch  ─▶ graph ─▶ cluster ─▶ layout ─▶ geo ─▶ Vite + MapLibre
webref    specs,   Louvain:   Force-     Voronoi land/sea,
web-feat. refs,    continents Atlas2     borders, activity hills,
GitHub    groups   countries  (seeded)   routes → GeoJSON
```

* `scripts/fetch` pulls sources into `data/cache/`
* `scripts/graph` builds the graph (one node per spec series and per group), clusters it and lays it out
* `scripts/geo` turns positions into geography and writes `public/map/*.geojson`
* `src/` is the map front end (Vite, vanilla TS, MapLibre GL)
* `data/overrides/*.yaml` holds the human curation, see [CONTRIBUTING.md](CONTRIBUTING.md)

[docs/how-the-map-is-built.md](docs/how-the-map-is-built.md) explains each step and how to tune the result.

`scripts/prototype/gvmap.sh` renders the same graph with Graphviz GMap for comparison.

## Inspiration

* webcompat.dev - A website that show web compat tools and resources in clusters with their connections between each other
* The rooms in the World Forum The Hague - The rooms and wings are named after continents and countries
* Graphviz GMap / gvmap - graphs drawn as maps
