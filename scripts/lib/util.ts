import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = join(ROOT, 'data', 'cache');
export const BUILD = join(ROOT, 'data', 'build');
export const OUT = join(ROOT, 'public', 'map');

export async function readJson<T = any>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path: string, data: unknown, pretty = false) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, pretty ? 2 : 0));
}

export const exists = existsSync;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Normalize spec URLs so TR/ED/alternate variants match each other. */
export function normUrl(u: string): string {
  try {
    const url = new URL(u.replace(/^http:/, 'https:'));
    let p = url.pathname.replace(/\/index\.html?$/, '/').replace(/\/+$/, '');
    return (url.host.toLowerCase() + p).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}
