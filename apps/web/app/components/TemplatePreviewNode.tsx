'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@iconify/react';

// Read-only sibling of ReactFlowCanvasNode (the real canvas editor's node
// renderer) for the public /templates preview. Deliberately does NOT import
// useCanvasStore — that store holds live workspace-editing state (selection,
// delete, execution status) that has no meaning on a public, possibly
// signed-out preview page. Mirrors ReactFlowCanvasNode's hand-drawn "sticky
// note" treatment (per-node rotation/wobble, Kalam font) by hand — see
// product-memory 10.1 for why these aren't unified into one shared
// component; keep the two in sync if ReactFlowCanvasNode's sketch styling
// changes.

type NodeTech = 'Terraform' | 'Ansible' | 'Kubernetes' | 'Source' | 'Target';

interface TemplatePreviewNodeProps {
  id: string;
  data: {
    label: string;
    tech: NodeTech;
    icon?: string;
    categoryLabel?: string;
    description?: string;
  };
}

const TECH_COLOR: Record<NodeTech, string> = {
  Terraform: 'var(--accent-ink, #9EA2F9)',
  Ansible: 'var(--amber, #F59E0B)',
  Kubernetes: 'var(--k8s-ink, #7DD3FC)',
  Source: 'var(--amber, #F59E0B)',
  Target: 'var(--target-ink, #5EEAD4)',
};

const DEFAULT_ICON: Record<NodeTech, string> = {
  Terraform: 'lucide:server',
  Ansible: 'lucide:terminal',
  Kubernetes: 'lucide:layers',
  Source: 'lucide:git-branch',
  Target: 'lucide:cloud',
};

// Two hand-drawn border-radius "wobbles", alternated per node (by id hash)
// so neighboring cards don't look identical — same values as
// ReactFlowCanvasNode so a template preview reads as the same hand.
const WOBBLE_RADIUS = [
  '15px 225px 15px 255px / 225px 15px 255px 15px',
  '225px 15px 255px 15px / 15px 255px 15px 225px',
];

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function TemplatePreviewNode({ id, data }: TemplatePreviewNodeProps) {
  const tech = data.tech || 'Terraform';
  const color = TECH_COLOR[tech] || TECH_COLOR.Kubernetes;

  const seed = React.useMemo(() => hashSeed(id), [id]);
  const rotation = ((seed % 50) / 10 - 2.5).toFixed(2); // -2.5deg .. +2.5deg
  const radius = WOBBLE_RADIUS[seed % 2];

  return (
    <div className="relative select-none" style={{ width: 200, padding: 8 }}>
      {/* Real hit-box / handle anchors — stay axis-aligned regardless of the
          sketch card's rotation below, so edges always connect precisely. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !bg-background !left-[-5px] !top-1/2 !-translate-y-1/2 !border-solid"
        style={{ borderColor: color }}
      />

      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          borderRadius: radius,
          border: `2.5px solid ${color}`,
          background: `color-mix(in srgb, ${color} 8%, var(--panel, #0D0F16))`,
          padding: '9px 11px 8px',
          fontFamily: 'var(--font-handwriting, cursive)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0" style={{ fontWeight: 700, fontSize: 9.5, letterSpacing: '.02em', textTransform: 'uppercase', color }}>
          <Icon icon={data.icon || DEFAULT_ICON[tech]} className="text-sm shrink-0" />
          {data.categoryLabel && <span className="truncate">{data.categoryLabel}</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink, #fff)', marginTop: 2 }} className="truncate">
          {data.label}
        </div>
        {data.description && (
          <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.3, color: 'var(--ink2, #94A3B8)' }} className="line-clamp-2">
            {data.description}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !bg-background !right-[-5px] !top-1/2 !-translate-y-1/2 !border-solid"
        style={{ borderColor: color }}
      />
    </div>
  );
}
