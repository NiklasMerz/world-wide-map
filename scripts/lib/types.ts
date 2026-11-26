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
  /** activity score used for elevation */
  activity: number;
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
  kind: 'normative' | 'informative' | 'group' | 'override';
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  baseline: 'high' | 'low' | false;
  spec: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  features: Feature[];
  continents?: { id: number; island: boolean; anchor: string; subtitle: string }[];
  countries?: { id: number; continent: number; anchor: string; subtitle: string }[];
}
