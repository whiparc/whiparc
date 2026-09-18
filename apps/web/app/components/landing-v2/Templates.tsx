'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import { Seam } from './Seam';
import type { Template, TemplateListResponse } from '../../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Three abstract line-diagram shapes, cycled by index across whichever real
// templates come back — a lightweight decorative marketing visual, not a
// literal per-node rendering (that's what the real /templates catalog's
// TemplateCanvasPreview + TemplatePreviewNode hand-drawn cards are for).
const DIAGRAM_SHAPES = [
  (
    <>
      <line x1="24" y1="30" x2="50" y2="52" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="50" y1="52" x2="76" y2="30" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="50" y1="52" x2="50" y2="78" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <circle cx="24" cy="30" r="3.5" fill="#4F46E5" />
      <circle cx="76" cy="30" r="3.5" fill="#4F46E5" />
      <circle cx="50" cy="52" r="3.5" fill="#4F46E5" />
      <circle cx="50" cy="78" r="3.5" fill="#B45309" />
    </>
  ),
  (
    <>
      <line x1="26" y1="26" x2="26" y2="72" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="26" y1="72" x2="74" y2="72" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="74" y1="72" x2="74" y2="26" stroke="#B45309" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <circle cx="26" cy="26" r="3.5" fill="#4F46E5" />
      <circle cx="26" cy="72" r="3.5" fill="#4F46E5" />
      <circle cx="74" cy="72" r="3.5" fill="#4F46E5" />
      <circle cx="74" cy="26" r="3.5" fill="#B45309" />
    </>
  ),
  (
    <>
      <line x1="20" y1="50" x2="50" y2="50" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="50" y1="50" x2="80" y2="34" stroke="#4F46E5" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <line x1="50" y1="50" x2="80" y2="66" stroke="#B45309" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
      <circle cx="20" cy="50" r="3.5" fill="#4F46E5" />
      <circle cx="50" cy="50" r="3.5" fill="#4F46E5" />
      <circle cx="80" cy="34" r="3.5" fill="#4F46E5" />
      <circle cx="80" cy="66" r="3.5" fill="#B45309" />
    </>
  ),
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
        // A marketing homepage should never show a broken-looking section
        // over a feature nobody asked to see fail — quietly render nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Same principle as TemplateDetailContent's error states, taken one step
  // further: this section isn't the primary reason anyone is on the page.
  if (templates.length === 0) return null;

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
          {templates.map((tpl, i) => {
            let nodeCount = 0;
            let edgeCount = 0;
            try {
              nodeCount = (JSON.parse(tpl.nodes_json || '[]') as unknown[]).length;
              edgeCount = (JSON.parse(tpl.edges_json || '[]') as unknown[]).length;
            } catch {
              // leave at 0 — a malformed seed shouldn't break the homepage
            }
            return (
              <Link key={tpl.id} href={`/templates/${tpl.id}`} className="wp-blueprint" style={{ position: 'relative', display: 'block', padding: 'clamp(16px,2vw,22px)', background: 'transparent' }}>
                <BlueprintCorners />
                <div
                  style={{
                    height: 110,
                    border: '1px solid var(--line)',
                    backgroundImage:
                      'linear-gradient(rgba(15,18,32,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(15,18,32,.05) 1px,transparent 1px)',
                    backgroundSize: '22px 22px',
                    position: 'relative',
                  }}
                >
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    {DIAGRAM_SHAPES[i % DIAGRAM_SHAPES.length]}
                  </svg>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--ink)', marginTop: 14 }}>{tpl.title}</div>
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--ink2)' }}>{tpl.description || 'No description provided.'}</p>
                <div style={{ display: 'flex', gap: 14, marginTop: 12, fontFamily: 'var(--font-mono-marketing)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink2)' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{nodeCount} nodes</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{edgeCount} edges</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{tpl.category}</span>
                </div>
              </Link>
            );
          })}
        </div>
        <p data-reveal style={{ margin: 'clamp(20px,2.6vw,30px) 0 0', maxWidth: '52em', fontSize: 14, lineHeight: 1.6, color: 'var(--ink2)' }}>
          Every template is a normal project once you fork it. Rename things, delete the RDS node, swap the region — it
          re-emits and you own the output.
        </p>
      </div>
    </section>
  );
}
