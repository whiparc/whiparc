'use client';

// TODO: This component is a legacy version of the sidebar. The active node library panel is implemented directly inside app/workspace/page.tsx. Future engineers should integrate or remove this legacy component.

import React from 'react';
import { useCallback } from 'react';
// import { Button } from '../lib/uiComponents';

interface ModuleItem {
  id: string;
  label: string;
  type: string;
  category: string;
  description: string;
  icon: string;
}

const modules: ModuleItem[] = [
  {
    id: 'update-packages',
    label: 'Update Packages',
    type: 'serverNode',
    category: 'System',
    description: 'Update apt cache and upgrade packages',
    icon: '📦',
  },
  {
    id: 'nginx',
    label: 'Install Nginx',
    type: 'serverNode',
    category: 'Web',
    description: 'Install Nginx web server',
    icon: '🔗',
  },
  {
    id: 'nodejs',
    label: 'Install Node.js',
    type: 'serverNode',
    category: 'Web',
    description: 'Install Node.js runtime',
    icon: '⬡',
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    type: 'serverNode',
    category: 'Database',
    description: 'Install PostgreSQL database',
    icon: '🗂️',
  },
  {
    id: 'open-port',
    label: 'Open Port',
    type: 'serverNode',
    category: 'Network',
    description: 'Open port in UFW firewall',
    icon: '🚪',
  },
  {
    id: 'copy-env',
    label: 'Copy .env File',
    type: 'serverNode',
    category: 'File',
    description: 'Copy environment configuration file',
    icon: '📋',
  },
];

// Group modules by category
const groupedModules = modules.reduce(
  (acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  },
  {} as Record<string, ModuleItem[]>
);

const categoryOrder = [
  'System',
  'Web',
  'Database',
  'Network',
  'File',
];

export default function Sidebar() {
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(
    'System'
  );

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-border/50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <h1 className="text-lg font-bold text-white mb-1">Whiparc</h1>
        <p className="text-xs text-slate-400">Drag modules to build infrastructure</p>
      </div>

      {/* Module Categories */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {categoryOrder.map((category) => {
            if (!groupedModules[category]) return null;
            const isExpanded = expandedCategory === category;

            return (
              <div key={category} className="space-y-2">
                {/* Category Header */}
                <button
                  onClick={() =>
                    setExpandedCategory(isExpanded ? null : category)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-secondary/50 hover:text-white transition-all duration-200 group"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full bg-primary transition-all duration-200 ${isExpanded ? 'bg-emerald-400' : ''}`}
                    />
                    {category}
                  </span>
                  <span
                    className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </button>

                {/* Category Items */}
                {isExpanded && (
                  <div className="ml-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {groupedModules[category].map((module) => (
                      <div
                        key={module.id}
                        draggable
                        onDragStart={(event) =>
                          onDragStart(event, module.type, module.label)
                        }
                        className="px-3 py-2.5 bg-secondary/40 border border-border/50 rounded-md cursor-grab hover:cursor-grabbing hover:bg-input/60 hover:border-input transition-all duration-200 group/item"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg flex-shrink-0 group-hover/item:scale-110 transition-transform duration-200">
                            {module.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-100 truncate">
                              {module.label}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-1">
                              {module.description}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-border/50 bg-card/50 backdrop-blur-sm">
        <p className="text-xs text-slate-500 text-center">
          💡 Drag modules onto the canvas to start
        </p>
      </div>
    </aside>
  );
}