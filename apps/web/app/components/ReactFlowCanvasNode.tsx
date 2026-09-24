'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { clsx } from 'clsx';
import useCanvasStore, { NodeExecutionStatus } from '../store/useCanvasStore';

interface ReactFlowCanvasNodeProps {
  id: string;
  data: {
    label: string;
    tech: 'Terraform' | 'Ansible' | 'Kubernetes' | 'Source' | 'Target';
    icon: string;
    categoryLabel: string;
    description: string;
    status: 'Validated' | 'Warning' | 'Editing';
    statusText: string;
    editorName?: string;
    isCustom?: boolean;
  };
  selected?: boolean;
}

const TECH_COLOR: Record<ReactFlowCanvasNodeProps['data']['tech'], string> = {
  Terraform: 'var(--accent-ink, #FF8A63)',
  Ansible: 'var(--amber, #F59E0B)',
  Kubernetes: 'var(--k8s-ink, #7DD3FC)',
  Source: 'var(--amber, #F59E0B)',
  Target: 'var(--target-ink, #5EEAD4)',
};

// Two hand-drawn border-radius "wobbles" from the design mock, alternated
// per node (by id hash) so neighboring cards don't look identical.
const WOBBLE_RADIUS = [
  '15px 225px 15px 255px / 225px 15px 255px 15px',
  '225px 15px 255px 15px / 15px 255px 15px 225px',
];

