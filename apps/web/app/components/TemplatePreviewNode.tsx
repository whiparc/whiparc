'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { clsx } from 'clsx';

// Read-only sibling of ReactFlowCanvasNode (the real canvas editor's node
// renderer) for the public /templates preview. Deliberately does NOT import
// useCanvasStore — that store holds live workspace-editing state (selection,
// delete, execution status) that has no meaning on a public, possibly
// signed-out preview page. Keep the visual "chrome" in sync by hand if
// ReactFlowCanvasNode's styling changes — see product-memory 10.1 for why
// these aren't unified into one shared component.

type NodeTech = 'Terraform' | 'Ansible' | 'Kubernetes' | 'Source' | 'Target';

interface TemplatePreviewNodeProps {
  data: {
    label: string;
    tech: NodeTech;
    icon?: string;
    categoryLabel?: string;
    description?: string;
  };
}

const TECH_COLOR_CLASS: Record<NodeTech, string> = {
  Terraform: 'bg-primary',
  Ansible: 'bg-[#8B5CF6]',
  Kubernetes: 'bg-[#0EA5E9]',
  Source: 'bg-[#F59E0B]',
  Target: 'bg-[#14B8A6]',
};

const TECH_ICON_COLOR_CLASS: Record<NodeTech, string> = {
  Terraform: 'text-primary',
  Ansible: 'text-[#8B5CF6]',
  Kubernetes: 'text-[#0EA5E9]',
  Source: 'text-[#F59E0B]',
  Target: 'text-[#14B8A6]',
};

const DEFAULT_ICON: Record<NodeTech, string> = {
  Terraform: 'lucide:server',
  Ansible: 'lucide:terminal',
  Kubernetes: 'lucide:layers',
  Source: 'lucide:git-branch',
  Target: 'lucide:cloud',
};

export default function TemplatePreviewNode({ data }: TemplatePreviewNodeProps) {
  const tech = data.tech || 'Terraform';

  return (
    <div className="w-60 bg-card/90 backdrop-blur-md rounded-xl border border-border shadow-xl select-none">
      <div className={clsx('h-1 w-full rounded-t-xl', TECH_COLOR_CLASS[tech])} />

      <div className="p-4 relative">
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-primary !bg-background !left-[-5px] !top-1/2 !-translate-y-1/2 !border-solid"
        />

        <div className="flex items-center gap-1.5 mb-2">
          <Icon icon={data.icon || DEFAULT_ICON[tech]} className={clsx('text-base', TECH_ICON_COLOR_CLASS[tech])} />
          {data.categoryLabel && (
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate max-w-[160px]">
              {data.categoryLabel}
            </span>
          )}
        </div>

        <h4 className="text-sm font-semibold text-foreground mb-1 truncate">{data.label}</h4>

        {data.description && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 h-[34px]">{data.description}</p>
        )}

        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-primary !bg-background !right-[-5px] !top-1/2 !-translate-y-1/2 !border-solid"
        />
      </div>
    </div>
  );
}
