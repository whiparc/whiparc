'use client';

// TODO: This component is a legacy version of the right configuration panel. The active inspector panel is implemented directly inside app/workspace/page.tsx. Future engineers should integrate or remove this legacy component.

import { useMemo, useState, ReactNode } from 'react';
import { Node } from '@xyflow/react';
import useCanvasStore from '../store/useCanvasStore';
import { generateAnsibleYAML } from '../lib/exportYaml';
import { Button, Badge } from '../lib/uiComponents';

// YAML Syntax Highlighting Function
function highlightYAML(code: string): ReactNode[] {
  const lines = code.split('\n');
  
  return lines.map((line, lineIdx) => {
    const parts: ReactNode[] = [];
    let remaining = line;
    let charIdx = 0;

    // Match patterns in order of priority
    while (remaining.length > 0) {
      // Comments
      if (remaining.startsWith('#')) {
        const commentMatch = remaining.match(/^#.*/);
        if (commentMatch) {
          parts.push(
            <span key={`${lineIdx}-${charIdx}`} className="text-emerald-500">
              {commentMatch[0]}
            </span>
          );
          charIdx += commentMatch[0].length;
          remaining = remaining.slice(commentMatch[0].length);
          continue;
        }
      }

      // Dashes at line start (list items)
      if (remaining.match(/^(\s*)- /)) {
        const dashMatch = remaining.match(/^(\s*)- /);
        if (dashMatch) {
          const indent = dashMatch[1];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`} className="text-slate-400">
              {indent}
              <span className="text-blue-400">-</span>
              {' '}
            </span>
          );
          charIdx += dashMatch[0].length;
          remaining = remaining.slice(dashMatch[0].length);
          continue;
        }
      }

      // YAML keys (word followed by colon)
      if (remaining.match(/^(\s*)[a-zA-Z_][a-zA-Z0-9_-]*\s*:/)) {
        const keyMatch = remaining.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/);
        if (keyMatch) {
          const indent = keyMatch[1];
          const key = keyMatch[2];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`}>
              <span className="text-slate-400">{indent}</span>
              <span className="text-blue-300">{key}</span>
              <span className="text-slate-400">:</span>
            </span>
          );
          charIdx += keyMatch[0].length;
          remaining = remaining.slice(keyMatch[0].length);
          continue;
        }
      }

      // String values (quoted)
      if (remaining.match(/^(\s*)(["'])(.*?)\2/)) {
        const stringMatch = remaining.match(/^(\s*)(["'])(.*?)\2/);
        if (stringMatch) {
          const indent = stringMatch[1];
          const quote = stringMatch[2];
          const value = stringMatch[3];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`}>
              <span className="text-slate-400">{indent}</span>
              <span className="text-orange-400">
                {quote}
                {value}
                {quote}
              </span>
            </span>
          );
          charIdx += stringMatch[0].length;
          remaining = remaining.slice(stringMatch[0].length);
          continue;
        }
      }

      // Boolean values (true, false, yes, no, on, off)
      if (remaining.match(/^(\s*)(true|false|yes|no|on|off)(?:\s|$|#)/i)) {
        const boolMatch = remaining.match(/^(\s*)(true|false|yes|no|on|off)/i);
        if (boolMatch) {
          const indent = boolMatch[1];
          const bool = boolMatch[2];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`}>
              <span className="text-slate-400">{indent}</span>
              <span className="text-purple-400">{bool}</span>
            </span>
          );
          charIdx += boolMatch[0].length;
          remaining = remaining.slice(boolMatch[0].length);
          continue;
        }
      }

      // Null values
      if (remaining.match(/^(\s*)(null|~)(?:\s|$|#)/i)) {
        const nullMatch = remaining.match(/^(\s*)(null|~)/i);
        if (nullMatch) {
          const indent = nullMatch[1];
          const nullVal = nullMatch[2];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`}>
              <span className="text-slate-400">{indent}</span>
              <span className="text-purple-400">{nullVal}</span>
            </span>
          );
          charIdx += nullMatch[0].length;
          remaining = remaining.slice(nullMatch[0].length);
          continue;
        }
      }

      // Numbers
      if (remaining.match(/^(\s*)(\d+(\.\d+)?)/)) {
        const numMatch = remaining.match(/^(\s*)(\d+(\.\d+)?)/);
        if (numMatch) {
          const indent = numMatch[1];
          const num = numMatch[2];
          parts.push(
            <span key={`${lineIdx}-${charIdx}`}>
              <span className="text-slate-400">{indent}</span>
              <span className="text-green-400">{num}</span>
            </span>
          );
          charIdx += numMatch[0].length;
          remaining = remaining.slice(numMatch[0].length);
          continue;
        }
      }

      // Special value indicators (| for literal, > for folded)
      if (remaining.match(/^(\s*)[|>][-+]?/)) {
        const specialMatch = remaining.match(/^(\s*)[|>][-+]?/);
        if (specialMatch) {
          parts.push(
            <span key={`${lineIdx}-${charIdx}`} className="text-cyan-400">
              {specialMatch[0]}
            </span>
          );
          charIdx += specialMatch[0].length;
          remaining = remaining.slice(specialMatch[0].length);
          continue;
        }
      }

      // Plain text (includes unquoted strings and other values)
      if (remaining.match(/^[^:\n#]+/)) {
        const textMatch = remaining.match(/^[^:\n#]+/);
        if (textMatch) {
          parts.push(
            <span key={`${lineIdx}-${charIdx}`} className="text-slate-300">
              {textMatch[0]}
            </span>
          );
          charIdx += textMatch[0].length;
          remaining = remaining.slice(textMatch[0].length);
          continue;
        }
      }

      // Fallback - single character
      if (remaining.length > 0) {
        parts.push(
          <span key={`${lineIdx}-${charIdx}`} className="text-slate-300">
            {remaining[0]}
          </span>
        );
        charIdx += 1;
        remaining = remaining.slice(1);
      }
    }

    return (
      <div key={lineIdx}>
        {parts}
      </div>
    );
  });
}

export default function RightPanel() {
  const { nodes, edges } = useCanvasStore();
  const [copySuccess, setCopySuccess] = useState(false);
  
  const yamlCode = useMemo(() => generateAnsibleYAML(nodes, edges), [nodes, edges]);
  const highlightedCode = useMemo(() => highlightYAML(yamlCode), [yamlCode]);

  // 🛡️ THE VALIDATION ENGINE
  const validateDeployment = (currentNodes: Node[]): string | null => {
    if (currentNodes.length === 0) {
      return "Your canvas is empty. Add some modules before downloading.";
    }

    for (const node of currentNodes) {
      if (!node.data || !node.data.label) continue;
      
      const label = node.data.label as string;

      if (label.includes('Open Port')) {
        if (node.data.port && !String(node.data.port).startsWith('{{')) {
          const portNum = parseInt(node.data.port as string, 10);
          if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            return `Invalid port number on "${label}" node. Ports must be between 1 and 65535.`;
          }
        }
      }
    }
    return null; 
  };

  const handleCopy = async () => {
    // 🛡️ Trigger validation before copying
    const error = validateDeployment(nodes);
    if (error) {
      alert(`⚠️Error Downloading:\n${error}`);
      return;
    }

    try {
      await navigator.clipboard.writeText(yamlCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownload = () => {
    // 🛡️ Trigger validation before downloading
    const error = validateDeployment(nodes);
    if (error) {
      alert(`⚠️Error Downloading:\n${error}`);
      return; 
    }

    const blob = new Blob([yamlCode], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'infrastructure-playbook.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const taskCount = nodes.length;

  return (
    <aside className="w-96 bg-gradient-to-b from-slate-900/80 to-slate-950/80 border-l border-border/50 flex flex-col shrink-0 backdrop-blur-sm">
      
      {/* Panel Header - Enhanced */}
      <div className="border-b border-border/50 bg-card/50">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">&lt;&gt;</span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Generated YAML</h2>
                <p className="text-xs text-slate-400">Ansible Playbook</p>
              </div>
            </div>
            {taskCount > 0 && (
              <Badge variant="success" size="sm">
                {taskCount} task{taskCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="text-xs flex-1 min-w-[100px]"
            onClick={handleCopy}
          >
            {copySuccess ? (
              <>
                <span>✓</span> Copied!
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs flex-1 min-w-[100px]"
            onClick={handleDownload}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs flex-1 min-w-[100px]"
            disabled
            title="Security audit coming soon"
          >
            🛡️ Audit
          </Button>
        </div>
      </div>

      {/* Code Display Area - Enhanced with line numbers and syntax highlighting */}
      <div className="flex-grow overflow-hidden flex flex-col">
        {nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 py-8">
            <div className="text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-400 text-sm font-medium">No tasks yet</p>
              <p className="text-slate-500 text-xs mt-1">
                Drag modules from the sidebar to generate a playbook
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-0">
            <div className="bg-background/50 border border-border/30 rounded-lg font-mono text-sm overflow-x-auto h-full flex">
              <div className="flex w-full">
                {/* Line Numbers */}
                <div className="bg-card/50 border-r border-border/30 px-3 py-4 text-slate-600 text-right select-none flex-shrink-0">
                  {yamlCode.split('\n').map((_, i) => (
                    <div key={i} className="h-6 leading-6 text-xs">
                      {i + 1}
                    </div>
                  ))}
                </div>
                {/* Highlighted Code */}
                <pre className="flex-1 whitespace-pre-wrap break-words leading-6 p-4 overflow-x-auto">
                  <code>{highlightedCode}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-border/50 bg-card/50 text-xs text-slate-500 text-center">
        Ready to deploy? Download and use with Ansible
      </div>
    </aside>
  );
}
