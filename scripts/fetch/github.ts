/** 90-day activity per repo via the GraphQL API, 40 repos per request. */
export interface RepoActivity {
  commits90d: number;
  issues90d: number;
  pushedAt: string | null;
  stars: number;
}

export async function fetchGithubActivity(repoUrls: string[], token: string) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const parsed = repoUrls
    .map((u) => u.match(/github\.com\/([^/]+)\/([^/#?]+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ owner: m[1], name: m[2].replace(/\.git$/, ''), url: `https://github.com/${m[1]}/${m[2]}` }));
  const out: Record<string, RepoActivity> = {};
  for (let i = 0; i < parsed.length; i += 40) {
    const batch = parsed.slice(i, i + 40);
    const q = batch
      .map(
        (r, j) => `r${j}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) {
          pushedAt stargazerCount
          issues(filterBy: { since: "${since}" }) { totalCount }
          defaultBranchRef { target { ... on Commit { history(since: "${since}") { totalCount } } } }
        }`,
      )
      .join('\n');
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'worldwidemap' },
      body: JSON.stringify({ query: `{ ${q} }` }),
    });
    const json: any = await res.json();
    batch.forEach((r, j) => {
      const d = json.data?.[`r${j}`];
      if (!d) return;
      out[r.url.toLowerCase()] = {
        commits90d: d.defaultBranchRef?.target?.history?.totalCount ?? 0,
        issues90d: d.issues?.totalCount ?? 0,
        pushedAt: d.pushedAt,
        stars: d.stargazerCount,
      };
    });
  }
  return out;
}
