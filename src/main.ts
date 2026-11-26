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
  maxZoom: 10,
  renderWorldCopies: false,
  dragRotate: false,
  attributionControl: { compact: true, customAttribution: 'Data: w3c/webref, browser-specs, web-features' },
});
map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
if (import.meta.env.DEV) Object.assign(window, { wwm: map }); // for debugging and browser tests

let selected: string | undefined;
function select(featureId: string | undefined) {
  if (selected !== undefined) map.setFeatureState({ source: 'places', id: selected }, { selected: false });
  selected = featureId;
  if (featureId !== undefined) map.setFeatureState({ source: 'places', id: featureId }, { selected: true });
  for (const layer of ['selected-dot', 'selected-label']) map.setFilter(layer, ['==', ['get', 'id'], featureId ?? '']);
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const panel = new Panel(index, (id) => go(id));
panel.onHide = () => {
  select(undefined);
  highlightCountry(undefined);
};
document.getElementById('browse')!.addEventListener('click', () => panel.showBrowse());

/**
 * Open a place. Clicks on the map keep the camera where it is; search, deep links and
 * links in the panel (fly: true) move to the place.
 */
function go(id: string, fly = true) {
  const isFeature = id.startsWith('feature:');
  const at = isFeature ? index.features[id.slice(8)]?.at : index.nodes[id]?.at;
  if (!at) return;
  isFeature ? panel.showFeature(id.slice(8)) : panel.showNode(id);
  select(id);
  highlightCountry(undefined);
  if (fly) {
    const zoom = Math.max(map.getZoom(), isFeature ? 8 : 6);
    // short hops ease, long ones fly; flyTo's zoom-out arc is disorienting for nearby targets.
    // With prefers-reduced-motion, jump without animation.
    const far = map.project(at).dist(map.project(map.getCenter())) > Math.max(innerWidth, innerHeight);
    if (reducedMotion.matches) map.jumpTo({ center: at, zoom });
    else if (far) map.flyTo({ center: at, zoom });
    else map.easeTo({ center: at, zoom, duration: 600 });
  }
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
}

function highlightCountry(id: number | undefined) {
  map.setFilter('country-highlight', ['==', ['get', 'id'], id ?? -1]);
}

/** Nearest place within a few pixels of the click, so small dots are easy to hit. */
function placeAt(point: { x: number; y: number }): string | undefined {
  const r = 6;
  const hits: MapGeoJSONFeature[] = map.queryRenderedFeatures(
    [[point.x - r, point.y - r], [point.x + r, point.y + r]],
    { layers: ['cities', 'features'] },
  );
  let best: string | undefined, bestD = Infinity;
  for (const h of hits) {
    const d = map.project((h.geometry as GeoJSON.Point).coordinates as [number, number]).dist(point as any);
    if (d < bestD) [best, bestD] = [String(h.properties.id), d];
  }
  return best;
}

map.on('click', (e) => {
  const place = placeAt(e.point);
  if (place) return go(place, false);
  const country = map.queryRenderedFeatures(e.point, { layers: ['country-fill'] })[0];
  if (country) {
    const id = country.properties.id as number;
    select(undefined);
    highlightCountry(id);
    panel.showCountry(id);
    history.replaceState(null, '', location.pathname);
  } else {
    panel.hide();
    select(undefined);
    highlightCountry(undefined);
    history.replaceState(null, '', location.pathname);
  }
});
map.on('mousemove', (e) => (map.getCanvas().style.cursor = placeAt(e.point) ? 'pointer' : ''));

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