// Deterministic per-node "hand-placed" tilt — stable across re-renders (so
// dragging/reselecting a node doesn't re-roll its angle) but varies enough
// node-to-node to read as sketched rather than templated. Node id is the
// natural seed since it's already stable per node.
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function ExecutionStatusBar({ status, isDestroy }: { status: NodeExecutionStatus; isDestroy: boolean }) {
  if (status === 'idle') return null;

  const runningBar = isDestroy
    ? { bar: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400', textColor: 'text-red-400' }
    : { bar: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400', textColor: 'text-blue-400' };

  const configs: Record<Exclude<NodeExecutionStatus, 'idle'>, { bar: string; dot: string; label: string; pulse: boolean; textColor: string }> = {
    pending:   { bar: 'bg-muted/80 border-border',              dot: 'bg-muted-foreground',  label: 'Pending',   pulse: false, textColor: 'text-muted-foreground' },
    running:   { ...runningBar,                                                               label: 'Running…',  pulse: true  },
    completed: { bar: 'bg-emerald-500/10 border-emerald-500/20',dot: 'bg-emerald-400',        label: 'Completed', pulse: false, textColor: 'text-emerald-400'      },
    failed:    { bar: 'bg-red-500/10 border-red-500/20',        dot: 'bg-red-400',            label: 'Failed',    pulse: false, textColor: 'text-red-400'           },
  };

  const { bar, dot, label, pulse, textColor } = configs[status];

  return (
    <div className={clsx('flex items-center gap-1.5 px-3 py-1 border-t mt-1.5 rounded-b', bar)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', dot, pulse && 'animate-pulse')} />
      <span className={clsx('text-[9px] font-semibold uppercase tracking-wider', textColor)}>{label}</span>
    </div>
  );
}

export default function ReactFlowCanvasNode({ id, data }: ReactFlowCanvasNodeProps) {
  const { setSelectedNodeId, deleteNode, selectedNodeId, edges, deleteEdge, saveStatus } = useCanvasStore();
  const isExecuting = useCanvasStore((state) => state.isExecuting);
  const execStatus = useCanvasStore((state) => state.executionStatuses[id] ?? 'idle');
  const pipelineAction = useCanvasStore((state) => state.pipelineAction);
  const isReadOnly = isExecuting || saveStatus === 'readonly';

  const incomingEdges = React.useMemo(() => edges.filter((e) => e.target === id), [edges, id]);
  const outgoingEdges = React.useMemo(() => edges.filter((e) => e.source === id), [edges, id]);

  // Zustand selectedNodeId is the single source of truth for the active marker.
  // React Flow's `selected` prop is intentionally ignored here — it reflects internal
  // drag/box-select state and causes double-active badges when dragging new nodes.
  const isActive = selectedNodeId === id;

  const color = TECH_COLOR[data.tech] || TECH_COLOR.Kubernetes;
  const seed = React.useMemo(() => hashSeed(id), [id]);
  const rotation = ((seed % 50) / 10 - 2.5).toFixed(2); // -2.5deg .. +2.5deg
  const radius = WOBBLE_RADIUS[seed % 2];

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExecuting) return;
    deleteNode(id);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedNodeId(id);
      }}
      className="relative select-none cursor-pointer group"
      style={{ width: 220, padding: 10 }}
    >
      {/* Real hit-box / handle anchors — stay axis-aligned regardless of the
          sketch card's rotation below, so edges always connect precisely. */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !rounded-full !border-2 !bg-background hover:!opacity-100 !transition-colors !cursor-crosshair !left-[-4px] !top-1/2 !transform !-translate-y-1/2 !border-solid !opacity-80"
        style={{ position: 'absolute', zIndex: 30, borderColor: color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !rounded-full !border-2 !bg-background hover:!opacity-100 !transition-colors !cursor-crosshair !right-[-4px] !top-1/2 !transform !-translate-y-1/2 !border-solid !opacity-80"
        style={{ position: 'absolute', zIndex: 30, borderColor: color }}
      />

      {!isReadOnly && incomingEdges.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            incomingEdges.forEach((edge) => deleteEdge(edge.id));
          }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-900 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 z-40 shadow-md cursor-pointer"
          title="Clear incoming connection"
          aria-label="Clear incoming connection"
        >
          <Icon icon="lucide:x" className="text-[10px] font-bold" />
        </button>
      )}
      {!isReadOnly && outgoingEdges.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            outgoingEdges.forEach((edge) => deleteEdge(edge.id));
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-900 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 z-40 shadow-md cursor-pointer"
          title="Clear outgoing connection"
          aria-label="Clear outgoing connection"
        >
          <Icon icon="lucide:x" className="text-[10px] font-bold" />
        </button>
      )}
      {!isExecuting && (
        <button
          onClick={handleDelete}
          className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-muted/90 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all z-40 border border-border"
          title="Delete Node"
        >
          <Icon icon="lucide:trash-2" className="text-xs" />
        </button>
      )}
      {(data.status === 'Validated' || data.status === 'Warning' || data.status === 'Editing') && (
        <span
          className="absolute -top-2 left-3 z-30 flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border shadow-sm"
          style={{
            background: 'var(--panel)',
            borderColor:
              data.status === 'Validated' ? 'var(--success, #10B981)' : data.status === 'Warning' ? 'var(--amber)' : 'var(--accent-ink)',
            color: data.status === 'Validated' ? 'var(--success, #10B981)' : data.status === 'Warning' ? 'var(--amber)' : 'var(--accent-ink)',
          }}
          title={data.status === 'Editing' ? `${data.editorName || 'Someone'} editing` : undefined}
        >
          <span className="h-1 w-1 rounded-full bg-current" />
          {data.status === 'Editing' ? data.editorName || 'Editing' : data.statusText || data.status}
        </span>
      )}

      {/* The sketch card — the whole "sticky note" (border, fill, and its
          text) rotates together as one tilted unit, matching the design;
          it's a plain absolutely-positioned visual layer with pointer
          events re-enabled just for itself so clicks still select the node. */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setSelectedNodeId(id);
        }}
        style={{
          transform: `rotate(${rotation}deg)`,
          borderRadius: radius,
          border: `${isActive ? 3 : 2.5}px solid ${color}`,
          background: `color-mix(in srgb, ${color} 8%, var(--panel))`,
          boxShadow: isActive ? `0 0 0 4px color-mix(in srgb, ${color} 16%, transparent)` : undefined,
          padding: '10px 12px 9px',
          fontFamily: 'var(--font-handwriting, cursive)',
          transition: 'box-shadow .15s ease, border-color .15s ease',
        }}
      >
        <div className="flex items-center justify-between gap-2" style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: '.02em', textTransform: 'uppercase', color }}>
          <span className="flex items-center gap-1.5 min-w-0">
            <Icon icon={data.icon} className="text-sm shrink-0" />
            <span className="truncate">{data.categoryLabel}</span>
          </span>
          {data.isCustom && (
            <span className="shrink-0 px-1 py-0.5 rounded border text-[8px]" style={{ borderColor: color, color }}>
              custom
            </span>
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginTop: 2 }} className="truncate">
          {data.label}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.35, color: 'var(--ink2)' }} className="line-clamp-2">
          {data.description}
        </p>
      </div>

      <ExecutionStatusBar status={execStatus} isDestroy={pipelineAction === 'destroy'} />
    </div>
  );
}
