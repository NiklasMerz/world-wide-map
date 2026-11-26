# Contributing

Most of the map is generated from crawled data, so the usual way to change it is to fix the source:
[w3c/browser-specs](https://github.com/w3c/browser-specs) (specs, groups, repos),
[w3c/webref](https://github.com/w3c/webref) (references between specs) or
[web-platform-dx/web-features](https://github.com/web-platform-dx/web-features) (features).

For things only this map cares about, edit the YAML in [`data/overrides/`](data/overrides) and open a PR:

| File | What it does |
|---|---|
| `links.yaml` | Extra connections between specs/groups that the references don't show (e.g. MiniApps ↔ Web App Manifest) |
| `exclude.yaml` | Leave a spec series off the map |

Spec ids are browser-specs **series** shortnames (`css-grid`, not `css-grid-2`); groups are `group:<full group name>`.

## Running locally

```sh
npm install
npm run data          # fetch sources (~700 small requests, cached in data/cache/) and build the map data
npm run dev           # http://localhost:5173/world-wide-map/
```

After the first fetch, `npm run data:offline` rebuilds from the cache.
Set `GITHUB_TOKEN` to include repo activity (hills follow commits and issues from the last 90 days instead of reference counts).
