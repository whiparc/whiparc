'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Node } from '@xyflow/react';

// Helper to format node ID to HCL variable name: e.g. aws_instance.web_server -> aws_instance_web_server
export function formatNodeNameForVar(id: string): string {
  return id.replace(/\./g, '_');
}

const NODE_OUTPUT_MAP: Record<string, string[]> = {
  'aws_instance.web_server': ['public_ip', 'private_ip', 'id', 'ssh_user'],
  'aws_security_group': ['sg_id', 'sg_name'],
  'aws_s3_bucket': ['bucket_name', 'bucket_arn'],
  'aws_db_instance': ['endpoint', 'port', 'db_name', 'username'],
  'aws_vpc': ['vpc_id', 'cidr_block'],
  'aws_subnet': ['subnet_id', 'availability_zone']
};

interface InputWithVariablePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  nodes: Node[];
  onValueChange: (value: string) => void;
}

export function InputWithVariablePicker({ nodes, onValueChange, className, value, ...props }: InputWithVariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as globalThis.Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract candidate nodes that have output variables
  const candidateNodes = nodes.filter(n => {
    const matchingKey = Object.keys(NODE_OUTPUT_MAP).find(k => n.id.startsWith(k));
    return !!matchingKey;
  });

  const handleSelectVariable = (nodeId: string, outputKey: string) => {
    const varName = formatNodeNameForVar(nodeId);
    const expr = `{{ nodes.${varName}.${outputKey} }}`;
    onValueChange(expr);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full flex items-center">
      <input
        {...props}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`${className} pr-8 w-full`}
      />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-2 text-muted-foreground hover:text-primary transition-all p-1 rounded hover:bg-muted/80 cursor-pointer flex items-center justify-center"
        title="Bind dynamic output variable"
      >
        <Icon icon="lucide:variable" className="text-xs" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 z-30 rounded-lg border border-border bg-popover text-popover-foreground p-2 shadow-xl max-h-60 overflow-y-auto scrollbar-thin">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 border-b border-border mb-1.5">
            Output Variables Picker
          </div>
          
          {candidateNodes.length === 0 ? (
            <div className="text-[11px] text-muted-foreground px-2 py-4 text-center">
              No upstream provisioning nodes found on canvas.
            </div>
          ) : (
            <div className="space-y-2">
              {candidateNodes.map(node => {
                const matchingKey = Object.keys(NODE_OUTPUT_MAP).find(k => node.id.startsWith(k)) || '';
                const outputs = NODE_OUTPUT_MAP[matchingKey] || [];
                return (
                  <div key={node.id} className="px-1">
                    <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 truncate">
                      <Icon icon="lucide:server" className="text-muted-foreground text-xs" />
                      {node.id}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {outputs.map(out => (
                        <button
                          key={out}
                          type="button"
                          onClick={() => handleSelectVariable(node.id, out)}
                          className="text-[10px] bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 rounded px-1.5 py-0.5 transition cursor-pointer"
                        >
                          {out}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
