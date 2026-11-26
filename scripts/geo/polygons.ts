/** Merge Voronoi cells into polygons by cancelling shared edges, then nest holes into outer rings. */
export type Pt = [number, number];
export type Ring = Pt[];

const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

function inside(p: Pt, r: Ring): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * @param cells closed rings (first === last), all with the same winding
 * @returns polygons as [outer, ...holes], each ring closed
 */
export function mergeCells(cells: Ring[]): Ring[][] {
  const edges = new Map<string, [Pt, Pt]>(); // directed "a>b"
  for (const c of cells) {
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i], b = c[i + 1];
      const ka = key(a), kb = key(b);
      if (ka === kb) continue;
      const rev = `${kb}>${ka}`;
      if (edges.has(rev)) edges.delete(rev);
      else edges.set(`${ka}>${kb}`, [a, b]);
    }
  }
  // chain remaining edges into rings
  const out = new Map<string, [Pt, Pt][]>();
  for (const e of edges.values()) {
    const k = key(e[0]);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(e);
  }
  const rings: Ring[] = [];
  for (const [startKey, list] of out) {
    while (list.length) {
      const first = list.pop()!;
      const ring: Ring = [first[0], first[1]];
      let k = key(first[1]);
      while (k !== startKey) {
        const next = out.get(k)?.pop();
        if (!next) break;
        ring.push(next[1]);
        k = key(next[1]);
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  if (!rings.length) return [];
  const refSign = Math.sign(signedArea(cells[0]));
  const outers = rings.filter((r) => Math.sign(signedArea(r)) === refSign);
  const holes = rings.filter((r) => Math.sign(signedArea(r)) !== refSign);
  const polys: Ring[][] = outers.map((o) => [o]);
  for (const h of holes) {
    // smallest outer that contains the hole
    let best: Ring[] | undefined;
    for (const p of polys)
      if (inside(h[0], p[0]) && (!best || Math.abs(signedArea(p[0])) < Math.abs(signedArea(best[0])))) best = p;
    best?.push(h);
  }
  return polys;
}

