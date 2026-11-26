/**
 * Activity per spec from the GitHub GraphQL API: commits and issues updated in the last 90 days.
 *
 * Many specs share one repo (all CSS specs live in w3c/csswg-drafts), so repo totals would credit
 * every spec with the whole repo's activity. For specs in a shared repo:
 *   - commits only count when they touch the spec's own folder (or file, for specs at the root)
 *   - issues only count when they carry a label named after the spec (CSS WG style: "css-grid-3");
 *     without such a label, the repo's issues are split evenly across its specs
 * Each count records which of these it is, so the UI can say so.
 */
export const WINDOW_DAYS = 90;

export interface ActivityTarget {
  /** node id the result belongs to (spec series shortname or curated spec id) */
  key: string;
  repo: string;
  /** spec source path inside the repo, e.g. "css-grid-3/Overview.bs" */
  sourcePath?: string;
  /** label to try for issues in a shared repo, e.g. "css-grid-3" */
  label?: string;
}

export type CommitScope = 'repo' | 'path' | 'shared';
export type IssueScope = 'repo' | 'label' | 'shared';

export interface SpecActivity {
  repo: string;
  commits: number;
  issues: number;
  commitScope: CommitScope;
  issueScope: IssueScope;
  /** folder or file the commits were counted for (commitScope "path") */
  path?: string;
  /** label the issues were counted for (issueScope "label") */
  label?: string;
}

export interface GithubActivity {
  since: string;
  fetchedAt: string;
  windowDays: number;
  specs: Record<string, SpecActivity>;
}

const BATCH = 40;

function parseRepo(url: string) {
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
  return m ? { owner: m[1], name: m[2].replace(/\.git$/, ''), url: `https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}`.toLowerCase() } : undefined;
}

/** Folder of the source file, or the file itself when it sits at the repo root. */
function scopePath(sourcePath?: string) {
  if (!sourcePath) return undefined;
  const i = sourcePath.lastIndexOf('/');
  return i > 0 ? sourcePath.slice(0, i) : sourcePath;
}

async function graphql(query: string, token: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'worldwidemap' },
      body: JSON.stringify({ query }),
    });
    if (res.ok) return res.json();
    if (res.status < 500) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('GitHub GraphQL kept failing');
}

/** Run aliased sub-queries in batches; returns one result (or null) per query. */
async function batched(parts: string[], token: string): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < parts.length; i += BATCH) {
    const chunk = parts.slice(i, i + BATCH);
    const json = await graphql(`{ ${chunk.map((q, j) => `q${j}: ${q}`).join('\n')} }`, token);
    chunk.forEach((_, j) => out.push(json.data?.[`q${j}`] ?? null));
  }
  return out;
}

const q = JSON.stringify;

export async function fetchGithubActivity(targets: ActivityTarget[], token: string): Promise<GithubActivity> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const valid = targets.map((t) => ({ ...t, r: parseRepo(t.repo) })).filter((t) => t.r);
  const byRepo = new Map<string, typeof valid>();
  for (const t of valid) (byRepo.get(t.r!.url) ?? byRepo.set(t.r!.url, []).get(t.r!.url)!).push(t);
  const repos = [...byRepo.keys()];

  // 1. repo totals
  const totals = await batched(
    repos.map((url) => {
      const { owner, name } = byRepo.get(url)![0].r!;
      return `repository(owner: ${q(owner)}, name: ${q(name)}) {
        issues(filterBy: { since: ${q(since)} }) { totalCount }
        defaultBranchRef { target { ... on Commit { history(since: ${q(since)}) { totalCount } } } }
      }`;
    }),
    token,
  );
  const repoTotal = new Map(repos.map((url, i) => [url, {
    commits: totals[i]?.defaultBranchRef?.target?.history?.totalCount ?? 0,
    issues: totals[i]?.issues?.totalCount ?? 0,
    found: !!totals[i],
  }]));

  // 2. per-spec counts for shared repos
  const shared = valid.filter((t) => byRepo.get(t.r!.url)!.length > 1);
  const scoped = await batched(
    shared.map((t) => {
      const path = scopePath(t.sourcePath);
      return `repository(owner: ${q(t.r!.owner)}, name: ${q(t.r!.name)}) {
        ${path ? `defaultBranchRef { target { ... on Commit { history(since: ${q(since)}, path: ${q(path)}) { totalCount } } } }` : ''}
        ${t.label ? `label(name: ${q(t.label)}) { issues(filterBy: { since: ${q(since)} }) { totalCount } }` : ''}
        nameWithOwner
      }`;
    }),
    token,
  );
  const scopedByKey = new Map(shared.map((t, i) => [t.key, scoped[i]]));

  const specs: Record<string, SpecActivity> = {};
  for (const t of valid) {
    const total = repoTotal.get(t.r!.url)!;
    if (!total.found) continue;
    const siblings = byRepo.get(t.r!.url)!.length;
    if (siblings === 1) {
      specs[t.key] = { repo: t.r!.url, commits: total.commits, issues: total.issues, commitScope: 'repo', issueScope: 'repo' };
      continue;
    }
    const s = scopedByKey.get(t.key);
    const path = scopePath(t.sourcePath);
    const pathCommits = s?.defaultBranchRef?.target?.history?.totalCount;
    const labelIssues = s?.label?.issues?.totalCount;
    specs[t.key] = {
      repo: t.r!.url,
      ...(path && pathCommits !== undefined
        ? { commits: pathCommits, commitScope: 'path' as const, path }
        : { commits: Math.round(total.commits / siblings), commitScope: 'shared' as const }),
      ...(labelIssues !== undefined
        ? { issues: labelIssues, issueScope: 'label' as const, label: t.label }
        : { issues: Math.round(total.issues / siblings), issueScope: 'shared' as const }),
    };
  }
  return { since, fetchedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, specs };
}
