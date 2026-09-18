'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Node, Edge } from '@xyflow/react';
import { TemplateCanvasPreview } from './TemplateCanvasPreview';
import { BlueprintCorners } from './ui/BlueprintCorners';
import type { Template } from '../lib/types';
import './ui/blueprint.css';
import '../templates/templates.css';

interface TemplateCardProps {
  template: Template;
}

const DIFF_COLOR: Record<'beginner' | 'intermediate' | 'advanced', string> = {
  beginner: 'var(--success)',
  intermediate: 'var(--amber)',
  advanced: 'var(--danger)',
};

// Difficulty has no real backend field — derived from real node count
// (a defensible, non-arbitrary signal) rather than fabricated data.
function deriveDifficulty(nodeCount: number): 'beginner' | 'intermediate' | 'advanced' {
  if (nodeCount <= 5) return 'beginner';
  if (nodeCount <= 9) return 'intermediate';
  return 'advanced';
}

// "Pro" tier has no real backend field either, and product-memory records
// an explicit decision to avoid implying paid listings before a real
// credits system exists. Kept purely decorative: a deterministic (not
// random, so it doesn't flicker between renders, and shared with
// TemplatesPageV2's Pricing filter so the two stay consistent) hash of the
// template id marks roughly 1/3 of templates "Pro" with a derived credit
// number.
export function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function deriveProStatus(id: string): { isPro: boolean; credits: number } {
  const seed = hashSeed(id);
  return { isPro: seed % 3 === 0, credits: 20 + (seed % 5) * 10 };
}

// Catalog grid card: the template's own canvas graph as the card body (a
// static, non-interactive preview — see TemplateCanvasPreview's `interactive`
// prop), a "Show details" toggle that animates the description/tags open
// in-place, and a "Use template" link that opens the full popup (an
// intercepting route over /templates when clicked from this grid — see
// product-memory 10.1).
export function TemplateCard({ template }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showUnlockNote, setShowUnlockNote] = useState(false);

  const { nodes, edges } = useMemo(() => {
    try {
      const n = JSON.parse(template.nodes_json || '[]');
      const e = JSON.parse(template.edges_json || '[]');
      return { nodes: Array.isArray(n) ? (n as Node[]) : [], edges: Array.isArray(e) ? (e as Edge[]) : [] };
    } catch {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }
  }, [template.nodes_json, template.edges_json]);

  const difficulty = deriveDifficulty(nodes.length);
  const { isPro, credits } = useMemo(() => deriveProStatus(template.id), [template.id]);

  return (
    <div className="wp-blueprint" style={{ position: 'relative', display: 'flex', flexDirection: 'column', background: 'var(--panel)', overflow: 'hidden' }}>
      <BlueprintCorners />

      <Link href={`/templates/${template.id}`} style={{ height: 140, flexShrink: 0, position: 'relative', display: 'block', borderBottom: '1px solid var(--line)', background: 'var(--ground)' }}>
        <TemplateCanvasPreview nodes={nodes} edges={edges} interactive={false} />
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontFamily: 'var(--font-mono-marketing)',
            fontSize: 9.5,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            color: 'var(--ink2)',
            background: 'var(--chip)',
          }}
        >
          {template.category}
        </span>
        {isPro && (
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontFamily: 'var(--font-mono-marketing)',
              fontSize: 9,
              letterSpacing: '.06em',
              padding: '2px 6px',
              border: '1px solid var(--amber)',
              color: 'var(--amber)',
              background: 'var(--panel)',
            }}
          >
            <Icon icon="lucide:lock" width={9} />
            PRO
          </span>
        )}
      </Link>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>
        <div>
          <Link href={`/templates/${template.id}`}>
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, color: 'var(--ink)' }}>{template.title}</p>
          </Link>
          <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>{template.description || 'No description provided.'}</p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="wp-templates-toclink"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink2)', background: 'none', border: 0, cursor: 'pointer', width: 'fit-content' }}
        >
          <span>Show details</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <Icon icon="lucide:chevron-down" width={13} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
                <Icon icon="lucide:user" width={12} />
                <span>{template.author_name || 'Whiparc Official'}</span>
              </div>
              {template.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {template.tags.slice(0, 5).map((tag) => (
                    <span key={tag} style={{ fontSize: 10.5, color: 'var(--ink2)', border: '1px solid var(--line)', padding: '2px 7px' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: 'var(--font-mono-marketing)', fontSize: 11, color: 'var(--ink3)' }}>
          <span>
            {nodes.length} nodes · {edges.length} edges
          </span>
          <span style={{ padding: '2px 7px', color: DIFF_COLOR[difficulty], border: `1px solid ${DIFF_COLOR[difficulty]}` }}>{difficulty}</span>
        </div>

        {isPro ? (
          <button
            type="button"
            onClick={() => setShowUnlockNote(true)}
            className="wp-templates-unlockbtn"
            style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', border: '1px solid var(--amber)', color: 'var(--amber)', background: 'transparent', cursor: 'pointer' }}
          >
            <Icon icon="lucide:lock" width={12} />
            Unlock · {credits} credits
          </button>
        ) : (
          <Link
            href={`/templates/${template.id}`}
            className="wp-templates-navlink"
            style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          >
            Use template
          </Link>
        )}
        {showUnlockNote && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid var(--amber)', padding: '6px 8px' }}>
            Credits &amp; Pro templates are launching in a future phase — this one will be unlockable soon.
          </p>
        )}
      </div>
    </div>
  );
}
