'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TemplatePreviewNode from './TemplatePreviewNode';

interface TemplateCanvasPreviewProps {
  nodes: Node[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
  // false = a static "poster" render for a catalog card body: no pan, no
  // scroll-zoom, no controls. Cards sit in a scrollable grid, so a card-level
  // preview that captures the mouse wheel (like the full detail view
  // deliberately does) would make scrolling the grid itself feel broken.
  interactive?: boolean;
}

type NodeTech = 'Terraform' | 'Ansible' | 'Kubernetes' | 'Source' | 'Target';

// Mirrors useCanvasStore's onConnect edge-coloring rules (the same logic the
// real editor uses when a user draws a connection) so a template previews
// with the same "beautifully connected" gradient/animated look it would have
// in the workspace — computed here rather than trusted from storage, since
// hand-written seed/placeholder edges_json won't carry baked-in style/
// animated fields the way a real editor-authored save does.
function resolveEdgeVisuals(sourceTech: NodeTech | undefined, targetTech: NodeTech | undefined) {
  if (sourceTech === 'Source') return { stroke: '#F59E0B', animated: false };
  if (sourceTech === 'Target') return { stroke: '#14B8A6', animated: false };
  if (sourceTech === 'Terraform' && targetTech === 'Terraform') return { stroke: '#6366F1', animated: false };
  if (sourceTech === 'Terraform' && targetTech === 'Ansible') return { stroke: 'url(#grad-tf-ansible)', animated: true };
  if (sourceTech === 'Ansible' && targetTech === 'Kubernetes') return { stroke: 'url(#grad-ansible-k8s)', animated: false };
  if (sourceTech === 'Kubernetes' && targetTech === 'Kubernetes') return { stroke: '#0EA5E9', animated: false };
  return { stroke: '#8B5CF6', animated: false };
}

function PreviewInner({ nodes, edges, viewport, interactive = true }: TemplateCanvasPreviewProps) {
  const nodeTypes = useMemo(() => ({ customNode: TemplatePreviewNode }), []);

  const styledEdges = useMemo(() => {
    const techById = new Map(nodes.map((n) => [n.id, (n.data as { tech?: NodeTech })?.tech]));
    return edges.map((edge) => {
      if (edge.style && (edge.style as { stroke?: string }).stroke) return edge;
      const { stroke, animated } = resolveEdgeVisuals(techById.get(edge.source), techById.get(edge.target));
      return { ...edge, style: { stroke, strokeWidth: 2.5 }, animated };
    });
  }, [nodes, edges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      defaultViewport={viewport}
      fitView={!viewport}
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.3}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
      {interactive && <Controls showInteractive={false} />}

      {/* SVG gradient defs referenced by resolveEdgeVisuals — mirrors the
          hidden defs block in workspace/page.tsx's canvas. */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <linearGradient id="grad-tf-ansible" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="grad-ansible-k8s" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
      </svg>
    </ReactFlow>
  );
}

export function TemplateCanvasPreview({ nodes, edges, viewport, interactive = true }: TemplateCanvasPreviewProps) {
  if (!nodes.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
        No canvas preview available for this template.
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      {/* Non-interactive mode is wrapped pointer-events-none as a second,
          belt-and-suspenders guard beyond the pan/zoom props above: a card
          sits in a scrollable grid, and nothing about its embedded preview
          should be able to swallow a hover, click, or wheel event meant for
          the page or the card's own "View Template" link. */}
      <div className={interactive ? 'h-full w-full' : 'h-full w-full pointer-events-none'}>
        <PreviewInner nodes={nodes} edges={edges} viewport={viewport} interactive={interactive} />
      </div>
    </ReactFlowProvider>
  );
}
