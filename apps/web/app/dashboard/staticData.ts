// Placeholder content for the dashboard sections that have no backing API
// yet (activity log — see product-memory 08.5 item A5). Kept separate from
// DashboardV2.tsx so it's obvious at a glance what's real data (fetched
// from the API) versus illustrative until that endpoint exists. Runs and
// stat tiles (A1/A2) and the sandbox agent card (A4, dropped) used to live
// here too — both are gone now that the former is real and the latter was
// removed in favor of the workspace's own per-project sandbox badge.

export const STATIC_ACTIVITY = [
  { when: '2h', text: 'You deployed platform-infra to aws eu-west-1.' },
  { when: '40m', text: 'Apply failed on edge-cache — ingress class missing.' },
  { when: '1d', text: 'A teammate imported 4 resources from legacy.tf.' },
];
