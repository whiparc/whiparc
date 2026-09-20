'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import { Seam } from './Seam';
import type { Node, Edge } from '@xyflow/react';
import { TemplateCanvasPreview } from '../TemplateCanvasPreview';
import type { Template, TemplateListResponse } from '../../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Static content from the design mockup. Rendered whenever the templates API
// is unreachable or returns nothing, so the marketing page never depends on
// a running backend — the section must always exist because Pricing's Seam
// expects a light band above it (removing the section leaves a blank strip).
const fbNode = (id: string, x: number, label: string, tech: string, categoryLabel: string): Node => ({
  id,
  type: 'customNode',
  position: { x, y: 0 },
  data: { label, tech, categoryLabel },
});
const fbEdge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

const FALLBACK_GRAPHS: { nodes: Node[]; edges: Edge[] }[] = [
  {
    nodes: [fbNode('a', 0, 'Web Server', 'Terraform', 'AWS Resource'), fbNode('b', 260, 'App Server', 'Terraform', 'AWS Resource'), fbNode('c', 520, 'Postgres (RDS)', 'Terraform', 'AWS Resource')],
    edges: [fbEdge('a', 'b'), fbEdge('b', 'c')],
  },
  {
    nodes: [fbNode('a', 0, 'Target Host', 'Target', 'Cloud Target'), fbNode('b', 260, 'App Provisioning', 'Ansible', 'Ansible Task')],
    edges: [fbEdge('a', 'b')],
  },
  {
    nodes: [fbNode('a', 0, 'Deployment', 'Kubernetes', 'K8s Resource'), fbNode('b', 260, 'Service', 'Kubernetes', 'K8s Resource')],
    edges: [fbEdge('a', 'b')],
  },
];

const FALLBACK_TEMPLATES = [
  { id: '', title: 'AWS three-tier web', body: 'VPC, two private subnets, ALB, autoscaled app tier, RDS. The one most people start from.', meta: ['14 nodes', '19 edges', 'terraform'] },
  { id: '', title: 'Single-node k8s + Ansible', body: 'One box, k3s, ingress and a playbook that installs it. Cheap staging that behaves like production.', meta: ['8 nodes', '9 edges', 'tf + ansible'] },
  { id: '', title: 'Static site + CDN', body: "S3, CloudFront, ACM cert and a DNS record. Twelve lines of HCL you'd rather not write again.", meta: ['6 nodes', '7 edges', 'terraform'] },
];

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/templates?sort=popular&limit=3`);
        if (!res.ok) return;
        const data: TemplateListResponse = await res.json();
        if (!cancelled) setTemplates(data.templates || []);
      } catch {
        // API unreachable — keep showing FALLBACK_TEMPLATES below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = templates.length > 0
    ? templates.map((tpl) => {
        let nodes: Node[] = [];
        let edges: Edge[] = [];
        try {
          const n = JSON.parse(tpl.nodes_json || '[]');
          const e = JSON.parse(tpl.edges_json || '[]');
          if (Array.isArray(n)) nodes = n;
          if (Array.isArray(e)) edges = e;
        } catch {
          // leave empty — a malformed seed shouldn't break the homepage
        }
        return { id: tpl.id, title: tpl.title, body: tpl.description || 'No description provided.', meta: [`${nodes.length} nodes`, `${edges.length} edges`, tpl.category], nodes, edges };
      })
    : FALLBACK_TEMPLATES.map((t, i) => ({ ...t, ...FALLBACK_GRAPHS[i % FALLBACK_GRAPHS.length] }));

  return (
    <section
      id="start"
      data-band="light"
      style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--ground)', color: 'var(--ink)', padding: 'clamp(60px,8vw,120px) clamp(16px,4vw,44px)' }}
    >
      <Seam pair="dark:light" />
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div data-reveal style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ maxWidth: '40em' }}>
            <div style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
              Start from something real
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'clamp(30px,4.6vw,62px)',
                lineHeight: 1,
                letterSpacing: '-.03em',
                margin: '12px 0 0',
                color: 'var(--ink)',
              }}
            >
              Fork a stack that already plans.
            </h2>
          </div>
          <Link
            href="/templates"
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', padding: '12px 18px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', color: 'var(--ink)' }}
          >
            <span>All templates</span>
            <Icon icon="lucide:arrow-up-right" width={15} />
          </Link>
        </div>

        <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,270px),1fr))', gap: 'clamp(16px,2vw,26px)', marginTop: 'clamp(28px,4vw,48px)' }}>
          {cards.map((tpl) => (
            <Link key={tpl.id || tpl.title} href={tpl.id ? `/templates/${tpl.id}` : '/templates'} className="wp-blueprint" style={{ position: 'relative', display: 'block', padding: 'clamp(16px,2vw,22px)', background: 'transparent' }}>
              <BlueprintCorners />
              <div style={{ height: 140, border: '1px solid var(--line)', background: 'var(--ground)', position: 'relative', overflow: 'hidden' }}>
                <TemplateCanvasPreview nodes={tpl.nodes} edges={tpl.edges} interactive={false} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--ink)', marginTop: 14 }}>{tpl.title}</div>
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--ink2)' }}>{tpl.body}</p>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontFamily: 'var(--font-mono-marketing)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink2)' }}>
                {tpl.meta.map((m) => (
                  <span key={m} style={{ whiteSpace: 'nowrap' }}>
                    {m}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
        <p data-reveal style={{ margin: 'clamp(20px,2.6vw,30px) 0 0', maxWidth: '52em', fontSize: 14, lineHeight: 1.6, color: 'var(--ink2)' }}>
          Every template is a normal project once you fork it. Rename things, delete the RDS node, swap the region — it
          re-emits and you own the output.
        </p>
      </div>
    </section>
  );
}
