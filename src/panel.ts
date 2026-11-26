import type { MapIndex } from './data.ts';

/** Set at build time (CI passes the GitHub repo URL); the edit link is hidden without it. */
const REPO: string | undefined = import.meta.env.VITE_REPO_URL;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const link = (href: string | undefined, text: string) => (href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : '');
const baselineLabel = { high: 'Baseline: widely available', low: 'Baseline: newly available', false: 'Limited availability' } as const;

export class Panel {
  private el = document.getElementById('panel')!;
  private body = document.getElementById('panel-body')!;

  constructor(private index: MapIndex, private go: (id: string) => void) {
    document.getElementById('close')!.addEventListener('click', () => this.hide());
    this.body.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (a) {
        e.preventDefault();
        this.go(a.dataset.go!);
      }
    });
  }

  hide() {
    this.el.hidden = true;
  }

  private nodeLink(id: string) {
    const n = this.index.nodes[id];
    return n ? `<a href="#${esc(id)}" data-go="${esc(id)}">${esc(n.label)}</a>` : esc(id);
  }

  showNode(id: string) {
    const n = this.index.nodes[id];
    if (!n) return;
    const features = (n.features ?? []).map((f) => [f, this.index.features[f]] as const);
    this.body.innerHTML = `
      <p class="kind">${n.type === 'group' ? 'Guild hall · group' : 'City · specification'}</p>
      <h2>${esc(n.label)}</h2>
      <ul class="links">
        ${n.url ? `<li>${link(n.url, 'Read the spec')}</li>` : ''}
        ${n.repo ? `<li>${link(n.repo, 'Repository')} · ${link(n.repo + '/issues', 'issues')}</li>` : ''}
      </ul>
      ${n.org || n.status ? `<p class="meta">${esc(n.org)}${n.status ? ` · ${esc(n.status)}` : ''}${n.standing && n.standing !== 'good' ? ` · ${esc(n.standing)}` : ''}</p>` : ''}
      ${n.groups?.length ? `<h3>Groups</h3><ul>${n.groups.map((g) => `<li>${this.nodeLink('group:' + g)}</li>`).join('')}</ul>` : ''}
      ${n.members?.length ? `<h3>Specs (${n.members.length})</h3><ul class="cols">${n.members.map((m) => `<li>${this.nodeLink(m)}</li>`).join('')}</ul>` : ''}
      ${features.length ? `<h3>Features (${features.length})</h3><ul class="features">${features
        .map(([fid, f]) => `<li><span class="bl bl-${f.baseline || 'none'}" title="${baselineLabel[String(f.baseline) as keyof typeof baselineLabel]}"></span>${link(`https://web-platform-dx.github.io/web-features-explorer/features/${fid}/`, f.name)}</li>`)
        .join('')}</ul>` : ''}
      ${n.neighbors.length ? `<h3>Roads lead to</h3><ul class="cols">${n.neighbors.map((m) => `<li>${this.nodeLink(m)}</li>`).join('')}</ul>` : ''}
      ${REPO ? `<p class="edit">${link(`${REPO}/tree/main/data/overrides`, 'Suggest a change')}</p>` : ''}`;
    this.el.hidden = false;
  }

  showFeature(id: string) {
    const f = this.index.features[id];
    if (!f) return;
    this.body.innerHTML = `
      <p class="kind">Village · web feature</p>
      <h2>${esc(f.name)}</h2>
      <p><span class="bl bl-${f.baseline || 'none'}"></span>${baselineLabel[String(f.baseline) as keyof typeof baselineLabel]}</p>
      <p>${esc(f.description)}</p>
      <ul class="links">
        <li>${link(`https://web-platform-dx.github.io/web-features-explorer/features/${id}/`, 'web-features explorer')}</li>
        <li>Part of ${this.nodeLink(f.spec)}</li>
      </ul>`;
    this.el.hidden = false;
  }
}
