import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
import { Map as MlMap, NavigationControl, setWorkerUrl, type MapGeoJSONFeature } from 'maplibre-gl';
// MapLibre v6 looks for its worker next to its own module, which doesn't survive bundling.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { mapStyle } from './style.ts';
import { loadIndex } from './data.ts';
import { Panel } from './panel.ts';

setWorkerUrl(workerUrl);

const BASE = import.meta.env.BASE_URL;
const [index, meta] = await Promise.all([loadIndex(BASE), fetch(`${BASE}map/meta.json`).then((r) => r.json())]);

const map = new MlMap({
  container: 'map',
  style: mapStyle(BASE),
  bounds: meta.bounds,
  fitBoundsOptions: { padding: 40 },
  maxBounds: [
    [meta.bounds[0][0] - 10, meta.bounds[0][1] - 10],
    [meta.bounds[1][0] + 10, meta.bounds[1][1] + 10],
  ],
  minZoom: 1,
  maxZoom: 12,
  renderWorldCopies: false,
  dragRotate: false,
  attributionControl: { compact: true, customAttribution: 'Data: w3c/webref, browser-specs, web-features' },
});
map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

let selected: string | number | undefined;
function select(featureId: string | undefined) {
  if (selected !== undefined) map.setFeatureState({ source: 'places', id: selected }, { selected: false });
  selected = featureId;
  if (featureId !== undefined) map.setFeatureState({ source: 'places', id: featureId }, { selected: true });
}

const panel = new Panel(index, (id) => go(id));

function go(id: string) {
  const isFeature = id.startsWith('feature:');
  const at = isFeature ? index.nodes[index.features[id.slice(8)]?.spec]?.at : index.nodes[id]?.at;
  if (!at) return;
  isFeature ? panel.showFeature(id.slice(8)) : panel.showNode(id);
  select(id);
  map.flyTo({ center: at, zoom: Math.max(map.getZoom(), isFeature ? 8.5 : 6.5) });
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
}

map.on('click', (e) => {
  const hits: MapGeoJSONFeature[] = map.queryRenderedFeatures(e.point, { layers: ['cities', 'features'] });
  if (hits.length) return go(String(hits[0].properties.id));
  const country = map.queryRenderedFeatures(e.point, { layers: ['country-fill'] })[0];
  if (country) {
    const c = index.countries[country.properties.id];
    map.setFilter('country-highlight', ['==', ['get', 'id'], c.id]);
    go(c.anchor);
  } else {
    panel.hide();
    select(undefined);
    map.setFilter('country-highlight', ['==', ['get', 'id'], -1]);
  }
});
for (const layer of ['cities', 'features']) {
  map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
}

// search
const list = document.getElementById('places') as HTMLDataListElement;
const byLabel = new Map<string, string>();
for (const [id, n] of Object.entries(index.nodes)) byLabel.set(n.label, id);
for (const [id, f] of Object.entries(index.features)) if (!byLabel.has(f.name)) byLabel.set(f.name, `feature:${id}`);
list.append(...[...byLabel.keys()].sort().map((label) => Object.assign(document.createElement('option'), { value: label })));
const q = document.getElementById('q') as HTMLInputElement;
document.getElementById('search')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = byLabel.get(q.value);
  if (id) go(id);
});
q.addEventListener('change', () => byLabel.has(q.value) && go(byLabel.get(q.value)!));

// deep links: #css-grid, #feature:grid
map.once('load', () => {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) go(hash);
});
