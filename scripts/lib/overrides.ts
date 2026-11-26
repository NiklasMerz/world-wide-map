import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ROOT } from './util.ts';

export interface ExtraSpec {
  id: string;
  title: string;
  url: string;
  repo?: string;
  org?: string;
  groups?: string[];
}

export interface Overrides {
  specs: ExtraSpec[];
  links: { source: string; target: string; weight?: number; note?: string }[];
  exclude: string[];
}

async function load(file: string) {
  return parse(await readFile(join(ROOT, 'data', 'overrides', file), 'utf8'));
}

export async function loadOverrides(): Promise<Overrides> {
  const [specs, links, exclude] = await Promise.all([load('specs.yaml'), load('links.yaml'), load('exclude.yaml')]);
  return {
    specs: specs ?? [],
    links: links ?? [],
    exclude: exclude ?? [],
  };
}
