export type NodeType = 'spec' | 'group';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  url?: string;
  repo?: string;
  org?: string;
  groups?: string[];
  standing?: string;
  status?: string;
  /** web-features ids attached to this spec */
  features?: string[];
  /** groups: wg | ig | cg from the W3C API, or 'other' (WHATWG, TC39, Khronos…) */
  groupType?: 'wg' | 'ig' | 'cg' | 'other';
  description?: string;
  participants?: number;
  /** true for specs added through data/overrides/specs.yaml */
  curated?: boolean;
  /** activity score that raises hills: log(1 + commits + issues), or the reference fallback. 0 for groups */
  activity: number;
  /** dot size and land radius: activity for specs, participant count for groups */
  size?: number;
  /** raw GitHub counts for the activity window (specs only) */
  github?: import('../fetch/github.ts').SpecActivity;
  // filled by later steps
  continent?: number;
  country?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  /** people = groups sharing participants */
  kind: 'normative' | 'informative' | 'group' | 'people' | 'override';
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  baseline: 'high' | 'low' | false;
  spec: string;
}

export interface ActivityMeta {
  /** github = commits + issues per spec; references = fallback when no token was available */
  source: 'github' | 'references';
  since?: string;
  fetchedAt?: string;
  windowDays?: number;
}

export interface Graph {
  activity?: ActivityMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  features: Feature[];
  continents?: { id: number; island: boolean; anchor: string; subtitle: string }[];
  countries?: { id: number; continent: number; anchor: string; subtitle: string }[];
}
