export interface NodeInfo {
  label: string;
  type: 'spec' | 'group';
  url?: string;
  repo?: string;
  org?: string;
  groups?: string[];
  status?: string;
  standing?: string;
  continent: number;
  country: number;
  features?: string[];
  at: [number, number];
  neighbors: string[];
  members?: string[];
  groupType?: 'wg' | 'ig' | 'cg' | 'other';
  description?: string;
  participants?: number;
  curated?: boolean;
}
export interface FeatureInfo {
  name: string;
  baseline: 'high' | 'low' | false;
  spec: string;
  description: string;
}
export interface MapIndex {
  generated: string;
  continents: { id: number; island: boolean; anchor: string; subtitle: string }[];
  countries: { id: number; continent: number; anchor: string; subtitle: string }[];
  nodes: Record<string, NodeInfo>;
  features: Record<string, FeatureInfo>;
}

export async function loadIndex(base: string): Promise<MapIndex> {
  const res = await fetch(`${base}map/index.json`);
  return res.json();
}
