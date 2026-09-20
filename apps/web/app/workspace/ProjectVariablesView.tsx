'use client';

import React, { useMemo, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { clsx } from 'clsx';
import { generateTerraformFiles } from '../lib/bundleGenerator';

interface CanvasNodeData {
  tech?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TerraformVariable {
  name: string;
  type?: string;
  default?: string;
  description?: string;
}

interface TemplateVariable {
  name: string;
  nodeIds: string[];
}

// Parses the `variable "x" { ... }` blocks bundleGenerator.ts already emits
// into variables.tf — this is a read-only view of that real output, not a
// second source of truth (editing still happens on the node whose
// parameter produced the block, via the existing Parameters panel).
function parseTerraformVariables(variablesTf: string): TerraformVariable[] {
  const vars: TerraformVariable[] = [];
  const blockRe = /variable\s+"([^"]+)"\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(variablesTf))) {
    const [, name, body] = match;
    const type = /type\s*=\s*(\S+)/.exec(body)?.[1];
    const def = /default\s*=\s*(.+)/.exec(body)?.[1]?.trim();
    const description = /description\s*=\s*"([^"]*)"/.exec(body)?.[1];
    vars.push({ name, type, default: def, description });
  }
  return vars;
}

// Ansible (and Source-role) node parameters use Jinja-style `{{ var_name }}`
// placeholders instead of a formal variable block (see "Convert to
// Variable" in the node inspector) — this walks every node's parameter
// values looking for that convention and groups the unique names by which
// node(s) reference them.
function scanTemplateVariables(nodes: Node[], tech: string): TemplateVariable[] {
  const found = new Map<string, Set<string>>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  nodes
    .filter((n) => (n.data as CanvasNodeData)?.tech === tech)
    .forEach((n) => {
      const params = (n.data as CanvasNodeData)?.parameters || {};
      Object.values(params).forEach((value) => {
        if (typeof value !== 'string') return;
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(value))) {
          const name = m[1];
          if (!found.has(name)) found.set(name, new Set());
          found.get(name)!.add(n.id);
        }
      });
    });
  return Array.from(found.entries()).map(([name, nodeIds]) => ({ name, nodeIds: Array.from(nodeIds) }));
}

function Section({
  label,
  color,
  count,
  emptyHint,
  children,
}: {
  label: string;
  color: string;
  count: number;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors cursor-pointer select-none"
      >
        <span className={clsx('text-[11px] font-bold uppercase tracking-wider flex items-center gap-2', color)}>
          {label}
          <span className="text-muted-foreground font-normal normal-case">({count})</span>
        </span>
        <Icon icon={open ? 'lucide:chevron-down' : 'lucide:chevron-right'} className="text-muted-foreground text-xs" />
      </button>
      {open && (
        <div className="divide-y divide-border/50">
          {count === 0 ? (
            <p className="px-3 py-4 text-[11px] text-muted-foreground">{emptyHint}</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectVariablesView({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const terraformVars = useMemo(() => {
    const hasTerraform = nodes.some((n) => (n.data as CanvasNodeData)?.tech === 'Terraform');
    if (!hasTerraform) return [];
    const { variablesTf } = generateTerraformFiles(nodes, edges);
    return parseTerraformVariables(variablesTf);
  }, [nodes, edges]);

  const ansibleVars = useMemo(() => scanTemplateVariables(nodes, 'Ansible'), [nodes]);
  const k8sVars = useMemo(() => scanTemplateVariables(nodes, 'Kubernetes'), [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground select-none">
        Add nodes to the canvas to see their variables.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-3">
      <p className="text-[10px] text-muted-foreground select-none">
        Read-only — variables come from each node&apos;s own parameters. Edit them on the node (Parameters panel, or the{' '}
        <span className="font-mono">{'{x}'}</span> &quot;Convert to Variable&quot; control) rather than here.
      </p>

      <Section label="Terraform" color="text-primary" count={terraformVars.length} emptyHint="No aws_/gcp_/azure_ target nodes on the canvas yet — Terraform variables appear once one is added.">
        {terraformVars.map((v) => (
          <div key={v.name} className="px-3 py-2.5 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:variable" className="text-primary text-xs shrink-0" />
              <span className="text-[11.5px] font-mono text-foreground">{v.name}</span>
              {v.type && <span className="text-[9.5px] font-mono text-muted-foreground border border-border rounded px-1">{v.type}</span>}
            </div>
            {v.description && <p className="text-[10.5px] text-muted-foreground pl-5">{v.description}</p>}
            {v.default && (
              <p className="text-[10.5px] text-muted-foreground pl-5">
                default <span className="font-mono text-foreground/80">{v.default}</span>
              </p>
            )}
          </div>
        ))}
      </Section>

      <Section label="Ansible" color="text-[#8B5CF6]" count={ansibleVars.length} emptyHint={'No {{ variable }} placeholders found in Ansible node parameters yet.'}>
        {ansibleVars.map((v) => (
          <div key={v.name} className="px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11.5px] font-mono text-foreground">
              <Icon icon="lucide:variable" className="text-[#8B5CF6] text-xs shrink-0" />
              {v.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {v.nodeIds.length} node{v.nodeIds.length === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </Section>

      <Section label="Kubernetes" color="text-[#0EA5E9]" count={k8sVars.length} emptyHint="No Kubernetes nodes use templated parameters yet.">
        {k8sVars.map((v) => (
          <div key={v.name} className="px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11.5px] font-mono text-foreground">
              <Icon icon="lucide:variable" className="text-[#0EA5E9] text-xs shrink-0" />
              {v.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {v.nodeIds.length} node{v.nodeIds.length === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </Section>
    </div>
  );
}
