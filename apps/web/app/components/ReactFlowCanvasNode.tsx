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
    <div className={clsx('flex items-center gap-1.5 px-3 py-1 border-t rounded-b-xl', bar)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', dot, pulse && 'animate-pulse')} />
      <span className={clsx('text-[9px] font-semibold uppercase tracking-wider', textColor)}>{label}</span>
    </div>
  );
}

export default function ReactFlowCanvasNode({ id, data, selected }: ReactFlowCanvasNodeProps) {
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

  const techColorClass = {
    Terraform: 'bg-primary',
    Ansible: 'bg-[#8B5CF6]',
    Kubernetes: 'bg-[#0EA5E9]',
    Source: 'bg-[#F59E0B]',
    Target: 'bg-[#14B8A6]',
  }[data.tech] || 'bg-[#8B5CF6]';

  const borderClass = isActive
    ? 'border-2 border-primary shadow-2xl shadow-primary/10'
    : 'border border-border hover:border-primary/50 shadow-xl';

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
      className={clsx(
        "w-60 bg-card/90 backdrop-blur-md rounded-xl transition-all duration-200 cursor-pointer select-none relative group",
        borderClass
      )}
    >
      {/* Top tech indicator bar */}
      <div className={clsx("h-1 w-full rounded-t-xl", techColorClass)}></div>

      {isActive && (
        <div className="absolute -top-3.5 left-4 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow z-20">
          Active Node
        </div>
      )}

      {/* Hover Delete Button */}
      {!isExecuting && (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 p-1 rounded-md bg-muted/80 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all z-20 border border-border"
          title="Delete Node"
        >
          <Icon icon="lucide:trash-2" className="text-xs" />
        </button>
      )}

      <div className="p-4 relative">
        {/* Left Input Port */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !rounded-full !border-2 !border-primary !bg-background hover:!bg-primary !transition-colors !cursor-crosshair !left-[-6px] !top-1/2 !transform !-translate-y-1/2 !border-solid !opacity-100"
          style={{ position: 'absolute', zIndex: 30 }}
        />
        {!isReadOnly && incomingEdges.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              incomingEdges.forEach((edge) => deleteEdge(edge.id));
            }}
            className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-900 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 z-40 shadow-md cursor-pointer"
            title="Clear incoming connection"
            aria-label="Clear incoming connection"
          >
            <Icon icon="lucide:x" className="text-[10px] font-bold" />
          </button>
        )}

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 pr-6">
            <Icon icon={data.icon} className={clsx("text-base", data.tech === 'Terraform' ? 'text-primary' : data.tech === 'Ansible' ? 'text-[#8B5CF6]' : data.tech === 'Source' ? 'text-[#F59E0B]' : data.tech === 'Target' ? 'text-[#14B8A6]' : 'text-[#0EA5E9]')} />
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate max-w-[90px]">{data.categoryLabel}</span>
            {data.isCustom && (
              <span className="px-1 py-0.5 bg-purple-500/15 text-purple-400 text-[8px] font-bold uppercase rounded border border-purple-500/25 shrink-0">Custom</span>
            )}
          </div>

          <div className="flex-shrink-0">
            {data.status === 'Validated' && (
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                <span className="h-1 w-1 rounded-full bg-emerald-400"></span> {data.statusText || 'Validated'}
              </span>
            )}

            {data.status === 'Warning' && (
              <span className="flex items-center gap-1 text-[9px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span> {data.statusText || 'Warning'}
              </span>
            )}

            {data.status === 'Editing' && (
              <span className="flex items-center gap-1 text-[9px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20" title={`${data.editorName || 'Sarah'} Editing`}>
                <span className="h-1 w-1 rounded-full bg-primary animate-pulse"></span> {data.editorName || 'Sarah'}
              </span>
            )}
          </div>
        </div>

        <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center justify-between gap-1.5 pr-2">
          <span className="truncate">{data.label}</span>
          {data.isCustom && (
            <span className="text-[8px] font-bold text-purple-400 uppercase tracking-wider shrink-0 bg-purple-500/10 border border-purple-500/20 px-1 py-0.5 rounded select-none">Custom Node</span>
          )}
        </h4>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 h-[34px]">{data.description}</p>

        {/* Right Output Port */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !rounded-full !border-2 !border-primary !bg-background hover:!bg-primary !transition-colors !cursor-crosshair !right-[-6px] !top-1/2 !transform !-translate-y-1/2 !border-solid !opacity-100"
          style={{ position: 'absolute', zIndex: 30 }}
        />
        {!isReadOnly && outgoingEdges.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              outgoingEdges.forEach((edge) => deleteEdge(edge.id));
            }}
            className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-900 border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 z-40 shadow-md cursor-pointer"
            title="Clear outgoing connection"
            aria-label="Clear outgoing connection"
          >
            <Icon icon="lucide:x" className="text-[10px] font-bold" />
          </button>
        )}
      </div>

      <ExecutionStatusBar status={execStatus} isDestroy={pipelineAction === 'destroy'} />
    </div>
  );
}
