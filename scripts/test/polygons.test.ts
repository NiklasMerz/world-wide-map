import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCells, signedArea, type Ring } from '../geo/polygons.ts';

const square = (x: number, y: number): Ring => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]];

test('adjacent cells merge into one outer ring', () => {
  const polys = mergeCells([square(0, 0), square(1, 0)]);
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 1);
  assert.equal(Math.abs(signedArea(polys[0][0])), 2);
});

test('a ring of cells keeps its hole', () => {
  const cells: Ring[] = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (!(x === 1 && y === 1)) cells.push(square(x, y));
  const polys = mergeCells(cells);
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 2, 'outer + hole');
  assert.equal(Math.abs(signedArea(polys[0][0])), 9);
  assert.equal(Math.abs(signedArea(polys[0][1])), 1);
});

test('disjoint cells stay separate polygons', () => {
  assert.equal(mergeCells([square(0, 0), square(5, 5)]).length, 2);
});
