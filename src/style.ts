import type { StyleSpecification } from 'maplibre-gl';

/** Atlas palette: parchment land, muted sea, sepia ink. */
export const C = {
  sea: '#a9c4c9',
  seaDeep: '#93b2b9',
  land: ['#efe3c2', '#e8dcb5', '#f1e6c8', '#e4d7ae', '#ede0bb', '#e9e0c0'],
  ink: '#4a3b2a',
  inkSoft: '#7a6650',
  hills: ['#ddcb9b', '#cfb985', '#c0a571', '#ae9160', '#9a7d51', '#866a44'],
  road: '#8c5a3c',
};

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Medium'];
const FONT_ITALIC = ['Noto Sans Italic'];

export function mapStyle(base: string): StyleSpecification {
  const src = (f: string) => ({ type: 'geojson' as const, data: `${base}map/${f}.geojson` });
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      continents: src('continents'),
      countries: src('countries'),
      contours: src('contours'),
      roads: src('roads'),
      places: { ...src('places'), promoteId: 'id' } as any,
      labels: src('labels'),
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': C.sea } },
      // soft shelf around the coast
      { id: 'shelf', type: 'line', source: 'continents', paint: { 'line-color': '#bcd3d6', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 30], 'line-blur': 6 } },
      {
        id: 'country-fill',
        type: 'fill',
        source: 'countries',
        paint: { 'fill-color': ['match', ['get', 'tint'], 0, C.land[0], 1, C.land[1], 2, C.land[2], 3, C.land[3], 4, C.land[4], C.land[5]] },
      },
      {
        id: 'hills',
        type: 'fill',
        source: 'contours',
        paint: {
          'fill-color': ['match', ['get', 'level'], 0, C.hills[0], 1, C.hills[1], 2, C.hills[2], 3, C.hills[3], 4, C.hills[4], C.hills[5]],
          'fill-opacity': 0.55,
        },
      },
      { id: 'contour-lines', type: 'line', source: 'contours', minzoom: 4, paint: { 'line-color': C.inkSoft, 'line-width': 0.4, 'line-opacity': 0.5 } },
      { id: 'country-highlight', type: 'line', source: 'countries', filter: ['==', ['get', 'id'], -1], paint: { 'line-color': C.road, 'line-width': 3 } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': C.inkSoft, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.6], 'line-dasharray': [3, 2] } },
      { id: 'coast', type: 'line', source: 'continents', paint: { 'line-color': C.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2] } },
      {
        id: 'roads',
        type: 'line',
        source: 'roads',
        minzoom: 3.5,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': C.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['min', 4, ['*', 0.25, ['sqrt', ['get', 'weight']]]], 8, ['min', 8, ['*', 0.6, ['sqrt', ['get', 'weight']]]]],
          'line-opacity': ['match', ['get', 'kind'], 'sea-route', 0.45, 0.75],
          'line-dasharray': ['match', ['get', 'kind'], 'sea-route', ['literal', [2, 3]], ['literal', [1, 0]]],
        },
      },
      // villages (web-features)
      {
        id: 'features',
        type: 'circle',
        source: 'places',
        minzoom: 7,
        filter: ['==', ['get', 'kind'], 'feature'],
        paint: {
          'circle-radius': 2.5,
          'circle-color': ['match', ['get', 'baseline'], 'high', '#3f7d4e', 'low', '#5b8fb0', '#b9874d'],
          'circle-stroke-color': '#fff8',
          'circle-stroke-width': 0.8,
        },
      },
      // cities (specs), guild halls (groups)
      {
        id: 'cities',
        type: 'circle',
        source: 'places',
        filter: ['!=', ['get', 'kind'], 'feature'],
        minzoom: 3,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['match', ['get', 'kind'], 'capital', 3.5, 1.2], 8, ['+', 2.5, ['get', 'activity']]],
          'circle-color': ['match', ['get', 'kind'], 'group', '#7d4b6e', 'capital', C.ink, '#f7f0dc'],
          'circle-stroke-color': C.ink,
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1],
        },
      },
      {
        id: 'feature-labels',
        type: 'symbol',
        source: 'places',
        minzoom: 8,
        filter: ['==', ['get', 'kind'], 'feature'],
        layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 10, 'text-offset': [0, 0.8], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': C.inkSoft, 'text-halo-color': '#f3ead2', 'text-halo-width': 1.2 },
      },
      {
        id: 'city-labels',
        type: 'symbol',
        source: 'places',
        filter: ['!=', ['get', 'kind'], 'feature'],
        minzoom: 4.5,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['match', ['get', 'kind'], 'group', ['literal', FONT_ITALIC], 'capital', ['literal', FONT_BOLD], ['literal', FONT]],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'kind'], 'capital', 12, 10], 9, ['match', ['get', 'kind'], 'capital', 15, 13]],
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'symbol-sort-key': ['get', 'rank'],
          'text-max-width': 9,
        },
        paint: { 'text-color': C.ink, 'text-halo-color': '#f3ead2', 'text-halo-width': 1.5 },
      },
      {
        id: 'continent-labels',
        type: 'symbol',
        source: 'labels',
        filter: ['==', ['get', 'kind'], 'continent'],
        maxzoom: 4.5,
        layout: {
          'text-field': ['get', 'subtitle'],
          'text-font': FONT_ITALIC,
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 16],
          'text-max-width': 14,
          'symbol-sort-key': ['-', ['get', 'size']],
        },
        paint: { 'text-color': C.ink, 'text-halo-color': '#efe3c2aa', 'text-halo-width': 1.5 },
      },
      // The selected place always shows, whatever the label collisions or zoom say
      {
        id: 'selected-dot',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': 7, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': C.road, 'circle-stroke-width': 3 },
      },
      {
        id: 'selected-label',
        type: 'symbol',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': FONT_BOLD,
          'text-size': 14,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': C.ink, 'text-halo-color': '#f3ead2', 'text-halo-width': 2 },
      },
    ],
  };
}
