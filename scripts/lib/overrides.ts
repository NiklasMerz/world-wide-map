import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ROOT } from './util.ts';

export interface Overrides {
  links: { source: string; target: string; weight?: number; note?: string }[];
  exclude: string[];
}

async function load(file: string) {
  return parse(await readFile(join(ROOT, 'data', 'overrides', file), 'utf8'));
}

export async function loadOverrides(): Promise<Overrides> {
  const [links, exclude] = await Promise.all([load('links.yaml'), load('exclude.yaml')]);
  return {
    links: links ?? [],
    exclude: exclude ?? [],
  };
}
