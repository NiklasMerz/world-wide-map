/**
 * W3C groups (working, interest and community groups) from api.w3.org, no key needed.
 * Participants are only kept as hashed ids, used to measure how much groups overlap.
 */
import { hash, pool } from '../lib/util.ts';

export interface W3CGroup {
  type: 'wg' | 'ig' | 'cg';
  shortname: string;
  name: string;
  homepage?: string;
  description: string;
  /** hashed participant ids */
  participants: number[];
}

const API = 'https://api.w3.org';

async function get(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchW3CGroups(): Promise<W3CGroup[]> {
  const groups: W3CGroup[] = [];
  for (const type of ['wg', 'ig', 'cg'] as const) {
    const list = await get(`${API}/groups/${type}?items=1000&embed=true`);
    for (const g of list._embedded?.groups ?? []) {
      if (g.is_closed) continue;
      groups.push({ type, shortname: g.shortname, name: g.name, homepage: g._links?.homepage?.href, description: stripHtml(g.description ?? ''), participants: [] });
    }
  }
  let done = 0;
  await pool(groups, 8, async (g) => {
    try {
      let url: string | undefined = `${API}/groups/${g.type}/${g.shortname}/users?items=1000`;
      while (url) {
        const page = await get(url);
        for (const u of page._links?.users ?? []) if (!u.former) g.participants.push(hash(u.href));
        url = page.page < page.pages ? page._links?.next?.href : undefined;
      }
    } catch (e) {
      console.warn(`  w3c: participants failed for ${g.shortname}: ${(e as Error).message}`);
    }
    if (++done % 50 === 0) console.log(`  w3c participants ${done}/${groups.length}`);
  });
  return groups;
}
