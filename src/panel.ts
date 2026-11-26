import type { MapIndex } from './data.ts';

import { REPO } from './config.ts';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const link = (href: string | undefined, text: string) => (href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : '');
const groupTypeLabel = { wg: 'Working group', ig: 'Interest group', cg: 'Community group', other: 'Group' } as const;
const baselineLabel = { high: 'Baseline: widely available', low: 'Baseline: newly available', false: 'Limited availability' } as const;

export class Panel {
  private el = document.getElementById('panel')!;
  private body = document.getElementById('panel-body')!;
  /** element that had focus before the panel opened, to return to on close */
  private opener: HTMLElement | null = null;
  onHide?: () => void;

  constructor(private index: MapIndex, private go: (id: string) => void) {
    document.getElementById('close')!.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) {
        e.preventDefault();
        this.hide();
      }
    });
    this.body.addEventListener('input', (e) => {
      if ((e.target as HTMLElement).id === 'browse-filter') this.filterBrowse((e.target as HTMLInputElement).value);
    });
    this.body.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (a) {
        e.preventDefault();
        this.go(a.dataset.go!);
      }
    });
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const back = this.opener;
    this.opener = null;
    if (back?.isConnected) back.focus();
    this.onHide?.();
  }

  /** Render content and move focus to its heading, so keyboard and screen reader users land in it. */
  private show(html: string, focus: '#panel-title' | '#browse-filter' = '#panel-title') {
    if (this.el.hidden) this.opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    this.body.innerHTML = html;
    this.el.hidden = false;
    this.body.scrollTop = 0;
    this.el.scrollTop = 0;
    this.body.querySelector<HTMLElement>(focus)?.focus();
  }

  private nodeLink(id: string) {
    const n = this.index.nodes[id];
    // a button, not an in-page link: it opens a place in the panel and moves the map
    return n ? `<button type="button" class="go" data-go="${esc(id)}">${esc(n.label)}</button>` : esc(id);
  }

  showNode(id: string) {
    const n = this.index.nodes[id];
    if (!n) return;
    const features = (n.features ?? []).map((f) => [f, this.index.features[f]] as const);
    this.show(`
      <p class="kind">${n.type === 'group' ? groupTypeLabel[n.groupType ?? 'other'] : n.curated ? 'Specification · curated' : 'Specification'}</p>
      <h2 id="panel-title" tabindex="-1">${esc(n.label)}</h2>
      <ul class="links">
        ${n.url ? `<li>${link(n.url, n.type === 'group' ? 'Group homepage' : 'Read the spec')}</li>` : ''}
        ${n.repo ? `<li>${link(n.repo, 'Repository')} · ${link(n.repo + '/issues', 'issues')}</li>` : ''}
      </ul>
      ${n.type === 'spec' && (n.org || n.status) ? `<p class="meta">${esc(n.org)}${n.status ? ` · ${esc(n.status)}` : ''}${n.standing && n.standing !== 'good' ? ` · ${esc(n.standing)}` : ''}</p>` : ''}
      ${n.participants ? `<p class="meta">${n.participants} participants</p>` : ''}
      ${n.description ? `<p class="desc">${esc(n.description.length > 400 ? n.description.slice(0, 400) + '…' : n.description)}</p>` : ''}
      ${n.groups?.length ? `<h3>Groups</h3><ul>${n.groups.map((g) => `<li>${this.nodeLink('group:' + g)}</li>`).join('')}</ul>` : ''}
      ${n.members?.length ? `<h3>Specs (${n.members.length})</h3><ul class="cols">${n.members.map((m) => `<li>${this.nodeLink(m)}</li>`).join('')}</ul>` : ''}
      ${features.length ? `<h3>Features (${features.length})</h3><ul class="features">${features
        .map(([fid, f]) => `<li><span class="bl bl-${f.baseline || 'none'}" role="img" aria-label="${baselineLabel[String(f.baseline) as keyof typeof baselineLabel]}" title="${baselineLabel[String(f.baseline) as keyof typeof baselineLabel]}"></span>${link(`https://web-platform-dx.github.io/web-features-explorer/features/${fid}/`, f.name)}</li>`)
        .join('')}</ul>` : ''}
      ${n.neighbors.length ? `<h3>${n.type === 'group' ? 'Connected (shared participants, specs)' : 'Connected specs'}</h3><ul class="cols">${n.neighbors.map((m) => `<li>${this.nodeLink(m)}</li>`).join('')}</ul>` : ''}
      <p class="edit">${link(`${REPO}/blob/main/CONTRIBUTING.md#overrides`, 'Suggest a change')}</p>`);
  }

  showCountry(id: number) {
    const c = this.index.countries[id];
    if (!c) return;
    const members = Object.entries(this.index.nodes).filter(([, n]) => n.country === id);
    const specs = members.filter(([, n]) => n.type === 'spec').sort((a, b) => a[1].label.localeCompare(b[1].label));
    const groups = members.filter(([, n]) => n.type === 'group').sort((a, b) => a[1].label.localeCompare(b[1].label));
    this.show(`
      <p class="kind">Country</p>
      <h2 id="panel-title" tabindex="-1">${esc(c.subtitle || this.index.nodes[c.anchor]?.label)}</h2>
      <p class="meta">${specs.length} specs · ${groups.length} groups · centred on ${this.nodeLink(c.anchor)}</p>
      ${groups.length ? `<h3>Groups (${groups.length})</h3><ul>${groups.map(([gid]) => `<li>${this.nodeLink(gid)}</li>`).join('')}</ul>` : ''}
      ${specs.length ? `<h3>Specs (${specs.length})</h3><ul class="cols">${specs.map(([sid]) => `<li>${this.nodeLink(sid)}</li>`).join('')}</ul>` : ''}`);
  }

  /** Text view of the whole map: continents → countries → groups and specs. */
  showBrowse() {
    const nodes = Object.entries(this.index.nodes);
    const byCountry = new Map<number, [string, (typeof nodes)[number][1]][]>();
    for (const [id, n] of nodes) (byCountry.get(n.country) ?? byCountry.set(n.country, []).get(n.country)!).push([id, n]);
    const country = (cid: number) => {
      const c = this.index.countries[cid];
      const members = (byCountry.get(cid) ?? []).sort((a, b) => a[1].label.localeCompare(b[1].label));
      const groups = members.filter(([, n]) => n.type === 'group');
      const specs = members.filter(([, n]) => n.type === 'spec');
      const title = c.subtitle || this.index.nodes[c.anchor]?.label || 'Unnamed region';
      return `<details class="country"><summary>${esc(title)} <span class="count">${specs.length} specs, ${groups.length} groups</span></summary>
        ${groups.length ? `<div class="part"><h4>Groups</h4><ul>${groups.map(([id]) => `<li data-text="${esc(this.index.nodes[id].label.toLowerCase())}">${this.nodeLink(id)}</li>`).join('')}</ul></div>` : ''}
        ${specs.length ? `<div class="part"><h4>Specs</h4><ul>${specs.map(([id]) => `<li data-text="${esc(this.index.nodes[id].label.toLowerCase())}">${this.nodeLink(id)}</li>`).join('')}</ul></div>` : ''}
      </details>`;
    };
    const continents = this.index.continents.filter((c) => !c.island);
    const islands = this.index.continents.filter((c) => c.island);
    const countriesOf = (cont: number) => this.index.countries.filter((k) => k.continent === cont).map((k) => country(k.id)).join('');
    this.show(
      `<p class="kind">Browse</p>
      <h2 id="panel-title" tabindex="-1">Everything on the map</h2>
      <p class="meta">The map as a list: each continent is a cluster of closely connected specs and groups, split into countries. Continents are labelled by their most common groups.</p>
      <label class="filter">Filter <input id="browse-filter" type="search" autocomplete="off" placeholder="e.g. manifest" /></label>
      <p id="browse-status" class="meta" role="status"></p>
      ${continents.map((c, i) => `<section class="continent"><h3>Continent ${i + 1}: ${esc(c.subtitle)}</h3>${countriesOf(c.id)}</section>`).join('')}
      ${islands.length ? `<section class="continent"><h3>Islands</h3>${islands.map((c) => countriesOf(c.id)).join('')}</section>` : ''}`,
      '#browse-filter',
    );
  }

  private filterBrowse(q: string) {
    const term = q.trim().toLowerCase();
    let shown = 0;
    for (const d of this.body.querySelectorAll<HTMLDetailsElement>('details.country')) {
      let any = false;
      for (const li of d.querySelectorAll<HTMLElement>('li[data-text]')) {
        const hit = !term || li.dataset.text!.includes(term);
        li.hidden = !hit;
        if (hit) { any = true; shown++; }
      }
      for (const part of d.querySelectorAll<HTMLElement>('.part')) part.hidden = !part.querySelector('li:not([hidden])');
      d.hidden = !any;
      d.open = !!term && any;
    }
    for (const s of this.body.querySelectorAll<HTMLElement>('section.continent')) s.hidden = !s.querySelector('details.country:not([hidden])');
    this.body.querySelector('#browse-status')!.textContent = term ? `${shown} matches` : '';
  }

  showFeature(id: string) {
    const f = this.index.features[id];
    if (!f) return;
    this.show(`
      <p class="kind">Web feature</p>
      <h2 id="panel-title" tabindex="-1">${esc(f.name)}</h2>
      <p><span class="bl bl-${f.baseline || 'none'}" aria-hidden="true"></span>${baselineLabel[String(f.baseline) as keyof typeof baselineLabel]}</p>
      <p>${esc(f.description)}</p>
      <ul class="links">
        <li>${link(`https://web-platform-dx.github.io/web-features-explorer/features/${id}/`, 'web-features explorer')}</li>
        <li>Part of ${this.nodeLink(f.spec)}</li>
      </ul>`);
  }
}
