/** Sanity checks on the generated data. Skipped until `npm run data` has run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { BUILD, OUT, exists, normUrl, readJson } from '../lib/util.ts';
import type { Graph } from '../lib/types.ts';

test('normUrl matches TR/ED variants', () => {
  assert.equal(normUrl('http://www.w3.org/TR/css-grid-2/'), normUrl('https://www.w3.org/TR/css-grid-2'));
  assert.equal(normUrl('https://example.org/spec/index.html'), normUrl('https://example.org/spec/'));
});

const built = exists(join(BUILD, 'graph.json')) && exists(join(OUT, 'countries.geojson'));

test('every node has exactly one continent and country', { skip: !built }, async () => {
  const g: Graph = await readJson(join(BUILD, 'graph.json'));
  for (const n of g.nodes) {
    assert.ok(Number.isInteger(n.continent), `${n.id} has no continent`);
    assert.ok(Number.isInteger(n.country), `${n.id} has no country`);
    assert.equal(g.countries![n.country!].continent, n.continent, `${n.id} country/continent mismatch`);
  }
});

test('generated GeoJSON is well-formed', { skip: !built }, async () => {
  for (const f of ['countries', 'continents', 'contours', 'routes', 'places', 'labels']) {
    const fc = await readJson(join(OUT, `${f}.geojson`));
    assert.equal(fc.type, 'FeatureCollection');
    for (const feat of fc.features) {
      assert.ok(feat.geometry?.coordinates, `${f}: feature without geometry`);
      if (feat.geometry.type === 'MultiPolygon')
        for (const poly of feat.geometry.coordinates)
          for (const ring of poly) {
            assert.ok(ring.length >= 4, `${f}: ring too short`);
            assert.deepEqual(ring[0], ring.at(-1), `${f}: ring not closed`);
          }
    }
  }
});
