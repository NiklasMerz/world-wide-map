import { C } from './style.ts';
import type { MapIndex } from './data.ts';

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';

const dot = (fill: string, stroke: string, r = 5, sw = 1.2) =>
  `<svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
const line = (color: string, dash = '', opacity = 1, width = 2) =>
  `<svg width="18" height="18" aria-hidden="true"><line x1="1" y1="9" x2="17" y2="9" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;

/** Legend explaining hills, dots and lines. Built from the data so the time window is always current. */
export function renderLegend(index: MapIndex) {
  const a = index.activity;
  const hills =
    a?.source === 'github'
      ? `Hills show where specs are busy: commits and updated issues in each spec's GitHub repo over the
         <strong>${a.windowDays} days to ${formatDate(a.fetchedAt)}</strong>, added up for the specs nearby.
         For specs that share a repo, only their own folder and label count.`
      : `Hills show how often specs nearby are referenced by other specs (no GitHub data in this build).`;
  const el = document.createElement('aside');
  el.className = 'legend';
  el.setAttribute('aria-label', 'Map legend');
  el.innerHTML = `<details ${matchMedia('(min-width: 800px)').matches ? 'open' : ''}>
    <summary>Legend</summary>
    <div class="legend-body">
      <h2>Hills: activity</h2>
      <p>${hills}</p>
      <div class="ramp" role="img" aria-label="Colour scale from green lowland (quietest 40% of the land) through yellow and ochre to dark brown (busiest 2.5%)">
        <span style="background:${C.land[0]}"></span>${C.hills.map((c) => `<span style="background:${c}"></span>`).join('')}
      </div>
      <div class="ramp-labels" aria-hidden="true"><span>quietest 40%</span><span>busiest 2.5%</span></div>
      <p>Colours are relative to the rest of the map, not absolute counts. Click a spec for its numbers.</p>
      <h2>Places</h2>
      <ul>
        <li>${dot('#f7f0dc', C.ink)} Spec: bigger means more activity</li>
        <li>${dot(C.ink, C.ink)} Most connected spec of a country</li>
        <li>${dot('#7d4b6e', C.ink)} Group: bigger means more participants</li>
        <li>${dot('#2c6a3c', '#fffaf0', 4)} Web feature, Baseline widely available</li>
        <li>${dot('#3f78a3', '#14283a', 4)} Web feature, Baseline newly available</li>
        <li>${dot('#f3ead2', '#8a5a26', 3.5, 1.8)} Web feature, limited availability</li>
      </ul>
      <h2>Lines</h2>
      <ul>
        <li>${line(C.inkSoft, '3 2', 1, 1.2)} Border between countries</li>
        <li>${line(C.route, '', 0.75, 2.5)} Flight route: strongly linked countries on one continent</li>
        <li>${line(C.route, '2 3', 0.6, 2)} Ferry route: strongly linked countries across the sea</li>
      </ul>
    </div></details>`;
  document.body.append(el);
}
