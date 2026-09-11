'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Node, Edge } from '@xyflow/react';
import { TiltCard } from './landing/TiltCard';
import { TemplateCanvasPreview } from './TemplateCanvasPreview';
import type { Template } from '../lib/types';

interface TemplateCardProps {
  template: Template;
}

// Catalog grid card: the template's own canvas graph as the card body (a
// static, non-interactive preview — see TemplateCanvasPreview's `interactive`
// prop), a "Show details" toggle that animates the description/tags open
// in-place, and a "View Template" link that opens the full popup (an
// intercepting route over /templates when clicked from this grid — see
// product-memory 10.1).
export function TemplateCard({ template }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const { nodes, edges } = useMemo(() => {
    try {
      const n = JSON.parse(template.nodes_json || '[]');
      const e = JSON.parse(template.edges_json || '[]');
      return { nodes: Array.isArray(n) ? (n as Node[]) : [], edges: Array.isArray(e) ? (e as Edge[]) : [] };
    } catch {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }
  }, [template.nodes_json, template.edges_json]);

  return (
    <TiltCard
      tiltLimit={0}
      scale={1}
      spotlight
      className="rounded-[24px] border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/30 hover:shadow-2xl transition-colors duration-300 shadow-xl overflow-hidden flex flex-col group"
    >
      <Link href={`/templates/${template.id}`} className="block h-40 w-full border-b border-border/40 bg-background/40 relative shrink-0">
        <TemplateCanvasPreview nodes={nodes} edges={edges} interactive={false} />
      </Link>

      <div className="p-6 flex flex-col gap-4 flex-1">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{template.category}</span>
            <div className="flex items-center gap-1 text-slate-500">
              <Icon icon="lucide:download" className="text-xs" />
              <span className="text-[10px] font-medium">{template.install_count}</span>
            </div>
          </div>
          <Link href={`/templates/${template.id}`}>
            <h3 className="text-lg font-bold text-white group-hover:text-primary transition duration-200">{template.title}</h3>
          </Link>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition w-fit cursor-pointer"
        >
          <span>Show details</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <Icon icon="lucide:chevron-down" className="text-sm" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <p className="text-sm text-slate-400 leading-relaxed pb-1">
                {template.description || 'No description provided.'}
              </p>
              {template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {template.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="text-[10px] font-medium text-slate-400 bg-card border border-border/80 rounded-md px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-4">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Icon icon="lucide:user" className="text-sm" />
            <span className="text-[10px] font-medium truncate max-w-[120px]">{template.author_name || 'Whiparc Official'}</span>
          </div>
          <Link
            href={`/templates/${template.id}`}
            className="rounded-xl bg-secondary group-hover:bg-primary group-hover:text-white px-4 py-2 text-xs font-bold text-slate-300 transition duration-200 flex items-center gap-1"
          >
            <span>View Template</span>
            <Icon icon="lucide:chevron-right" className="text-sm" />
          </Link>
        </div>
      </div>
    </TiltCard>
  );
}
