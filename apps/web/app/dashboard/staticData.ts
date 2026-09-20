// Placeholder content for the dashboard sections that have no backing API
// yet (runs history, sandbox agent heartbeat, spend, activity log). Kept
// separate from DashboardV2.tsx so it's obvious at a glance what's real
// data (fetched from the API) versus illustrative (ported from the design
// mock's own ALL_RUNS/example values) until those endpoints exist.

export interface StaticRun {
  id: string;
  project: string;
  target: string;
  dur: string;
  when: string;
  status: 'success' | 'failed';
}

export const STATIC_RUNS: StaticRun[] = [
  { id: 'r-8c41f2', project: 'platform-infra', target: 'aws eu-west-1', dur: '2m 14s', when: '2h ago', status: 'success' },
  { id: 'r-7b09ad', project: 'edge-cache', target: 'local_agent', dur: '38s', when: '40m ago', status: 'failed' },
  { id: 'r-7a55e1', project: 'edge-cache', target: 'local_agent', dur: '41s', when: '1h ago', status: 'failed' },
  { id: 'r-6f20cc', project: 'platform-infra', target: 'local_agent', dur: '1m 02s', when: 'yesterday', status: 'success' },
  { id: 'r-6a18b4', project: 'data-pipeline', target: 'local_agent', dur: '54s', when: 'yesterday', status: 'success' },
];

export const STATIC_ACTIVITY = [
  { when: '2h', text: 'You deployed platform-infra to aws eu-west-1.' },
  { when: '40m', text: 'Apply failed on edge-cache — ingress class missing.' },
  { when: '1d', text: 'A teammate imported 4 resources from legacy.tf.' },
];
