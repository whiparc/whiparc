'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../store/useAuthStore';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  ReactFlowProvider, 
  useReactFlow,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Icon } from '@iconify/react';
import { clsx } from 'clsx';

import useCanvasStore, { getInitialNodes, getInitialEdges } from '../store/useCanvasStore';
import ReactFlowCanvasNode from '../components/ReactFlowCanvasNode';
import ProfileMenu from '../components/ProfileMenu';
import Tooltip from '../components/Tooltip';
import CustomNodeModal from '../components/CustomNodeModal';
import { ProjectSettingsModal } from '../components/ProjectSettingsModal';
import { InputWithVariablePicker } from '../components/VariablePicker';
import { generateAnsibleYAML } from '../lib/exportYaml';
import { downloadZipBundle, downloadTerraformZip, generateBundleFiles, generateTerraformFiles } from '../lib/bundleGenerator';
import { DEFAULT_INSTANCE_PARAMS, DEFAULT_SG_PARAMS } from '../lib/terraformDefaults';
import type { Project } from '../lib/types';

// Define layout components inside the workspace directory for encapsulation

// --- TYPES & INTERFACES ---

interface Tag {
  key: string;
  value: string;
}

interface NodeParameters {
  instanceName: string;
  amiId: string;
  instanceType: string;
  subnetId: string;
  rootVolumeSize: number;
  tags: Tag[];
}

interface LibraryNode {
  id: string;
  tech: 'Terraform' | 'Ansible' | 'Kubernetes' | 'Source' | 'Target';
  icon: string;
  title: string;
  description: string;
  category: string;
  isCustom?: boolean;
  rawCode?: string;
  codeType?: 'tf' | 'yml' | 'yaml';
  parameters?: Record<string, unknown>;
  outputs?: string[];
}

// Cloud/SSH credential summary as returned by GET /api/projects/:id/credentials
// (mirrors CredentialItem in components/CredentialManagerModal.tsx).
interface Credential {
  id: string;
  project_id: string;
  provider: string;
  name: string;
  key_fingerprint: string;
  created_at: string;
}

// --- HELPER SUB-COMPONENTS ---

// Header Component
interface HeaderProps {
  selectedProject: string;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onExport: () => void;
  onExportFormat: (format: string) => void;
  onDeploy: () => void;
  deployStatus: string;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  autoDestroy: boolean;
  onAutoDestroyChange: (val: boolean) => void;
  onDestroy: () => void;
  collaborators?: { id: string; name: string; color: string }[];
  isSyncConnected?: boolean;
  saveStatus?: 'saved' | 'saving' | 'error' | 'readonly';
  onOpenSettings?: () => void;
  projectDetails?: Project | null;
  agentStatus?: string | null;
  migrationStatus?: { gated: boolean; has_active_agent: boolean; grace_period_end: string } | null;
}

const Header: React.FC<HeaderProps> = ({
  selectedProject,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExport,
  onExportFormat,
  onDeploy,
  deployStatus,
  isTerminalOpen,
  onToggleTerminal,
  autoDestroy,
  onAutoDestroyChange,
  onDestroy,
  collaborators = [],
  isSyncConnected = false,
  saveStatus = 'saved',
  onOpenSettings,
  projectDetails,
  agentStatus = null,
  migrationStatus = null,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-16 border-b border-border bg-card/85 backdrop-blur-md px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Left: Workspace breadcrumbs & OS Toggle */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-amber-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 15h5M14 19h5" />
            </svg>
          </div>
          <span className="font-heading font-bold text-lg tracking-tight text-white">
            Whiparc
          </span>
        </div>

        <div className="h-4 w-[1px] bg-border"></div>

        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 font-semibold">
            <Icon icon="lucide:arrow-left" className="text-xs" /> Dashboard
          </Link>
          <Icon icon="lucide:chevron-right" className="text-muted-foreground text-xs" />
          <span className="text-foreground font-medium font-heading">{projectDetails?.name || selectedProject}</span>
          {onOpenSettings && (
            <Tooltip label="Project Settings">
              <button
                onClick={onOpenSettings}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center"
              >
                <Icon icon="lucide:settings" className="text-sm" />
              </button>
            </Tooltip>
          )}
          {saveStatus === 'saved' && (
            <span className="ml-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-emerald-500/20 flex items-center gap-1" title="Canvas state auto-saved in database.">
              <Icon icon="lucide:check-circle" className="text-[10px]" /> Saved
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary text-[10px] uppercase tracking-wider font-semibold rounded border border-primary/20 flex items-center gap-1" title="Saving canvas changes...">
              <Icon icon="lucide:loader-2" className="animate-spin text-[10px]" /> Saving...
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="ml-2 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-rose-500/20 flex items-center gap-1" title="Failed to save canvas state. A version conflict might have occurred.">
              <Icon icon="lucide:alert-circle" className="text-[10px]" /> Save Conflict
            </span>
          )}
          {saveStatus === 'readonly' && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-amber-500/20 flex items-center gap-1" title="Read-Only Mode. Node movements and parameters cannot be saved.">
              <Icon icon="lucide:eye" className="text-[10px]" /> Read-Only
            </span>
          )}
          {agentStatus === 'ACTIVE' && (
            <span className="ml-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-emerald-500/20 flex items-center gap-1" title="Local Sandbox Agent is connected — deploys will route through it.">
              <Icon icon="lucide:server" className="text-[10px]" /> Agent Connected
            </span>
          )}
          {agentStatus === 'PENDING' && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-amber-500/20 flex items-center gap-1" title="Local Sandbox Agent pairing has not been approved yet.">
              <Icon icon="lucide:loader-2" className="animate-spin text-[10px]" /> Agent Pairing…
            </span>
          )}
          {agentStatus === 'DISCONNECTED' && (
            <span className="ml-2 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-rose-500/20 flex items-center gap-1" title="Local Sandbox Agent is disconnected. Deploys targeting it will be rejected until it reconnects — run `infracanvas sandbox status` to check, or `infracanvas sandbox up` to re-pair.">
              <Icon icon="lucide:server-off" className="text-[10px]" /> Agent Disconnected
            </span>
          )}
          {migrationStatus && !migrationStatus.has_active_agent && migrationStatus.gated && (
            <span className="ml-2 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-rose-500/20 flex items-center gap-1" title="Free-tier sandbox deploys now require a local Sandbox Agent. Run `infracanvas sandbox up` to pair one, or upgrade to Pro for a hosted sandbox.">
              <Icon icon="lucide:server-off" className="text-[10px]" /> Sandbox Requires Agent
            </span>
          )}
          {migrationStatus && !migrationStatus.has_active_agent && !migrationStatus.gated && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] uppercase tracking-wider font-semibold rounded border border-amber-500/20 flex items-center gap-1" title={`Free-tier sandbox deploys will require a local Sandbox Agent starting ${migrationStatus.grace_period_end}. Run \`infracanvas sandbox up\` to pair one now, or upgrade to Pro for a hosted sandbox.`}>
              <Icon icon="lucide:clock" className="text-[10px]" /> Sandbox Migration: Pair by {migrationStatus.grace_period_end}
            </span>
          )}
        </div>

      </div>

      {/* Center: Collaboration Stack & Live Sync */}
      <div className="hidden lg:flex items-center gap-4 ml-6">
        <div className="flex items-center -space-x-1.5">
          {collaborators.map((c, idx) => (
            <div 
              key={`${c.id}-${idx}`} 
              className="h-8 w-8 rounded-full border-2 overflow-hidden relative flex items-center justify-center text-[10px] font-bold text-white uppercase select-none cursor-pointer"
              style={{ backgroundColor: c.color, borderColor: '#07080B' }}
              title={`${c.name} (Collaborator)`}
            >
              {c.name.slice(0, 2)}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 border border-border/80"></span>
            </div>
          ))}
          {collaborators.length === 0 && (
            <span className="text-xs text-muted-foreground italic select-none whitespace-nowrap">Solo Workspace</span>
          )}
        </div>
        <Tooltip label={isSyncConnected ? "Live Synchronized" : "Sync Offline"}>
          <div className={clsx(
            "flex items-center gap-2 px-3 py-1 border rounded-full text-xs font-medium transition-all duration-305 shrink-0",
            isSyncConnected
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          )}>
            <Icon icon="lucide:refresh-cw" className={clsx("text-xs shrink-0", isSyncConnected && "animate-spin")} />
            <span className="whitespace-nowrap">{isSyncConnected ? "Synced" : "Offline"}</span>
          </div>
        </Tooltip>
      </div>

      {/* Right: Zoom Controls & Export Split-Button */}
      <div className="flex items-center gap-2 xl:gap-3">
        {/* Zoom controls */}
        <div className="hidden lg:flex items-center gap-1 bg-muted p-1 rounded-lg border border-border shrink-0">
          <Tooltip label="Zoom Out">
            <button onClick={onZoomOut} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
              <Icon icon="lucide:minus" className="text-sm" />
            </button>
          </Tooltip>
          <span onClick={onZoomReset} className="px-2 text-xs font-mono font-semibold text-foreground select-none cursor-pointer hover:text-primary transition-colors">
            {zoomLevel}%
          </span>
          <Tooltip label="Zoom In">
            <button onClick={onZoomIn} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
              <Icon icon="lucide:plus" className="text-sm" />
            </button>
          </Tooltip>
          <div className="w-[1px] h-4 bg-border mx-1"></div>
          <Tooltip label="Reset Zoom">
            <button onClick={onZoomReset} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
              <Icon icon="lucide:maximize" className="text-sm" />
            </button>
          </Tooltip>
        </div>

        {/* Export Split Button */}
        <div className="flex items-stretch relative shrink-0">
          <Tooltip label="Export Code">
            <button
              onClick={onExport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-3 xl:px-4 py-2 rounded-l-lg flex items-center gap-2 transition-all shadow-lg shadow-primary/20 shrink-0"
            >
              <Icon icon="lucide:download" className="text-base shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">Export Code</span>
            </button>
          </Tooltip>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground border-l border-border/20 p-2 rounded-r-lg flex items-center justify-center transition-all shadow-lg shadow-primary/20 h-full"
            >
              <Icon icon="lucide:chevron-down" className="text-base" />
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl transition-all duration-150 z-50 p-1">
                  <button
                    onClick={() => { onExportFormat('tf'); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded hover:bg-muted flex items-center gap-2 transition-colors"
                  >
                    <Icon icon="lucide:file" className="text-primary text-sm" />
                    <span>Terraform HCL (.tf)</span>
                  </button>
                  <button
                    onClick={() => { onExportFormat('yml'); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded hover:bg-muted flex items-center gap-2 transition-colors"
                  >
                    <Icon icon="lucide:clipboard" className="text-[#8B5CF6] text-sm" />
                    <span>Ansible YAML (.yml)</span>
                  </button>
                  <button
                    onClick={() => { onExportFormat('json'); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded hover:bg-muted flex items-center gap-2 transition-colors"
                  >
                    <Icon icon="lucide:layers" className="text-[#0EA5E9] text-sm" />
                    <span>Kubernetes JSON (.json)</span>
                  </button>
                  <div className="h-[1px] bg-border my-1"></div>
                  <button
                    onClick={() => { onExportFormat('zip'); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded hover:bg-muted font-medium text-emerald-400 flex items-center gap-2 transition-colors"
                  >
                    <Icon icon="lucide:folder" className="text-emerald-400 text-sm" />
                    <span>Download Bundle (.zip)</span>
                  </button>
                </div>
              </>
            )}
        </div>
      </div>

      {/* Ephemeral Mode Toggle */}
        <Tooltip label="Auto-Cleanup: destroy infrastructure automatically after deploy">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 select-none shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Icon icon="lucide:clock" className="text-amber-400 text-xs" />
              <span className="hidden xl:inline">Auto-Cleanup</span>
            </span>
            <button
              onClick={() => onAutoDestroyChange(!autoDestroy)}
              className={clsx(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                autoDestroy ? "bg-amber-500" : "bg-muted"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  autoDestroy ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </Tooltip>

        {/* Deploy Button */}
        <Tooltip label="Deploy">
          <button
            onClick={onDeploy}
            disabled={deployStatus === 'RUNNING' || deployStatus === 'PENDING' || deployStatus === 'CLEANUP'}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white p-2.5 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-emerald-950/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {deployStatus === 'RUNNING' || deployStatus === 'PENDING' || deployStatus === 'CLEANUP' ? (
              <Icon icon="lucide:loader-2" className="text-base animate-spin" />
            ) : (
              <Icon icon="lucide:play" className="text-base" />
            )}
          </button>
        </Tooltip>

        {/* Destroy Button */}
        <Tooltip label={autoDestroy ? "Destroy is disabled when Auto-Cleanup is enabled" : "Tear Down All Canvas Provisioned Resources"}>
          <button
            onClick={onDestroy}
            disabled={deployStatus === 'RUNNING' || deployStatus === 'PENDING' || deployStatus === 'CLEANUP' || autoDestroy}
            className="bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 text-white p-2.5 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-rose-950/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            <Icon icon="lucide:trash-2" className="text-base" />
          </button>
        </Tooltip>

        {/* Toggle Terminal Button */}
        <Tooltip label="Toggle Terminal Console">
          <button
            onClick={onToggleTerminal}
            className={clsx(
              "p-2 rounded-lg border border-border flex items-center justify-center transition-all cursor-pointer h-[38px] w-[38px] shrink-0",
              isTerminalOpen ? "bg-primary/20 text-primary border-primary" : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon icon="lucide:terminal" className="text-base" />
          </button>
        </Tooltip>

        <div className="w-[1px] h-6 bg-border shrink-0"></div>

        <div className="shrink-0"><ProfileMenu variant="compact" /></div>
      </div>
    </header>
  );
};



// NodeCard Component (Library Panel Item)
interface NodeCardProps {
  node: LibraryNode;
  onAddNode: (node: LibraryNode) => void;
  isReadOnly?: boolean;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, onAddNode, isReadOnly = false }) => {
  const techColorClass = {
    Terraform: 'bg-primary/10 text-primary border-primary/20',
    Ansible: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
    Kubernetes: 'bg-[#0EA5E9]/10 text-[#0EA5E9] border-[#0EA5E9]/20',
    Source: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    Target: 'bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/20',
  }[node.tech];

  const hoverBorderClass = {
    Terraform: 'hover:border-primary/50 hover:shadow-primary/5',
    Ansible: 'hover:border-[#8B5CF6]/50 hover:shadow-[#8B5CF6]/5',
    Kubernetes: 'hover:border-[#0EA5E9]/50 hover:shadow-[#0EA5E9]/5',
    Source: 'hover:border-[#F59E0B]/50 hover:shadow-[#F59E0B]/5',
    Target: 'hover:border-[#14B8A6]/50 hover:shadow-[#14B8A6]/5',
  }[node.tech];

  const onDragStart = (event: React.DragEvent) => {
    if (isReadOnly) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/reactflow-node-id', node.id);
    event.dataTransfer.setData('application/reactflow-node-tech', node.tech);
    event.dataTransfer.setData('application/reactflow-node-icon', node.icon);
    event.dataTransfer.setData('application/reactflow-node-title', node.title);
    event.dataTransfer.setData('application/reactflow-node-description', node.description);
    event.dataTransfer.setData('application/reactflow-node-category', node.category);
    if (node.isCustom) {
      event.dataTransfer.setData('application/reactflow-node-iscustom', 'true');
      event.dataTransfer.setData('application/reactflow-node-rawcode', node.rawCode || '');
      event.dataTransfer.setData('application/reactflow-node-codetype', node.codeType || '');
      event.dataTransfer.setData('application/reactflow-node-parameters', JSON.stringify(node.parameters || {}));
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      onClick={() => !isReadOnly && onAddNode(node)}
      draggable={!isReadOnly}
      onDragStart={onDragStart}
      className={clsx(
        "group border border-border rounded-xl p-3 transition-all transform select-none",
        isReadOnly
          ? "bg-muted/30 opacity-40 cursor-not-allowed border-border"
          : "bg-muted/60 hover:bg-muted cursor-grab hover:cursor-grabbing hover:shadow-lg hover:-translate-y-0.5",
        !isReadOnly && hoverBorderClass
      )}
    >
      <div className="flex items-start justify-between mb-1.5">
        <span className={clsx("px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wide", techColorClass)}>
          {node.tech}
        </span>
        {!isReadOnly && <Icon icon="lucide:plus" className="text-muted-foreground group-hover:text-foreground text-sm transition-colors" />}
      </div>
      <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
        <Icon icon={node.icon} className={clsx("text-sm", node.tech === 'Terraform' ? 'text-primary' : node.tech === 'Ansible' ? 'text-[#8B5CF6]' : node.tech === 'Source' ? 'text-[#F59E0B]' : node.tech === 'Target' ? 'text-[#14B8A6]' : 'text-[#0EA5E9]')} />
        {node.title}
      </h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
    </div>
  );
};

// LibraryPanel Component
interface LibraryPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  techFilter: string;
  onTechFilterSelect: (tech: string) => void;
  libraryNodes: LibraryNode[];
  onAddNode: (node: LibraryNode) => void;
  isReadOnly?: boolean;
  selectedOS: string;
  onOSChange: (os: string) => void;
  onCreateCustomNode?: () => void;
}

const LibraryPanel: React.FC<LibraryPanelProps> = ({
  collapsed,
  onToggle,
  searchQuery,
  onSearchChange,
  techFilter,
  onTechFilterSelect,
  libraryNodes,
  onAddNode,
  isReadOnly = false,
  selectedOS,
  onOSChange,
  onCreateCustomNode,
}) => {
  const customLibraryNodes = useCanvasStore((state) => state.customLibraryNodes);
  const mappedCustomNodes: LibraryNode[] = (customLibraryNodes || []).map((cn) => {
    let parsedMeta: { parameters?: Record<string, unknown> } = {};
    try {
      parsedMeta = JSON.parse(cn.parsed_meta_json || '{}');
    } catch (e) {}
    return {
      id: cn.id,
      tech: cn.tech,
      icon: cn.tech === 'Terraform' ? 'devicon:terraform' : cn.tech === 'Ansible' ? 'devicon:ansible' : 'devicon:kubernetes',
      title: cn.title,
      description: cn.description,
      category: cn.category,
      isCustom: true,
      rawCode: cn.raw_code,
      codeType: cn.code_type,
      parameters: parsedMeta.parameters || {}
    };
  });

  const allNodes = [...libraryNodes, ...mappedCustomNodes];
  const filteredNodes = allNodes.filter((node) => {
    const matchesSearch = node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTech = techFilter === 'All' || node.tech === techFilter;
    return matchesSearch && matchesTech;
  });

  const categories = Array.from(new Set(filteredNodes.map((n) => n.category)));

  return (
    <aside className={clsx(
      "bg-card/95 backdrop-blur-md flex flex-col shrink-0 z-20 transition-all duration-300 relative select-none overflow-visible",
      collapsed ? "w-0 border-r-0" : "w-80 border-r border-border"
    )}>
      {/* Sliding Window Container */}
      <div className="w-full h-full overflow-hidden">
        {/* Fixed Width Content Panel */}
        <div className="w-80 h-full flex flex-col">
          {/* Search & Quick Filters */}
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <div className="relative">
              <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search automation nodes..."
                className="w-full bg-muted border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>

            {/* Technology Quick Filters */}
            <div className="flex flex-wrap gap-1">
              {['All', 'Target', 'Terraform', 'Ansible', 'Kubernetes'].map((tech) => (
                <button
                  key={tech}
                  onClick={() => onTechFilterSelect(tech)}
                  className={clsx(
                    "flex-1 min-w-[48px] py-1.5 px-1 border border-border rounded-md text-[10px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer",
                    techFilter === tech
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {tech === 'All' ? 'All' : tech === 'Terraform' ? 'TF' : tech === 'Ansible' ? 'Ans' : tech === 'Kubernetes' ? 'K8s' : 'Cloud'}
                </button>
              ))}
            </div>

            {/* TODO: OS Environment Selector is currently visual-only. Toggling this state does not alter the generated Ansible playbooks or Terraform templates. Future engineers should integrate this parameters/OS state into the code generator. */}
            {/* OS Environment Selector */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 select-none">Environment</p>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
                {['Linux', 'macOS', 'Windows'].map((os) => (
                  <button
                    key={os}
                    onClick={() => onOSChange(os)}
                    className={clsx(
                      "flex-1 px-2 py-1 text-xs rounded-md font-medium flex items-center justify-center gap-1 transition-all",
                      selectedOS === os
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={os}
                  >
                    <Icon icon={os === 'macOS' ? "lucide:smartphone" : "lucide:monitor"} className="text-xs" />
                    <span className="hidden 2xl:inline">{os}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Draggable/Clickable Nodes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {!isReadOnly && onCreateCustomNode && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={onCreateCustomNode}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-purple-600/10 to-indigo-600/10 border border-purple-500/30 hover:border-purple-500 rounded-lg text-xs font-bold text-purple-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-950/5 group"
                >
                  <Icon icon="lucide:sparkles" className="text-purple-400 group-hover:animate-pulse text-sm shrink-0" />
                  <span>Create Custom Node</span>
                  <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[8px] font-bold uppercase rounded-full tracking-wider shrink-0">Pro</span>
                </button>
              </div>
            )}
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Icon icon="lucide:layers" className="text-xs" />
                  {category}
                </h3>
                <div className="space-y-2.5">
                  {filteredNodes
                    .filter((n) => n.category === category)
                    .map((node) => (
                      <NodeCard key={node.id} node={node} onAddNode={onAddNode} isReadOnly={isReadOnly} />
                    ))}
                </div>
              </div>
            ))}
            {filteredNodes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                No matching automation blocks found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapse Trigger Button */}
      <button
        onClick={onToggle}
        className="absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md hover:shadow-primary/10 transition-all z-30 cursor-pointer"
        title="Toggle Library Panel"
      >
        <Icon icon={collapsed ? "lucide:arrow-right" : "lucide:arrow-left"} className="text-xs" />
      </button>
    </aside>
  );
};

// CanvasControls Component
interface CanvasControlsProps {
  activeTool: string;
  onToolSelect: (tool: string) => void;
  onReset: () => void;
  isReadOnly?: boolean;
}

const CanvasControls: React.FC<CanvasControlsProps> = ({ activeTool, onToolSelect, onReset, isReadOnly = false }) => {
  return (
    <div className={clsx(
      "absolute bottom-6 left-6 z-20 flex items-center gap-2 bg-card/90 backdrop-blur border border-border p-2 rounded-xl shadow-2xl select-none transition-all duration-200",
      isReadOnly && "opacity-40 pointer-events-none cursor-not-allowed"
    )}>
      <button
        onClick={() => onToolSelect('select')}
        disabled={isReadOnly}
        className={clsx(
          "p-2 rounded-lg transition-all cursor-pointer",
          activeTool === 'select' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        title="Select Tool"
      >
        <Icon icon="lucide:mouse-pointer" className="text-base" />
      </button>
      <button
        onClick={() => onToolSelect('pan')}
        disabled={isReadOnly}
        className={clsx(
          "p-2 rounded-lg transition-all cursor-pointer",
          activeTool === 'pan' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        title="Pan Tool"
      >
        <Icon icon="lucide:move" className="text-base" />
      </button>
      <button
        onClick={() => onToolSelect('link')}
        disabled={isReadOnly}
        className={clsx(
          "p-2 rounded-lg transition-all cursor-pointer",
          activeTool === 'link' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        title="Add Connection"
      >
        <Icon icon="lucide:link" className="text-base" />
      </button>
      <div className="w-[1px] h-6 bg-border"></div>
      <button
        onClick={onReset}
        disabled={isReadOnly}
        className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all cursor-pointer"
        title="Reset View"
      >
        <Icon icon="lucide:refresh-cw" className="text-base" />
      </button>
    </div>
  );
};

// YAML Syntax Highlighting Function
function highlightYAMLCode(code: string): React.ReactNode[] {
  const lines = code.split('\n');
  
  return lines.map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let charIdx = 0;

    while (remaining.length > 0) {
      // Comments
      if (remaining.startsWith('#') || remaining.startsWith('---')) {
        parts.push(
          <span key={`${lineIdx}-${charIdx}`} className="text-emerald-500">
            {remaining}
          </span>
        );
        break;
      }

      // Dashes at line start
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

      // YAML keys
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

      // String values (quoted or variables in curly braces)
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

      // Booleans
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

      // Plain text
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

      // Fallback
      parts.push(
        <span key={`${lineIdx}-${charIdx}`} className="text-slate-300">
          {remaining[0]}
        </span>
      );
      charIdx += 1;
      remaining = remaining.slice(1);
    }

    return (
      <div key={lineIdx} className="min-h-[1.25rem]">
        {parts}
      </div>
    );
  });
}

// --- LIVE CODE PREVIEW ---

type FileLanguage = 'hcl' | 'yaml' | 'ini' | 'text';

interface PreviewFile {
  name: string;
  content: string;
  language: FileLanguage;
}

function highlightCode(content: string, language: FileLanguage): React.ReactNode[] {
  const lines = content.split('\n');
  return lines.map((line, idx) => {
    let rendered: React.ReactNode = line;
    if (language === 'yaml' || language === 'ini') {
      rendered = highlightYAMLCode(line).length > 0 ? highlightYAMLCode(line) : line;
    } else {
      if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
        rendered = <span className="text-emerald-500">{line}</span>;
      } else {
        const parts = line.split(/("[^"]*")/g);
        rendered = parts.map((part, pIdx) => {
          if (part.startsWith('"') && part.endsWith('"')) {
            return <span key={pIdx} className="text-orange-400">{part}</span>;
          }
          const keywords = ['resource', 'provider', 'terraform', 'variable', 'output', 'data', 'ingress', 'egress', 'tags', 'backend'];
          const kwRe = new RegExp(`(${keywords.join('|')})`, 'g');
          if (kwRe.test(part)) {
            const sub = part.split(new RegExp(`(${keywords.join('|')})`, 'g'));
            return sub.map((s, sIdx) =>
              keywords.includes(s)
                ? <span key={sIdx} className="text-purple-400">{s}</span>
                : s
            );
          }
          return part;
        });
      }
    }
    return <div key={idx} className="min-h-[1.25rem]">{rendered}</div>;
  });
}

function getNodeFiles(node: Node, allNodes: Node[], allEdges: Edge[]): PreviewFile[] {
  const tech = node.data?.tech as string;

  if (node.id.startsWith('aws_instance.web_server') || node.id.startsWith('aws_security_group')) {
    const { mainTf, variablesTf, outputsTf } = generateTerraformFiles(allNodes, allEdges);
    if (node.id.startsWith('aws_security_group')) {
      return [{ name: 'main.tf', content: mainTf, language: 'hcl' }];
    }
    return [
      { name: 'main.tf', content: mainTf, language: 'hcl' },
      { name: 'variables.tf', content: variablesTf, language: 'hcl' },
      { name: 'outputs.tf', content: outputsTf, language: 'hcl' },
    ];
  }

  if (tech === 'Ansible') {
    const files = generateBundleFiles(allNodes, allEdges);
    const playbook = files.find(f => f.name === 'playbook.yml');
    const hosts = files.find(f => f.name === 'hosts.ini');
    return [
      { name: 'playbook.yml', content: playbook?.content ?? '', language: 'yaml' },
      { name: 'hosts.ini', content: hosts?.content ?? '', language: 'ini' },
    ];
  }

  if (tech === 'Kubernetes') {
    const files = generateBundleFiles(allNodes, allEdges);
    const dep = files.find(f => f.name === 'deployment.yaml');
    return [{ name: 'deployment.yaml', content: dep?.content ?? '', language: 'yaml' }];
  }

  return [{ name: `${node.id}.txt`, content: `# ${node.id}\n# No code preview available for this node type.`, language: 'text' }];
}

// CodeBlock: renders syntax-highlighted code with a copy button
const CodeBlock: React.FC<{ file: PreviewFile }> = ({ file }) => {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => highlightCode(file.content, file.language), [file.content, file.language]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0 select-none">
        <span className="text-[10px] font-mono text-muted-foreground">{file.name}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(file.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-[10px] text-primary hover:text-primary/90 font-semibold flex items-center gap-1 cursor-pointer"
        >
          <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} className="text-xs" />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex-1 bg-background border border-border rounded-lg p-3 overflow-auto font-mono text-[11px] text-muted-foreground leading-relaxed">
        <pre className="whitespace-pre-wrap break-all"><code>{highlighted}</code></pre>
      </div>
    </div>
  );
};

interface LiveCodePreviewProps {
  selectedNode: Node | null;
  nodes: Node[];
  edges: Edge[];
}

const LiveCodePreview: React.FC<LiveCodePreviewProps> = ({ selectedNode, nodes, edges }) => {
  const [activeFile, setActiveFile] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ Terraform: true, Ansible: true, Kubernetes: true });
  const [overviewFile, setOverviewFile] = useState<PreviewFile | null>(null);

  const files = useMemo(
    () => selectedNode ? getNodeFiles(selectedNode, nodes, edges) : [],
    [selectedNode, nodes, edges]
  );

  // Reset to first tab when node changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setActiveFile(0); setOverviewFile(null); }, [selectedNode?.id]);

  const allFiles = useMemo(() => generateBundleFiles(nodes, edges), [nodes, edges]);

  // --- NODE SELECTED: file tab view ---
  if (selectedNode) {
    if (files.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground select-none">
          No code preview for this node type.
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* File tabs */}
        <div className="flex gap-1 mb-3 flex-wrap shrink-0">
          {files.map((f, i) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(i)}
              className={clsx(
                'px-2.5 py-1 rounded text-[10px] font-mono font-semibold border transition-all cursor-pointer',
                activeFile === i
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        {/* Active file content */}
        <div className="flex-1 overflow-hidden">
          <CodeBlock file={files[activeFile]} />
        </div>
      </div>
    );
  }

  // --- NO NODE SELECTED: canvas overview ---
  const sections: { label: string; color: string; paths: string[] }[] = [
    { label: 'Terraform', color: 'text-primary', paths: ['terraform/'] },
    { label: 'Ansible', color: 'text-[#8B5CF6]', paths: ['ansible/'] },
    { label: 'Kubernetes', color: 'text-[#0EA5E9]', paths: ['k8s/'] },
  ];

  const hasTech = (paths: string[]) =>
    nodes.some(n => {
      const t = n.data?.tech as string;
      if (paths[0].startsWith('terraform')) return t === 'Terraform';
      if (paths[0].startsWith('ansible')) return t === 'Ansible';
      if (paths[0].startsWith('k8s')) return t === 'Kubernetes';
      return false;
    });

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground select-none">
        Add nodes to the canvas to see the compiled code preview.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {overviewFile ? (
        // Expanded file view within overview
        <div className="flex flex-col h-full overflow-hidden">
          <button
            onClick={() => setOverviewFile(null)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-2 shrink-0 cursor-pointer"
          >
            <Icon icon="lucide:arrow-left" className="text-xs" /> Back to overview
          </button>
          <div className="flex-1 overflow-hidden">
            <CodeBlock file={overviewFile} />
          </div>
        </div>
      ) : (
        // Overview: collapsible technology sections
        <div className="flex-1 overflow-y-auto space-y-3">
          <p className="text-[10px] text-muted-foreground select-none">
            Select a node to view its files, or browse the full compiled output below.
          </p>
          {sections.map(({ label, color, paths }) => {
            if (!hasTech(paths)) return null;
            const sectionFiles = allFiles.filter(f => paths.some(p => f.path.startsWith(p)));
            const isOpen = expandedSections[label] ?? true;
            return (
              <div key={label} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedSections(s => ({ ...s, [label]: !s[label] }))}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors cursor-pointer select-none"
                >
                  <span className={clsx('text-[11px] font-bold uppercase tracking-wider', color)}>{label}</span>
                  <Icon icon={isOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'} className="text-muted-foreground text-xs" />
                </button>
                {isOpen && (
                  <div className="divide-y divide-border/50">
                    {sectionFiles.map(f => (
                      <button
                        key={f.path}
                        onClick={() => setOverviewFile({ name: f.name, content: f.content, language: f.language.toLowerCase() as FileLanguage })}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="lucide:file-code" className="text-muted-foreground text-xs shrink-0" />
                          <span className="text-[11px] font-mono text-foreground">{f.name}</span>
                          <span className="text-[10px] text-muted-foreground">{f.lines} lines</span>
                        </div>
                        <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          view <Icon icon="lucide:chevron-right" className="text-[10px]" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// A sub-component to show all canvas components when no node is active
const CanvasSummary: React.FC<{
  nodes: Node[];
  onSelectNode: (id: string) => void;
}> = ({ nodes, onSelectNode }) => {
  const targetNodes = nodes.filter((n) => n.data?.tech === 'Target');
  const tfNodes = nodes.filter((n) => n.data?.tech === 'Terraform');
  const ansNodes = nodes.filter((n) => n.data?.tech === 'Ansible');
  const k8sNodes = nodes.filter((n) => n.data?.tech === 'Kubernetes');

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="border-b border-border/80 pb-2">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Canvas Summary</h4>
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          Select any active block below to edit its configurations.
        </p>
      </div>

      <div className="space-y-4">

        {targetNodes.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-[#14B8A6] uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6] animate-pulse"></span>
              Target ({targetNodes.length})
            </h5>
            <div className="grid gap-1.5">
              {targetNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="w-full text-left bg-muted/30 hover:bg-muted/70 border border-border/60 hover:border-[#14B8A6]/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-foreground transition-all duration-200 group cursor-pointer"
                >
                  <span className="font-semibold truncate max-w-[200px] flex items-center gap-2">
                    <Icon icon={node.data.icon as string} className="text-[#14B8A6] text-sm flex-shrink-0" />
                    {node.data.label as string}
                  </span>
                  <Icon icon="lucide:chevron-right" className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all text-xs" />
                </button>
              ))}
            </div>
          </div>
        )}

        {tfNodes.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
              Terraform ({tfNodes.length})
            </h5>
            <div className="grid gap-1.5">
              {tfNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="w-full text-left bg-muted/30 hover:bg-muted/70 border border-border/60 hover:border-primary/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-foreground transition-all duration-200 group cursor-pointer"
                >
                  <span className="font-semibold truncate max-w-[200px] flex items-center gap-2">
                    <Icon icon={node.data.icon as string} className="text-primary text-sm flex-shrink-0" />
                    {node.id}
                  </span>
                  <Icon icon="lucide:chevron-right" className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all text-xs" />
                </button>
              ))}
            </div>
          </div>
        )}

        {ansNodes.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-[#8B5CF6] uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6] animate-pulse"></span>
              Ansible ({ansNodes.length})
            </h5>
            <div className="grid gap-1.5">
              {ansNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="w-full text-left bg-muted/30 hover:bg-muted/70 border border-border/60 hover:border-[#8B5CF6]/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-foreground transition-all duration-200 group cursor-pointer"
                >
                  <span className="font-semibold truncate max-w-[200px] flex items-center gap-2">
                    <Icon icon={node.data.icon as string} className="text-[#8B5CF6] text-sm flex-shrink-0" />
                    {node.data.label as string}
                  </span>
                  <Icon icon="lucide:chevron-right" className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all text-xs" />
                </button>
              ))}
            </div>
          </div>
        )}

        {k8sNodes.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-[#0EA5E9] uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0EA5E9] animate-pulse"></span>
              Kubernetes ({k8sNodes.length})
            </h5>
            <div className="grid gap-1.5">
              {k8sNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="w-full text-left bg-muted/30 hover:bg-muted/70 border border-border/60 hover:border-[#0EA5E9]/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-foreground transition-all duration-200 group cursor-pointer"
                >
                  <span className="font-semibold truncate max-w-[200px] flex items-center gap-2">
                    <Icon icon={node.data.icon as string} className="text-[#0EA5E9] text-sm flex-shrink-0" />
                    {node.data.label as string}
                  </span>
                  <Icon icon="lucide:chevron-right" className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all text-xs" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// InspectorPanel Component
interface InspectorPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  updateNodeData: (nodeId: string, newData: Record<string, unknown>) => void;
  updateEdgeData: (edgeId: string, label: string, animated: boolean, stroke: string, strokeWidth: number) => void;
  deleteEdge: (edgeId: string) => void;
  ansiblePlaybook: string;
  nodes: Node[];
  edges: Edge[];
  setSelectedNodeId: (id: string | null) => void;
  isReadOnly?: boolean;
  onStartEditing?: (nodeId: string) => void;
  onEndEditing?: (nodeId: string) => void;
  availableCredentials?: Credential[];
}

// Union of every field InspectorPanel reads/writes on selectedNode.data.parameters
// across all node "tech" types (Terraform/Ansible/Kubernetes). The underlying data
// is loosely-validated per-node JSON, so every field is optional.
interface InspectorNodeParameters {
  // EC2 / Terraform instance
  instanceName?: string;
  amiId?: string;
  instanceType?: string;
  subnetId?: string;
  securityGroupId?: string;
  rootVolumeSize?: number;
  tags?: Tag[];
  // GCP instance
  gcpInstanceName?: string;
  gcpMachineType?: string;
  gcpImage?: string;
  gcpNetwork?: string;
  gcpDiskSize?: number;
  // Azure instance
  azureVmName?: string;
  azureVmSize?: string;
  azurePublisher?: string;
  azureOffer?: string;
  azureSku?: string;
  azureDiskSize?: number;
  // Security group
  sgName?: string;
  description?: string;
  httpPort?: number;
  httpsPort?: number;
  allowedCidr?: string;
  vpcId?: string;
  sshEnabled?: boolean;
  ingressPorts?: string;
  // S3
  bucketName?: string;
  versioningEnabled?: boolean;
  forceDestroy?: boolean;
  // RDS
  dbName?: string;
  engineVersion?: string;
  instanceClass?: string;
  allocatedStorage?: number;
  username?: string;
  password?: string;
  vpcSecurityGroupIds?: string;
  dbSubnetGroupName?: string;
  // VPC
  vpcName?: string;
  cidrBlock?: string;
  enableDnsHostnames?: boolean;
  // Subnet
  subnetName?: string;
  availabilityZone?: string;
  mapPublicIp?: boolean;
  // Ansible common
  ansibleHost?: string;
  ansibleUser?: string;
  packages?: string;
  state?: string;
  shell?: string;
  createHome?: boolean;
  serviceName?: string;
  enabled?: boolean;
  repoUrl?: string;
  destPath?: string;
  branch?: string;
  credentialId?: string;
  command?: string;
  chdir?: string;
  srcPath?: string;
  owner?: string;
  mode?: string;
  // Kubernetes
  deploymentName?: string;
  replicas?: number;
  containerPort?: number;
  imageName?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  serviceType?: string;
  port?: number;
  targetPort?: number;
  configMapName?: string;
  dataKey?: string;
  dataValue?: string;
  secretName?: string;
  secretKey?: string;
  secretValue?: string;
  ingressName?: string;
  host?: string;
  path?: string;
  servicePort?: number;
  pvcName?: string;
  storageSize?: string;
  storageClass?: string;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
  collapsed,
  onToggle,
  selectedNode,
  selectedEdge,
  activeTab,
  onTabChange,
  updateNodeData,
  updateEdgeData,
  deleteEdge,
  ansiblePlaybook,
  nodes,
  edges,
  setSelectedNodeId,
  isReadOnly = false,
  onStartEditing,
  onEndEditing,
  availableCredentials = [],
}) => {
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagVal, setNewTagVal] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [activeVmTab, setActiveVmTab] = useState<'aws' | 'gcp' | 'azure'>('aws');

  const p: InspectorNodeParameters = (selectedNode?.data?.parameters as InspectorNodeParameters | undefined) || (selectedNode ? (getDefaultParametersForNode(selectedNode.id) as InspectorNodeParameters) : {});
  const sg = p;

  const handleParameterChange = (key: string, value: unknown) => {
    if (!selectedNode || isReadOnly) return;
    updateNodeData(selectedNode.id, {
      parameters: { ...p, [key]: value }
    });
  };

  const handleSgChange = (key: string, value: unknown) => {
    if (!selectedNode) return;
    updateNodeData(selectedNode.id, {
      parameters: { ...sg, [key]: value }
    });
  };

  const handleTagAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (newTagKey && newTagVal && selectedNode) {
      updateNodeData(selectedNode.id, {
        parameters: {
          ...p,
          tags: [...(p.tags || []), { key: newTagKey, value: newTagVal }]
        }
      });
      setNewTagKey('');
      setNewTagVal('');
      setShowAddTag(false);
    }
  };

  const handleTagDelete = (index: number) => {
    if (!selectedNode || isReadOnly) return;
    updateNodeData(selectedNode.id, {
      parameters: {
        ...p,
        tags: (p.tags || []).filter((_: Tag, idx: number) => idx !== index)
      }
    });
  };

  // Node variable inputs for Ansible nodes
  const nodeLabel = selectedNode?.data?.label as string || '';
  const portVal = (selectedNode?.data?.port as string) || '';
  const dbUserVal = (selectedNode?.data?.dbUser as string) || '';
  const dbPassVal = (selectedNode?.data?.dbPass as string) || '';
  const repoUrlVal = (selectedNode?.data?.repoUrl as string) || '';
  const branchVal = (selectedNode?.data?.branch as string) || '';
  const environmentVal = (selectedNode?.data?.environment as string) || 'localstack';
  const regionVal = (selectedNode?.data?.region as string) || 'us-east-1';
  const credentialIdVal = (selectedNode?.data?.credentialId as string) || '';
  const sshKeyIdVal = (selectedNode?.data?.sshKeyId as string) || '';
  const projectIDVal = (selectedNode?.data?.projectId as string) || '';
  const gcpZoneVal = (selectedNode?.data?.gcpZone as string) || 'us-central1-a';
  const startCommandVal = (selectedNode?.data?.startCommand as string) || '';
  const appPortVal = (selectedNode?.data?.appPort as string) || '';
  const appTypeVal = (selectedNode?.data?.appType as string) || '';
  const buildCommandVal = (selectedNode?.data?.buildCommand as string) || '';
  const destPathVal = (selectedNode?.data?.destPath as string) || '/home/ubuntu/app';

  return (
    <aside className={clsx(
      "bg-card/95 backdrop-blur-md flex flex-col shrink-0 z-20 transition-all duration-300 relative overflow-visible",
      collapsed ? "w-0 border-l-0" : "w-90 border-l border-border"
    )}>
      {/* Sliding Window Container */}
      <div className="w-full h-full overflow-hidden">
        {/* Fixed Width Content Panel */}
        <div className="w-90 h-full flex flex-col">
          {/* Inspector Header */}
          <div className="p-4 border-b border-border flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Icon
                  icon={(selectedNode?.data?.icon as string) || "lucide:globe"}
                  className={clsx("text-sm", (selectedNode?.data?.tech as string) === 'Terraform' ? 'text-primary' : (selectedNode?.data?.tech as string) === 'Ansible' ? 'text-[#8B5CF6]' : (selectedNode?.data?.tech as string) === 'Source' ? 'text-[#F59E0B]' : (selectedNode?.data?.tech as string) === 'Target' ? 'text-[#14B8A6]' : 'text-[#0EA5E9]')}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground truncate max-w-[150px]">{selectedNode?.id || "No Selection"}</h3>
                <p className="text-[10px] text-muted-foreground">{(selectedNode?.data?.tech as string) || 'Global'} Configuration</p>
              </div>
            </div>
            <button onClick={onToggle} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-all cursor-pointer" title="Close Inspector">
              <Icon icon="lucide:x" className="text-sm" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="flex border-b border-border select-none">
            <button
              onClick={() => onTabChange('Parameters')}
              className={clsx(
                "flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer",
                activeTab === 'Parameters' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Parameters
            </button>
            {!selectedEdge && (
              <button
                onClick={() => onTabChange('Live Code Preview')}
                className={clsx(
                  "flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer",
                  activeTab === 'Live Code Preview' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Live Code Preview
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div 
            className={clsx("flex-1 p-4", activeTab === 'Parameters' ? "overflow-y-auto space-y-4" : "flex flex-col overflow-hidden")}
            onFocusCapture={() => selectedNode && onStartEditing?.(selectedNode.id)}
            onBlurCapture={() => selectedNode && onEndEditing?.(selectedNode.id)}
          >
            {activeTab === 'Parameters' ? (
              selectedEdge ? (() => {
                const currentLabel = typeof selectedEdge.label === 'string' ? selectedEdge.label : '';
                const currentStroke = selectedEdge.style?.stroke || '#8B5CF6';
                const currentStrokeWidth = typeof selectedEdge.style?.strokeWidth === 'number' ? selectedEdge.style.strokeWidth : 2.5;
                return (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2.5 p-3 bg-primary/10 border border-primary/20 rounded-xl select-none">
                      <Icon icon="lucide:link-2" className="text-primary text-base shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-white">Connection Link Settings</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                          Configure the style, animation, and flow properties of this connection.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {/* Link Label */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Link Label</label>
                        <input
                          type="text"
                          value={currentLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateEdgeData(
                              selectedEdge.id,
                              val,
                              selectedEdge.animated || false,
                              currentStroke,
                              currentStrokeWidth
                            );
                          }}
                          placeholder="e.g. Web Traffic"
                          className="w-full bg-background border border-border rounded-lg py-2 px-3 text-xs text-white placeholder:text-slate-650 outline-none focus:border-primary transition"
                        />
                      </div>

                      {/* Animation Toggle */}
                      <div className="flex items-center justify-between p-2.5 bg-background/30 border border-border/50 rounded-xl">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-white">Animate Flow Dash</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">Show animated pulse lines along the connection</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedEdge.animated || false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            updateEdgeData(
                              selectedEdge.id,
                              currentLabel,
                              val,
                              currentStroke,
                              currentStrokeWidth
                            );
                          }}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                      </div>

                      {/* Link Thickness */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Thickness (Width)</label>
                          <span className="text-xs font-mono text-slate-400">{currentStrokeWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="8"
                          step="0.5"
                          value={currentStrokeWidth}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            updateEdgeData(
                              selectedEdge.id,
                              currentLabel,
                              selectedEdge.animated || false,
                              currentStroke,
                              val
                            );
                          }}
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      {/* Color Swatches */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Link Color</label>
                        <div className="flex flex-wrap gap-2.5 p-2.5 bg-background/30 border border-border/50 rounded-xl">
                          {[
                            { name: 'Indigo', hex: '#6366F1' },
                            { name: 'Violet', hex: '#8B5CF6' },
                            { name: 'Amber', hex: '#F59E0B' },
                            { name: 'Teal', hex: '#14B8A6' },
                            { name: 'Sky', hex: '#0EA5E9' },
                            { name: 'Emerald', hex: '#10B981' },
                            { name: 'Rose', hex: '#F43F5E' },
                            { name: 'Gray', hex: '#64748B' }
                          ].map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => {
                                updateEdgeData(
                                  selectedEdge.id,
                                  currentLabel,
                                  selectedEdge.animated || false,
                                  c.hex,
                                  currentStrokeWidth
                                );
                              }}
                              className={clsx(
                                "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer hover:scale-110",
                                currentStroke === c.hex ? "border-white" : "border-transparent"
                              )}
                              style={{ backgroundColor: c.hex }}
                              title={c.name}
                            >
                              {currentStroke === c.hex && (
                                <Icon icon="lucide:check" className="text-xs text-white drop-shadow-md font-bold" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Delete Link Action */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this connection link?')) {
                              deleteEdge(selectedEdge.id);
                            }
                          }}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 py-2.5 text-xs font-semibold shadow-md transition cursor-pointer"
                        >
                          <Icon icon="lucide:trash-2" className="text-sm" />
                          Delete Connection
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })() : !selectedNode ? (
                nodes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-xs select-none animate-in fade-in duration-200">
                    <div className="text-2xl mb-2">📋</div>
                    <p className="font-semibold text-white text-sm">Canvas is empty</p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-normal max-w-[200px] mx-auto">
                      Add automation components to the canvas to configure parameters.
                    </p>
                  </div>
                ) : (
                  <CanvasSummary nodes={nodes} onSelectNode={setSelectedNodeId} />
                )
              ) : (
                <fieldset disabled={isReadOnly} className="space-y-3 border-0 p-0 m-0">
                  {isReadOnly && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 mb-4 select-none">
                      <Icon icon="lucide:alert-circle" className="text-amber-500 text-base shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <p className="text-xs font-bold text-amber-400">Canvas Locked</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                          Parameters are read-only while a pipeline run is active.
                        </p>
                      </div>
                    </div>
                  )}
                  {/* 1. TERRAFORM INSTANCE NODE PARAMETERS */}
                  {selectedNode.id.startsWith('aws_instance.web_server') && (
                    <>
                      {/* Tabs Header */}
                      <div className="flex border-b border-border mb-4">
                        <button
                          onClick={() => setActiveVmTab('aws')}
                          className={clsx(
                            "flex-1 pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 text-center",
                            activeVmTab === 'aws'
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          AWS
                        </button>
                        <button
                          onClick={() => setActiveVmTab('gcp')}
                          className={clsx(
                            "flex-1 pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 text-center",
                            activeVmTab === 'gcp'
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          GCP
                        </button>
                        <button
                          onClick={() => setActiveVmTab('azure')}
                          className={clsx(
                            "flex-1 pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 text-center",
                            activeVmTab === 'azure'
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Azure
                        </button>
                      </div>

                      {activeVmTab === 'aws' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Instance Name</label>
                            <input
                              type="text"
                              value={p.instanceName || ''}
                              onChange={(e) => handleParameterChange('instanceName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AMI ID</label>
                              <input
                                type="text"
                                value={p.amiId || ''}
                                onChange={(e) => handleParameterChange('amiId', e.target.value)}
                                placeholder="e.g. ami-0abcdef1234567890"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Instance Type</label>
                              <div className="relative">
                                <select
                                  value={p.instanceType || 't3.micro'}
                                  onChange={(e) => handleParameterChange('instanceType', e.target.value)}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                                >
                                  <option value="t3.micro">t3.micro</option>
                                  <option value="t3.small">t3.small</option>
                                  <option value="t3.medium">t3.medium</option>
                                  <option value="t3.large">t3.large</option>
                                  <option value="m5.large">m5.large</option>
                                  <option value="m5.xlarge">m5.xlarge</option>
                                  <option value="c5.large">c5.large</option>
                                </select>
                                <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Subnet ID</label>
                            <InputWithVariablePicker
                              nodes={nodes}
                              onValueChange={(val) => handleParameterChange('subnetId', val)}
                              type="text"
                              value={p.subnetId || ''}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Security Group ID</label>
                            <InputWithVariablePicker
                              nodes={nodes}
                              onValueChange={(val) => handleParameterChange('securityGroupId', val)}
                              type="text"
                              value={p.securityGroupId || ''}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1 select-none">
                              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Root Volume Size</label>
                              <span className="text-xs font-semibold text-foreground">{p.rootVolumeSize || 50} GB</span>
                            </div>
                            <input
                              type="range"
                              min="8"
                              max="200"
                              value={p.rootVolumeSize || 50}
                              onChange={(e) => handleParameterChange('rootVolumeSize', parseInt(e.target.value))}
                              className="w-full accent-primary bg-muted h-1 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 select-none">
                              <span>8 GB</span>
                              <span>200 GB</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Tags</label>
                            <div className="flex flex-wrap gap-1.5 p-2 bg-muted border border-border rounded-lg">
                              {(p.tags || []).map((tag: Tag, idx: number) => (
                                <span key={idx} className="inline-flex items-center gap-1 bg-card px-2 py-0.5 rounded text-[10px] text-foreground border border-border">
                                  {tag.key}: {tag.value}
                                  <button onClick={() => handleTagDelete(idx)} className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer">
                                    <Icon icon="lucide:x" className="text-[10px]" />
                                  </button>
                                </span>
                              ))}
                              {!showAddTag ? (
                                <button
                                  onClick={() => setShowAddTag(true)}
                                  className="text-[10px] text-primary hover:text-primary/90 font-semibold px-2 py-0.5 flex items-center gap-1 cursor-pointer"
                                >
                                  <Icon icon="lucide:plus" className="text-xs" /> Add tag
                                </button>
                              ) : (
                                <form onSubmit={handleTagAdd} className="flex items-center gap-1 w-full mt-1">
                                  <input
                                    type="text"
                                    placeholder="Key"
                                    value={newTagKey}
                                    onChange={(e) => setNewTagKey(e.target.value)}
                                    className="bg-card border border-border rounded px-1.5 py-0.5 text-[10px] w-1/2 text-foreground focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={newTagVal}
                                    onChange={(e) => setNewTagVal(e.target.value)}
                                    className="bg-card border border-border rounded px-1.5 py-0.5 text-[10px] w-1/2 text-foreground focus:outline-none"
                                  />
                                  <button type="submit" className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
                                    <Icon icon="lucide:check" className="text-xs" />
                                  </button>
                                  <button type="button" onClick={() => setShowAddTag(false)} className="text-rose-400 hover:text-rose-300 cursor-pointer">
                                    <Icon icon="lucide:x" className="text-xs" />
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      {activeVmTab === 'gcp' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Instance Name</label>
                            <input
                              type="text"
                              value={p.gcpInstanceName || ''}
                              onChange={(e) => handleParameterChange('gcpInstanceName', e.target.value)}
                              placeholder="e.g. web-server"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Machine Type</label>
                              <div className="relative">
                                <select
                                  value={p.gcpMachineType || 'e2-micro'}
                                  onChange={(e) => handleParameterChange('gcpMachineType', e.target.value)}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                                >
                                  <option value="e2-micro">e2-micro</option>
                                  <option value="e2-small">e2-small</option>
                                  <option value="e2-medium">e2-medium</option>
                                  <option value="n2-standard-2">n2-standard-2</option>
                                  <option value="n2-standard-4">n2-standard-4</option>
                                </select>
                                <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Image</label>
                              <input
                                type="text"
                                value={p.gcpImage || 'ubuntu-os-cloud/ubuntu-2204-lts'}
                                onChange={(e) => handleParameterChange('gcpImage', e.target.value)}
                                placeholder="ubuntu-os-cloud/ubuntu-2204-lts"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Network</label>
                            <input
                              type="text"
                              value={p.gcpNetwork || 'default'}
                              onChange={(e) => handleParameterChange('gcpNetwork', e.target.value)}
                              placeholder="default"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1 select-none">
                              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Disk Size</label>
                              <span className="text-xs font-semibold text-foreground">{p.gcpDiskSize || 50} GB</span>
                            </div>
                            <input
                              type="range"
                              min="10"
                              max="500"
                              value={p.gcpDiskSize || 50}
                              onChange={(e) => handleParameterChange('gcpDiskSize', parseInt(e.target.value))}
                              className="w-full accent-primary bg-muted h-1 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 select-none">
                              <span>10 GB</span>
                              <span>500 GB</span>
                            </div>
                          </div>
                        </>
                      )}

                      {activeVmTab === 'azure' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VM Name</label>
                            <input
                              type="text"
                              value={p.azureVmName || ''}
                              onChange={(e) => handleParameterChange('azureVmName', e.target.value)}
                              placeholder="e.g. web-vm"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Size (SKU)</label>
                              <div className="relative">
                                <select
                                  value={p.azureVmSize || 'Standard_B1s'}
                                  onChange={(e) => handleParameterChange('azureVmSize', e.target.value)}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                                >
                                  <option value="Standard_B1s">Standard_B1s</option>
                                  <option value="Standard_B1ms">Standard_B1ms</option>
                                  <option value="Standard_B2s">Standard_B2s</option>
                                  <option value="Standard_D2s_v3">Standard_D2s_v3</option>
                                </select>
                                <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Publisher</label>
                              <input
                                type="text"
                                value={p.azurePublisher || 'Canonical'}
                                onChange={(e) => handleParameterChange('azurePublisher', e.target.value)}
                                placeholder="Canonical"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Offer</label>
                              <input
                                type="text"
                                value={p.azureOffer || 'UbuntuServer'}
                                onChange={(e) => handleParameterChange('azureOffer', e.target.value)}
                                placeholder="UbuntuServer"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">SKU</label>
                              <input
                                type="text"
                                value={p.azureSku || '18.04-LTS'}
                                onChange={(e) => handleParameterChange('azureSku', e.target.value)}
                                placeholder="18.04-LTS"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1 select-none">
                              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">OS Disk Size</label>
                              <span className="text-xs font-semibold text-foreground">{p.azureDiskSize || 50} GB</span>
                            </div>
                            <input
                              type="range"
                              min="30"
                              max="1024"
                              value={p.azureDiskSize || 50}
                              onChange={(e) => handleParameterChange('azureDiskSize', parseInt(e.target.value))}
                              className="w-full accent-primary bg-muted h-1 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 select-none">
                              <span>30 GB</span>
                              <span>1024 GB</span>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {selectedNode.id.startsWith('aws_security_group') && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Security Group Name</label>
                        <input
                          type="text"
                          value={p.sgName}
                          onChange={(e) => handleParameterChange('sgName', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</label>
                        <input
                          type="text"
                          value={p.description}
                          onChange={(e) => handleParameterChange('description', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">HTTP Port</label>
                          <input
                            type="number"
                            value={p.httpPort ?? 80}
                            onChange={(e) => handleParameterChange('httpPort', parseInt(e.target.value))}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">HTTPS Port</label>
                          <input
                            type="number"
                            value={p.httpsPort ?? 443}
                            onChange={(e) => handleParameterChange('httpsPort', parseInt(e.target.value))}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Allowed CIDR</label>
                        <InputWithVariablePicker
                          nodes={nodes}
                          onValueChange={(val) => handleParameterChange('allowedCidr', val)}
                          type="text"
                          value={p.allowedCidr || '0.0.0.0/0'}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Link ID</label>
                        <InputWithVariablePicker
                          nodes={nodes}
                          onValueChange={(val) => handleParameterChange('vpcId', val)}
                          type="text"
                          value={p.vpcId || ''}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>

                      <div className="flex items-center justify-between bg-muted border border-border rounded-lg px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Enable SSH Access</p>
                          <p className="text-[10px] text-muted-foreground">Opens port 22 (TCP)</p>
                        </div>
                        <button
                          onClick={() => handleParameterChange('sshEnabled', !p.sshEnabled)}
                          className={clsx(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                            p.sshEnabled !== false ? "bg-primary" : "bg-muted-foreground/30"
                          )}
                        >
                          <span className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200",
                            p.sshEnabled !== false ? "translate-x-4" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Inbound Allowed Ports (Fallback)</label>
                        <input
                          type="text"
                          value={p.ingressPorts || '80, 443, 22'}
                          onChange={(e) => handleParameterChange('ingressPorts', e.target.value)}
                          placeholder="e.g. 80, 443, 22"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.id.startsWith('aws_s3_bucket') && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Bucket Name</label>
                        <input
                          type="text"
                          value={p.bucketName}
                          onChange={(e) => handleParameterChange('bucketName', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border select-none">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-heading">Versioning Enabled</span>
                        <input
                          type="checkbox"
                          checked={p.versioningEnabled}
                          onChange={(e) => handleParameterChange('versioningEnabled', e.target.checked)}
                          className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border select-none">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-heading">Force Destroy on Teardown</span>
                        <input
                          type="checkbox"
                          checked={p.forceDestroy}
                          onChange={(e) => handleParameterChange('forceDestroy', e.target.checked)}
                          className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.id.startsWith('aws_db_instance') && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">DB Identifier/Name</label>
                        <input
                          type="text"
                          value={p.dbName}
                          onChange={(e) => handleParameterChange('dbName', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Engine Version</label>
                          <input
                            type="text"
                            value={p.engineVersion}
                            onChange={(e) => handleParameterChange('engineVersion', e.target.value)}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Instance Class</label>
                          <select
                            value={p.instanceClass}
                            onChange={(e) => handleParameterChange('instanceClass', e.target.value)}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none cursor-pointer transition-all"
                          >
                            <option value="db.t3.micro">db.t3.micro</option>
                            <option value="db.t3.medium">db.t3.medium</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Allocated Storage (GB)</label>
                        <input
                          type="number"
                          value={p.allocatedStorage}
                          onChange={(e) => handleParameterChange('allocatedStorage', parseInt(e.target.value) || 20)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Master Username</label>
                          <input
                            type="text"
                            value={p.username}
                            onChange={(e) => handleParameterChange('username', e.target.value)}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Master Password</label>
                          <input
                            type="password"
                            value={p.password}
                            onChange={(e) => handleParameterChange('password', e.target.value)}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Security Group IDs</label>
                        <InputWithVariablePicker
                          nodes={nodes}
                          onValueChange={(val) => handleParameterChange('vpcSecurityGroupIds', val)}
                          type="text"
                          value={p.vpcSecurityGroupIds || ''}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">DB Subnet Group Name</label>
                        <InputWithVariablePicker
                          nodes={nodes}
                          onValueChange={(val) => handleParameterChange('dbSubnetGroupName', val)}
                          type="text"
                          value={p.dbSubnetGroupName || ''}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.id.startsWith('aws_vpc') && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Name</label>
                        <input
                          type="text"
                          value={p.vpcName}
                          onChange={(e) => handleParameterChange('vpcName', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">CIDR Block</label>
                        <input
                          type="text"
                          value={p.cidrBlock}
                          onChange={(e) => handleParameterChange('cidrBlock', e.target.value)}
                          placeholder="10.0.0.0/16"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border select-none">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-heading">Enable DNS Hostnames</span>
                        <input
                          type="checkbox"
                          checked={p.enableDnsHostnames}
                          onChange={(e) => handleParameterChange('enableDnsHostnames', e.target.checked)}
                          className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.id.startsWith('aws_subnet') && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Subnet Name</label>
                        <input
                          type="text"
                          value={p.subnetName}
                          onChange={(e) => handleParameterChange('subnetName', e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">VPC Link ID</label>
                        <input
                          type="text"
                          value={p.vpcId}
                          onChange={(e) => handleParameterChange('vpcId', e.target.value)}
                          placeholder="e.g. aws_vpc.app_vpc.id"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">CIDR Block</label>
                          <input
                            type="text"
                            value={p.cidrBlock}
                            onChange={(e) => handleParameterChange('cidrBlock', e.target.value)}
                            placeholder="10.0.1.0/24"
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Availability Zone</label>
                          <input
                            type="text"
                            value={p.availabilityZone}
                            onChange={(e) => handleParameterChange('availabilityZone', e.target.value)}
                            placeholder="us-east-1a"
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border select-none">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-heading">Map Public IP on Launch</span>
                        <input
                          type="checkbox"
                          checked={p.mapPublicIp}
                          onChange={(e) => handleParameterChange('mapPublicIp', e.target.checked)}
                          className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                        />
                      </div>
                    </>
                  )}

                  {/* 2. ANSIBLE DYNAMIC NODE PARAMETERS (VARIABLES) */}
                  {selectedNode.data.tech === 'Ansible' && (
                    <div className="space-y-4">
                      <p className="text-[11px] text-muted-foreground">Ansible playbooks support variable binding using `{`{ variable }`}`. Click `{`{x}`}` to convert hardcoded values to variables.</p>
                      
                      {/* Connection Settings */}
                      <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-3">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Icon icon="lucide:settings" className="text-primary text-xs" /> Target Connection Settings
                        </span>
                        <div>
                          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Target Host IP</label>
                          <InputWithVariablePicker
                            nodes={nodes}
                            onValueChange={(val) => handleParameterChange('ansibleHost', val)}
                            type="text"
                            value={p.ansibleHost || ''}
                            placeholder="e.g. 127.0.0.1 or {{ nodes.web_server.public_ip }}"
                            className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Target SSH User</label>
                          <input
                            type="text"
                            value={p.ansibleUser || 'ubuntu'}
                            onChange={(e) => handleParameterChange('ansibleUser', e.target.value)}
                            placeholder="e.g. ubuntu or ec2-user"
                            className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                          />
                        </div>
                      </div>
                      
                      {nodeLabel.includes('Open Port') && (
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Open Firewall Port</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={portVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { port: e.target.value })}
                              placeholder="e.g. 80 or {{ port }}"
                              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                            <button
                              onClick={() => {
                                const current = portVal || 'port_number';
                                if (!current.startsWith('{{')) {
                                  updateNodeData(selectedNode.id, { port: `{{ ${current} }}` });
                                }
                              }}
                              className="px-3 bg-muted border border-border rounded-lg text-muted-foreground hover:text-primary transition-all font-mono text-xs cursor-pointer flex items-center justify-center"
                              title="Convert to Variable"
                            >
                              {'{x}'}
                            </button>
                          </div>
                        </div>
                      )}

                      {(nodeLabel.includes('PostgreSQL') || nodeLabel.includes('Postgres')) && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Database User</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={dbUserVal}
                                onChange={(e) => updateNodeData(selectedNode.id, { dbUser: e.target.value })}
                                placeholder="e.g. admin or {{ db_user }}"
                                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                              />
                              <button
                                onClick={() => {
                                  const current = dbUserVal || 'db_user';
                                  if (!current.startsWith('{{')) {
                                    updateNodeData(selectedNode.id, { dbUser: `{{ ${current} }}` });
                                  }
                                }}
                                className="px-3 bg-muted border border-border rounded-lg text-muted-foreground hover:text-primary transition-all font-mono text-xs cursor-pointer flex items-center justify-center"
                                title="Convert to Variable"
                              >
                                {'{x}'}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Database Password</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={dbPassVal}
                                onChange={(e) => updateNodeData(selectedNode.id, { dbPass: e.target.value })}
                                placeholder="e.g. password or {{ db_pass }}"
                                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                              />
                              <button
                                onClick={() => {
                                  const current = dbPassVal || 'db_pass';
                                  if (!current.startsWith('{{')) {
                                    updateNodeData(selectedNode.id, { dbPass: `{{ ${current} }}` });
                                  }
                                }}
                                className="px-3 bg-muted border border-border rounded-lg text-muted-foreground hover:text-primary transition-all font-mono text-xs cursor-pointer flex items-center justify-center"
                                title="Convert to Variable"
                              >
                                {'{x}'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {nodeLabel.includes('Deploy Node App') && (
                        <div className="space-y-4">
                          <p className="text-[11px] text-muted-foreground">
                            Requires a Code Repository node connected upstream — this task copies its cloned code onto the server, installs dependencies, and keeps it running with pm2.
                          </p>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Start Command</label>
                            <input
                              type="text"
                              value={startCommandVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { startCommand: e.target.value })}
                              placeholder="npm start"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">App Port</label>
                            <input
                              type="text"
                              value={appPortVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { appPort: e.target.value })}
                              placeholder="3000"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('apt_install') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Packages to Install</label>
                            <input
                              type="text"
                              value={p.packages}
                              onChange={(e) => handleParameterChange('packages', e.target.value)}
                              placeholder="e.g. curl, git, jq"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Desired State</label>
                            <select
                              value={p.state}
                              onChange={(e) => handleParameterChange('state', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer transition-all"
                            >
                              <option value="present">present</option>
                              <option value="latest">latest</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('create_user') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Username</label>
                            <input
                              type="text"
                              value={p.username}
                              onChange={(e) => handleParameterChange('username', e.target.value)}
                              placeholder="deployer"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Login Shell</label>
                            <input
                              type="text"
                              value={p.shell}
                              onChange={(e) => handleParameterChange('shell', e.target.value)}
                              placeholder="/bin/bash"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div className="flex items-center justify-between p-2 bg-muted rounded-lg border border-border select-none">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Create Home Directory</span>
                            <input
                              type="checkbox"
                              checked={p.createHome}
                              onChange={(e) => handleParameterChange('createHome', e.target.checked)}
                              className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('systemd_service') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Name</label>
                            <input
                              type="text"
                              value={p.serviceName}
                              onChange={(e) => handleParameterChange('serviceName', e.target.value)}
                              placeholder="nginx"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Desired State</label>
                            <select
                              value={p.state}
                              onChange={(e) => handleParameterChange('state', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer transition-all"
                            >
                              <option value="started">started</option>
                              <option value="stopped">stopped</option>
                              <option value="restarted">restarted</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-muted rounded-lg border border-border select-none">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Enabled on Boot</span>
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) => handleParameterChange('enabled', e.target.checked)}
                              className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('git_clone') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Git Repository URL</label>
                            <input
                              type="text"
                              value={p.repoUrl || ''}
                              onChange={(e) => {
                                handleParameterChange('repoUrl', e.target.value);
                                updateNodeData(selectedNode.id, { repoUrl: e.target.value });
                              }}
                              placeholder="https://github.com/org/repo.git"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Destination Path</label>
                            <input
                              type="text"
                              value={p.destPath || ''}
                              onChange={(e) => {
                                handleParameterChange('destPath', e.target.value);
                                updateNodeData(selectedNode.id, { destPath: e.target.value });
                              }}
                              placeholder="/var/www/app"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Version / Branch</label>
                            <input
                              type="text"
                              value={p.branch || ''}
                              onChange={(e) => {
                                handleParameterChange('branch', e.target.value);
                                updateNodeData(selectedNode.id, { branch: e.target.value });
                              }}
                              placeholder="main"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">GitHub Credential (for Private Repos)</label>
                            <div className="relative">
                              <select
                                value={p.credentialId || ''}
                                onChange={(e) => {
                                  handleParameterChange('credentialId', e.target.value);
                                  updateNodeData(selectedNode.id, { credentialId: e.target.value });
                                }}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                              >
                                <option value="">-- Public Repository (No Auth) --</option>
                                {availableCredentials.filter(c => c.provider === 'GITHUB').map(c => (
                                  <option key={c.id} value={c.id}>{c.name} ({c.key_fingerprint})</option>
                                ))}
                              </select>
                              <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('shell_command') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Command to execute</label>
                            <input
                              type="text"
                              value={p.command}
                              onChange={(e) => handleParameterChange('command', e.target.value)}
                              placeholder="echo 'hello world'"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Working Directory (chdir)</label>
                            <input
                              type="text"
                              value={p.chdir}
                              onChange={(e) => handleParameterChange('chdir', e.target.value)}
                              placeholder="/tmp"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('file_copy') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Source File Path</label>
                            <input
                              type="text"
                              value={p.srcPath}
                              onChange={(e) => handleParameterChange('srcPath', e.target.value)}
                              placeholder="config.json"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Destination Remote Path</label>
                            <input
                              type="text"
                              value={p.destPath}
                              onChange={(e) => handleParameterChange('destPath', e.target.value)}
                              placeholder="/var/www/app/config.json"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Owner</label>
                              <input
                                type="text"
                                value={p.owner}
                                onChange={(e) => handleParameterChange('owner', e.target.value)}
                                placeholder="www-data"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Permissions Mode</label>
                              <input
                                type="text"
                                value={p.mode}
                                onChange={(e) => handleParameterChange('mode', e.target.value)}
                                placeholder="0644"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {!nodeLabel.includes('Open Port') &&
                       !nodeLabel.includes('Postgres') &&
                       !nodeLabel.includes('PostgreSQL') &&
                       !nodeLabel.includes('Deploy Node App') &&
                       !selectedNode.id.startsWith('apt_install') &&
                       !selectedNode.id.startsWith('create_user') &&
                       !selectedNode.id.startsWith('systemd_service') &&
                       !selectedNode.id.startsWith('git_clone') &&
                       !selectedNode.id.startsWith('shell_command') &&
                       !selectedNode.id.startsWith('file_copy') && (
                        <div className="text-center py-6 text-muted-foreground text-xs select-none">
                          No custom variables to configure for this Ansible block.
                        </div>
                      )}
                    </div>
                  )}

                   {/* 2c. TARGET NODE PARAMETERS */}
                  {selectedNode.data.tech === 'Target' && (
                    <div className="space-y-4">
                      {selectedNode.id.startsWith('aws_target') ? (
                        <>
                          <p className="text-[11px] text-muted-foreground">
                            Chooses which AWS environment Terraform provisions into. LocalStack sandbox for testing, live AWS cloud for production.
                          </p>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Environment</label>
                            <div className="relative">
                              <select
                                  value={environmentVal}
                                  onChange={(e) => updateNodeData(selectedNode.id, { environment: e.target.value })}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                              >
                                <option value="localstack">LocalStack (Sandbox)</option>
                                <option value="aws">Live AWS (Cloud)</option>
                              </select>
                              <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                            </div>
                          </div>

                          {environmentVal === 'aws' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AWS Credential Source</label>
                              <div className="relative">
                                <select
                                    value={credentialIdVal}
                                    onChange={(e) => updateNodeData(selectedNode.id, { credentialId: e.target.value })}
                                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                                >
                                  <option value="">-- Select AWS Credential --</option>
                                  {availableCredentials.filter(c => c.provider === 'AWS').map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.key_fingerprint})</option>
                                  ))}
                                </select>
                                <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AWS Region</label>
                            <input
                              type="text"
                              value={regionVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { region: e.target.value })}
                              placeholder="us-east-1"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] text-muted-foreground">
                            Chooses which GCP project and zone to deploy into.
                          </p>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Environment</label>
                            <div className="relative">
                              <select
                                  value={environmentVal}
                                  onChange={(e) => updateNodeData(selectedNode.id, { environment: e.target.value })}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                              >
                                <option value="gcp">Live GCP (Cloud)</option>
                              </select>
                              <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">GCP Service Account JSON</label>
                            <div className="relative">
                              <select
                                  value={credentialIdVal}
                                  onChange={(e) => updateNodeData(selectedNode.id, { credentialId: e.target.value })}
                                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                              >
                                <option value="">-- Select GCP Service Account --</option>
                                {availableCredentials.filter(c => c.provider === 'GCP').map(c => (
                                  <option key={c.id} value={c.id}>{c.name} ({c.key_fingerprint})</option>
                                ))}
                              </select>
                              <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">GCP Project ID</label>
                            <input
                              type="text"
                              value={projectIDVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { projectId: e.target.value })}
                              placeholder="infracanvas-prod-12345"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">GCP Region</label>
                            <input
                              type="text"
                              value={regionVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { region: e.target.value })}
                              placeholder="us-central1"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">GCP Zone</label>
                            <input
                              type="text"
                              value={gcpZoneVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { gcpZone: e.target.value })}
                              placeholder="us-central1-a"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                        </>
                      )}

                      {/* COMMON SSH KEY CONFIGURATION */}
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Ansible SSH Target Private Key</label>
                        <div className="relative">
                          <select
                              value={sshKeyIdVal}
                              onChange={(e) => updateNodeData(selectedNode.id, { sshKeyId: e.target.value })}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                          >
                            <option value="">-- Select SSH Key (.pem) --</option>
                            {availableCredentials.filter(c => c.provider === 'SSH').map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.key_fingerprint})</option>
                            ))}
                          </select>
                          <Icon icon="lucide:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2d. KUBERNETES NODE PARAMETERS */}
                  {selectedNode.data.tech === 'Kubernetes' && (
                    <div className="space-y-4">
                      {selectedNode.id.startsWith('k8s_deployment') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Deployment Name</label>
                            <input
                              type="text"
                              value={p.deploymentName}
                              onChange={(e) => handleParameterChange('deploymentName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Replicas</label>
                              <input
                                type="number"
                                value={p.replicas}
                                onChange={(e) => handleParameterChange('replicas', parseInt(e.target.value) || 1)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Container Port</label>
                              <input
                                type="number"
                                value={p.containerPort}
                                onChange={(e) => handleParameterChange('containerPort', parseInt(e.target.value) || 80)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Container Image</label>
                            <input
                              type="text"
                              value={p.imageName}
                              onChange={(e) => handleParameterChange('imageName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">CPU Request/Limit</label>
                              <input
                                type="text"
                                value={p.cpuLimit}
                                onChange={(e) => handleParameterChange('cpuLimit', e.target.value)}
                                placeholder="500m"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Memory Request/Limit</label>
                              <input
                                type="text"
                                value={p.memoryLimit}
                                onChange={(e) => handleParameterChange('memoryLimit', e.target.value)}
                                placeholder="512Mi"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('k8s_service') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Name</label>
                            <input
                              type="text"
                              value={p.serviceName}
                              onChange={(e) => handleParameterChange('serviceName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Type</label>
                            <select
                              value={p.serviceType}
                              onChange={(e) => handleParameterChange('serviceType', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none cursor-pointer"
                            >
                              <option value="ClusterIP">ClusterIP</option>
                              <option value="NodePort">NodePort</option>
                              <option value="LoadBalancer">LoadBalancer</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">External Port</label>
                              <input
                                type="number"
                                value={p.port}
                                onChange={(e) => handleParameterChange('port', parseInt(e.target.value) || 80)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Target Port</label>
                              <input
                                type="number"
                                value={p.targetPort}
                                onChange={(e) => handleParameterChange('targetPort', parseInt(e.target.value) || 80)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('k8s_configmap') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">ConfigMap Name</label>
                            <input
                              type="text"
                              value={p.configMapName}
                              onChange={(e) => handleParameterChange('configMapName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Data Key</label>
                              <input
                                type="text"
                                value={p.dataKey}
                                onChange={(e) => handleParameterChange('dataKey', e.target.value)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Data Value</label>
                              <input
                                type="text"
                                value={p.dataValue}
                                onChange={(e) => handleParameterChange('dataValue', e.target.value)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('k8s_secret') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Secret Name</label>
                            <input
                              type="text"
                              value={p.secretName}
                              onChange={(e) => handleParameterChange('secretName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Secret Key</label>
                              <input
                                type="text"
                                value={p.secretKey}
                                onChange={(e) => handleParameterChange('secretKey', e.target.value)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Secret Value</label>
                              <input
                                type="password"
                                value={p.secretValue}
                                onChange={(e) => handleParameterChange('secretValue', e.target.value)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('k8s_ingress') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Ingress Name</label>
                            <input
                              type="text"
                              value={p.ingressName}
                              onChange={(e) => handleParameterChange('ingressName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Routing Host Rule</label>
                            <input
                              type="text"
                              value={p.host}
                              onChange={(e) => handleParameterChange('host', e.target.value)}
                              placeholder="app.local"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Path</label>
                              <input
                                type="text"
                                value={p.path}
                                onChange={(e) => handleParameterChange('path', e.target.value)}
                                placeholder="/"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Target Service Port</label>
                              <input
                                type="number"
                                value={p.servicePort}
                                onChange={(e) => handleParameterChange('servicePort', parseInt(e.target.value) || 80)}
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Target K8s Service</label>
                            <input
                              type="text"
                              value={p.serviceName}
                              onChange={(e) => handleParameterChange('serviceName', e.target.value)}
                              placeholder="app-service"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {selectedNode.id.startsWith('k8s_pvc') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Volume Claim Name</label>
                            <input
                              type="text"
                              value={p.pvcName}
                              onChange={(e) => handleParameterChange('pvcName', e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Storage Request</label>
                              <input
                                type="text"
                                value={p.storageSize}
                                onChange={(e) => handleParameterChange('storageSize', e.target.value)}
                                placeholder="10Gi"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Storage Class</label>
                              <input
                                type="text"
                                value={p.storageClass}
                                onChange={(e) => handleParameterChange('storageClass', e.target.value)}
                                placeholder="standard"
                                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. STATIC / MOCK NODES */}
                  {selectedNode.data.tech !== 'Ansible' && selectedNode.data.tech !== 'Source' && selectedNode.data.tech !== 'Target' && selectedNode.data.tech !== 'Kubernetes' && !selectedNode.id.startsWith('aws_instance.web_server') && !selectedNode.id.startsWith('aws_security_group') && !selectedNode.id.startsWith('aws_s3_bucket') && !selectedNode.id.startsWith('aws_db_instance') && !selectedNode.id.startsWith('aws_vpc') && !selectedNode.id.startsWith('aws_subnet') && (
                    <div className="text-center py-6 text-muted-foreground text-xs select-none">
                      No custom parameters defined for this mock infrastructure block.
                    </div>
                  )}
                </fieldset>
              )
            ) : (
              <LiveCodePreview selectedNode={selectedNode} nodes={nodes} edges={edges} />
            )}
          </div>
        </div>
      </div>

      {/* Collapse Trigger Button */}
      <button
        onClick={onToggle}
        className="absolute -left-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md hover:shadow-primary/10 transition-all z-30 cursor-pointer"
        title="Toggle Inspector Panel"
      >
        <Icon icon={collapsed ? "lucide:arrow-left" : "lucide:arrow-right"} className="text-xs" />
      </button>
    </aside>
  );
};

// --- DEFAULT PARAMETERS FOR NODES ---
function getDefaultParametersForNode(nodeId: string): Record<string, unknown> {
  if (nodeId.startsWith('aws_instance.web_server')) {
    return {
      instanceName: 'web_server',
      amiId: 'ami-785db401',
      instanceType: 't3.medium',
      subnetId: 'subnet-0123456789abcdef0',
      securityGroupId: '',
      rootVolumeSize: 50,
      tags: [
        { key: 'Environment', value: 'prod' },
        { key: 'Role', value: 'web' }
      ]
    };
  }
  if (nodeId.startsWith('aws_security_group')) {
    return {
      sgName: 'web_sg',
      vpcId: '',
      description: 'Allows HTTP/HTTPS inbound & SSH access',
      ingressPorts: '80, 443, 22'
    };
  }
  if (nodeId.startsWith('aws_s3_bucket')) {
    return {
      bucketName: 'infracanvas-user-bucket',
      forceDestroy: true,
      versioningEnabled: true
    };
  }
  if (nodeId.startsWith('aws_db_instance')) {
    return {
      dbName: 'appdb',
      allocatedStorage: 20,
      instanceClass: 'db.t3.micro',
      username: 'dbadmin',
      password: 'SuperSecurePassword123!',
      engineVersion: '14.1',
      vpcSecurityGroupIds: '',
      dbSubnetGroupName: ''
    };
  }
  if (nodeId.startsWith('aws_vpc')) {
    return {
      vpcName: 'app_vpc',
      cidrBlock: '10.0.0.0/16',
      enableDnsHostnames: true
    };
  }
  if (nodeId.startsWith('aws_subnet')) {
    return {
      subnetName: 'app_subnet_1a',
      vpcId: 'aws_vpc.app_vpc.id',
      cidrBlock: '10.0.1.0/24',
      availabilityZone: 'us-east-1a',
      mapPublicIp: true
    };
  }
  // Ansible Nodes
  if (nodeId.startsWith('apt_install')) {
    return {
      packages: 'curl, git, jq',
      state: 'present',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('create_user')) {
    return {
      username: 'deployer',
      shell: '/bin/bash',
      createHome: true,
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('systemd_service')) {
    return {
      serviceName: 'nginx',
      state: 'started',
      enabled: true,
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('git_clone')) {
    return {
      repoUrl: 'https://github.com/infracanvas/sample-app.git',
      destPath: '/var/www/app',
      branch: 'main',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('shell_command')) {
    return {
      command: 'echo "hello infrastructure"',
      chdir: '/tmp',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('file_copy')) {
    return {
      srcPath: 'config.json',
      destPath: '/var/www/app/config.json',
      owner: 'www-data',
      mode: '0644',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('open-port')) {
    return {
      port: '80',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('postgresql')) {
    return {
      dbUser: 'postgres',
      dbPass: 'postgres',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('deploy-node-app')) {
    return {
      startCommand: 'npm start',
      appPort: '3000',
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('update-packages')) {
    return {
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('nginx')) {
    return {
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('nodejs')) {
    return {
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  if (nodeId.startsWith('copy-env')) {
    return {
      ansibleHost: '',
      ansibleUser: 'ubuntu'
    };
  }
  // Kubernetes Nodes
  if (nodeId.startsWith('k8s_deployment')) {
    return {
      deploymentName: 'app-deploy',
      replicas: 3,
      imageName: 'nginx:1.21',
      containerPort: 80,
      cpuLimit: '500m',
      memoryLimit: '512Mi'
    };
  }
  if (nodeId.startsWith('k8s_service')) {
    return {
      serviceName: 'app-service',
      serviceType: 'ClusterIP',
      port: 80,
      targetPort: 80
    };
  }
  if (nodeId.startsWith('k8s_configmap')) {
    return {
      configMapName: 'app-config',
      dataKey: 'APP_ENV',
      dataValue: 'production'
    };
  }
  if (nodeId.startsWith('k8s_secret')) {
    return {
      secretName: 'app-secret',
      secretKey: 'DB_PASSWORD',
      secretValue: 'SecretString123'
    };
  }
  if (nodeId.startsWith('k8s_ingress')) {
    return {
      ingressName: 'app-ingress',
      host: 'app.local',
      path: '/',
      serviceName: 'app-service',
      servicePort: 80
    };
  }
  if (nodeId.startsWith('k8s_pvc')) {
    return {
      pvcName: 'app-pvc',
      storageSize: '10Gi',
      storageClass: 'standard'
    };
  }
  return {};
}

// --- MOCK LIBRARY DATA ---
const LIBRARY_NODES: LibraryNode[] = [
  {
    id: 'aws_target',
    tech: 'Target',
    icon: 'lucide:cloud',
    title: 'AWS Target',
    description: 'Chooses where this pipeline deploys — LocalStack sandbox for testing, real AWS later.',
    category: 'Cloud Target'
  },
  {
    id: 'gcp_target',
    tech: 'Target',
    icon: 'lucide:cloud',
    title: 'GCP Target',
    description: 'Chooses where this pipeline deploys — Live GCP Project.',
    category: 'Cloud Target'
  },
  // Terraform Nodes
  {
    id: 'aws_instance.web_server',
    tech: 'Terraform',
    icon: 'lucide:server',
    title: 'Virtual Machine (EC2)',
    description: 'Provisions a high-performance VM instance with security groups.',
    category: 'Provisioning & Cloud',
    outputs: ['public_ip', 'private_ip', 'id', 'ssh_user']
  },
  {
    id: 'aws_security_group',
    tech: 'Terraform',
    icon: 'lucide:shield',
    title: 'Firewall (Security Group)',
    description: 'Configures stateful firewall rules to allow traffic.',
    category: 'Provisioning & Cloud',
    outputs: ['sg_id', 'sg_name']
  },
  {
    id: 'aws_s3_bucket',
    tech: 'Terraform',
    icon: 'lucide:hard-drive',
    title: 'Object Storage (S3)',
    description: 'Provisions a secure cloud object storage bucket.',
    category: 'Provisioning & Cloud',
    outputs: ['bucket_name', 'bucket_arn']
  },
  {
    id: 'aws_db_instance',
    tech: 'Terraform',
    icon: 'lucide:database',
    title: 'Relational Database (RDS)',
    description: 'Deploys a PostgreSQL database instance.',
    category: 'Provisioning & Cloud',
    outputs: ['endpoint', 'port', 'db_name', 'username']
  },
  {
    id: 'aws_vpc',
    tech: 'Terraform',
    icon: 'lucide:network',
    title: 'Virtual Network (VPC)',
    description: 'Creates a custom virtual private cloud network.',
    category: 'Provisioning & Cloud',
    outputs: ['vpc_id', 'cidr_block']
  },
  {
    id: 'aws_subnet',
    tech: 'Terraform',
    icon: 'lucide:split',
    title: 'Network Subnet',
    description: 'Allocates a specific subnet in a VPC.',
    category: 'Provisioning & Cloud',
    outputs: ['subnet_id', 'availability_zone']
  },
  // Ansible Nodes
  {
    id: 'update-packages',
    tech: 'Ansible',
    icon: 'lucide:refresh-cw',
    title: 'Update Packages',
    description: 'Updates package repositories and upgrades system modules.',
    category: 'Configuration & Setup'
  },
  {
    id: 'nginx',
    tech: 'Ansible',
    icon: 'lucide:globe',
    title: 'Install Nginx',
    description: 'Installs and configures the latest stable Nginx web server.',
    category: 'Configuration & Setup'
  },
  {
    id: 'nodejs',
    tech: 'Ansible',
    icon: 'lucide:terminal',
    title: 'Install Node.js',
    description: 'Installs Node.js packages and npm environment.',
    category: 'Configuration & Setup'
  },
  {
    id: 'postgresql',
    tech: 'Ansible',
    icon: 'lucide:database',
    title: 'PostgreSQL Database',
    description: 'Installs PostgreSQL database and creates deployment schema.',
    category: 'Configuration & Setup'
  },
  {
    id: 'open-port',
    tech: 'Ansible',
    icon: 'lucide:unlock',
    title: 'Open Port',
    description: 'Opens a selected networking port in local host firewalls.',
    category: 'Configuration & Setup'
  },
  {
    id: 'copy-env',
    tech: 'Ansible',
    icon: 'lucide:file-text',
    title: 'Copy .env File',
    description: 'Synchronizes environment local configurations onto remote hosts.',
    category: 'Configuration & Setup'
  },
  {
    id: 'deploy-node-app',
    tech: 'Ansible',
    icon: 'lucide:rocket',
    title: 'Deploy Node App',
    description: 'Copies the connected repo onto the server, runs npm install, and starts it with pm2.',
    category: 'Configuration & Setup'
  },
  {
    id: 'apt_install',
    tech: 'Ansible',
    icon: 'lucide:package',
    title: 'Install Packages (Apt)',
    description: 'Installs custom system packages using Apt package manager.',
    category: 'Configuration & Setup'
  },
  {
    id: 'create_user',
    tech: 'Ansible',
    icon: 'lucide:user-plus',
    title: 'Create System User',
    description: 'Configures a new Linux user with system access.',
    category: 'Configuration & Setup'
  },
  {
    id: 'systemd_service',
    tech: 'Ansible',
    icon: 'lucide:settings',
    title: 'Systemd Service',
    description: 'Controls background daemon services (Start/Stop/Restart).',
    category: 'Configuration & Setup'
  },
  {
    id: 'git_clone',
    tech: 'Ansible',
    icon: 'lucide:git-pull-request',
    title: 'Git Clone',
    description: 'Clones repository codebases to a custom target directory.',
    category: 'Configuration & Setup'
  },
  {
    id: 'shell_command',
    tech: 'Ansible',
    icon: 'lucide:terminal',
    title: 'Run Command',
    description: 'Executes direct CLI shell commands on target hosts.',
    category: 'Configuration & Setup'
  },
  {
    id: 'file_copy',
    tech: 'Ansible',
    icon: 'lucide:copy',
    title: 'Copy File',
    description: 'Synchronizes specific files with target remote hosts.',
    category: 'Configuration & Setup'
  },
  // Kubernetes Nodes
  {
    id: 'k8s_deployment',
    tech: 'Kubernetes',
    icon: 'lucide:layers',
    title: 'Pod Deployment',
    description: 'Configures a scalable deployment with rolling updates and resource limits.',
    category: 'Container Deployment'
  },
  {
    id: 'k8s_service',
    tech: 'Kubernetes',
    icon: 'lucide:external-link',
    title: 'Service',
    description: 'Exposes pods to network traffic via LoadBalancer or ClusterIP.',
    category: 'Container Deployment'
  },
  {
    id: 'k8s_configmap',
    tech: 'Kubernetes',
    icon: 'lucide:file-code',
    title: 'ConfigMap',
    description: 'Binds non-sensitive key-value environment files to pods.',
    category: 'Container Deployment'
  },
  {
    id: 'k8s_secret',
    tech: 'Kubernetes',
    icon: 'lucide:key-round',
    title: 'Secret',
    description: 'Injects encrypted environment credentials into container contexts.',
    category: 'Container Deployment'
  },
  {
    id: 'k8s_ingress',
    tech: 'Kubernetes',
    icon: 'lucide:route',
    title: 'Ingress',
    description: 'Routes HTTP/HTTPS external traffic to K8s services.',
    category: 'Container Deployment'
  },
  {
    id: 'k8s_pvc',
    tech: 'Kubernetes',
    icon: 'lucide:database',
    title: 'PersistentVolumeClaim',
    description: 'Allocates persistent disk space for stateful pod workloads.',
    category: 'Container Deployment'
  }
];

// --- FLOW EDITOR AREA CANVAS ---
interface WorkspaceCanvasProps {
  deployStatus: string;
  peerCursors: Record<string, { x: number; y: number; name: string; color: string }>;
  handleMouseMove: (e: React.MouseEvent) => void;
}

function WorkspaceCanvas({ deployStatus, peerCursors = {}, handleMouseMove }: WorkspaceCanvasProps) {
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode, 
    selectedNodeId, 
    setSelectedNodeId,
    activeTool,
    saveStatus,
    selectedEdgeId,
    setSelectedEdgeId
  } = useCanvasStore();
  
  const { screenToFlowPosition, fitView } = useReactFlow();

  const isReadOnly = deployStatus === 'PENDING' || deployStatus === 'RUNNING' || saveStatus === 'readonly';

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (isReadOnly) {
      const filtered = changes.filter(c => c.type !== 'remove');
      onNodesChange(filtered);
    } else {
      onNodesChange(changes);
    }
  }, [onNodesChange, isReadOnly]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (isReadOnly) {
      const filtered = changes.filter(c => c.type !== 'remove');
      onEdgesChange(filtered);
    } else {
      onEdgesChange(changes);
    }
  }, [onEdgesChange, isReadOnly]);

  const handleConnect = useCallback((params: Connection) => {
    if (isReadOnly) return;
    onConnect(params);
  }, [onConnect, isReadOnly]);

  const nodeTypes = useMemo(() => ({ customNode: ReactFlowCanvasNode }), []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    if (deployStatus === 'PENDING' || deployStatus === 'RUNNING') {
      alert("⚠️ Canvas is locked: Cannot drop nodes while a pipeline execution is running.");
      return;
    }

    const id = event.dataTransfer.getData('application/reactflow-node-id');
    if (!id) return;

    const tech = event.dataTransfer.getData('application/reactflow-node-tech');
    const icon = event.dataTransfer.getData('application/reactflow-node-icon');
    const title = event.dataTransfer.getData('application/reactflow-node-title');
    const description = event.dataTransfer.getData('application/reactflow-node-description');
    const category = event.dataTransfer.getData('application/reactflow-node-category');

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNodeId = `${id}_${Date.now().toString().slice(-4)}`;

    const isCustom = event.dataTransfer.getData('application/reactflow-node-iscustom') === 'true';
    const rawCode = event.dataTransfer.getData('application/reactflow-node-rawcode');
    const codeType = event.dataTransfer.getData('application/reactflow-node-codetype');
    const parametersStr = event.dataTransfer.getData('application/reactflow-node-parameters');

    const defaultParams = getDefaultParametersForNode(id);
    let parsedParameters = defaultParams;
    if (isCustom && parametersStr) {
      try {
        parsedParameters = JSON.parse(parametersStr);
      } catch (e) {}
    }

    const newNode: Node = {
      id: newNodeId,
      type: 'customNode',
      position,
      data: {
        label: title,
        tech: tech as LibraryNode['tech'],
        icon,
        categoryLabel: category || (tech === 'Terraform' ? 'AWS Resource' : tech === 'Ansible' ? 'Ansible Task' : tech === 'Source' ? 'Source Code' : tech === 'Target' ? 'Cloud Target' : 'K8s Resource'),
        description,
        status: 'Validated',
        statusText: isCustom ? 'Custom Block' : 'Validated',
        parameters: parsedParameters,
        isCustom: isCustom ? true : undefined,
        rawCode: isCustom ? rawCode : undefined,
        codeType: isCustom ? (codeType as LibraryNode['codeType']) : undefined,
        port: parsedParameters?.port,
        dbUser: parsedParameters?.dbUser,
        dbPass: parsedParameters?.dbPass,
        repoUrl: parsedParameters?.repoUrl,
        branch: parsedParameters?.branch,
        startCommand: parsedParameters?.startCommand,
        appPort: parsedParameters?.appPort,
      },
    };

    if (!isCustom) {
      if (id === 'aws_instance.web_server') {
        newNode.data.parameters = { ...DEFAULT_INSTANCE_PARAMS };
      }
      if (id === 'aws_security_group') {
        newNode.data.parameters = { ...DEFAULT_SG_PARAMS };
      }
    }

    addNode(newNode);
    setSelectedNodeId(newNodeId);
  }, [screenToFlowPosition, addNode, setSelectedNodeId, deployStatus]);

  return (
    <div 
      className={clsx(
        "flex-grow h-full relative overflow-hidden",
        activeTool === 'select' && "flow-tool-select",
        activeTool === 'pan' && "flow-tool-pan",
        activeTool === 'link' && "flow-tool-link"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseMove={handleMouseMove}
    >
      {/* Floating Peer Cursors Overlay */}
      {Object.entries(peerCursors).map(([id, cursor]) => (
        <div
          key={id}
          className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <Icon 
            icon="lucide:mouse-pointer-2" 
            className="text-lg rotate-[270deg]" 
            style={{ color: cursor.color }} 
          />
          <div 
            className="absolute left-4 top-4 rounded px-2 py-0.5 text-[10px] font-bold text-white whitespace-nowrap shadow-md select-none"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          setSelectedEdgeId(null);
          setSelectedNodeId(node.id);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedNodeId(null);
          setSelectedEdgeId(edge.id);
        }}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
        fitView
        nodesDraggable={!isReadOnly && activeTool === 'select'}
        nodesConnectable={!isReadOnly && activeTool !== 'pan'}
        elementsSelectable={!isReadOnly && activeTool !== 'pan'}
        panOnDrag={activeTool === 'pan' ? true : [1, 2]}
        selectionOnDrag={activeTool === 'select'}
        deleteKeyCode={isReadOnly ? null : ['Backspace', 'Delete']}
      >
        <Background color="#232A3D" gap={24} size={1} />
        <Controls showInteractive={false} className="!bg-card !border-border !text-foreground" />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-6 select-none animate-in fade-in zoom-in duration-300">
          <div className="max-w-md w-full bg-card/80 border border-border backdrop-blur-md rounded-2xl p-6 text-center shadow-2xl flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Icon icon="lucide:layers" className="text-white text-2xl animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Design Your Infrastructure Canvas</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Drag and drop cloud resources or configuration modules from the library panel on the left to begin provisioning (Terraform), configuring (Ansible), or deploying containers (Kubernetes).
              </p>
            </div>
            <div className="flex items-center gap-6 mt-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><Icon icon="lucide:code" className="text-primary text-xs" /> Terraform</span>
              <span className="flex items-center gap-1.5"><Icon icon="lucide:zap" className="text-[#8B5CF6] text-xs" /> Ansible</span>
              <span className="flex items-center gap-1.5"><Icon icon="lucide:layers" className="text-[#0EA5E9] text-xs" /> Kubernetes</span>
            </div>
          </div>
        </div>
      )}

      {/* SVG linear gradients definitions for connections */}
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
    </div>
  );
}

// --- WORKSPACE LAYOUT WRAPPER ---
function WorkspaceContent() {
  const router = useRouter();
  const { 
    nodes, 
    edges, 
    selectedNodeId, 
    updateNodeData, 
    resetCanvas, 
    setSelectedNodeId, 
    activeTool, 
    setActiveTool,
    saveStatus,
    setSaveStatus,
    version,
    setVersion,
    setNodes,
    setEdges,
    setCustomLibraryNodes,
    setProjectId,
    selectedEdgeId,
    setSelectedEdgeId,
    updateEdgeData,
    deleteEdge
  } = useCanvasStore();
  const { zoomIn, zoomOut, setViewport, getZoom } = useReactFlow();

  const searchParams = useSearchParams();
  const hasProjectParam = !!searchParams.get('project');
  const projectId = searchParams.get('project') || 'Web-Server-Orchestration';
  const selectedProject = projectId; // compatibility alias

  // Bare /workspace with no project selected is a dead end (all real workspaces
  // are opened via /workspace?project=<id>) — send the user to create one instead.
  useEffect(() => {
    if (!hasProjectParam) {
      router.replace('/dashboard?create=1');
    }
  }, [hasProjectParam, router]);

  const { token, user, hasHydrated } = useAuthStore();

  const syncWsRef = useRef<WebSocket | null>(null);
  const isIncomingSyncRef = useRef<boolean>(false);
  const lastStateRef = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

  const [collaborators, setCollaborators] = useState<{ id: string; name: string; color: string }[]>([]);
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const [peerCursors, setPeerCursors] = useState<Record<string, { x: number; y: number; name: string; color: string }>>({});
  const [peerEdits, setPeerEdits] = useState<Record<string, string>>({}); // maps nodeId -> userName editing it
  const [projectDetails, setProjectDetails] = useState<Project | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCustomNodeOpen, setIsCustomNodeOpen] = useState(false);
  const [availableCredentials, setAvailableCredentials] = useState<Credential[]>([]);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<{ gated: boolean; has_active_agent: boolean; grace_period_end: string } | null>(null);

  const [selectedOS, setSelectedOS] = useState("Linux");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [techFilter, setTechFilter] = useState("All");
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("Parameters");

  const [deployStatus, setDeployStatus] = useState<"IDLE" | "PENDING" | "RUNNING" | "CLEANUP" | "SUCCESS" | "FAILED">("IDLE");
  const [logs, setLogs] = useState("");
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [autoDestroy, setAutoDestroy] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Authenticate session and protect workspace routes
  useEffect(() => {
    if (hasHydrated && !token) {
      router.push('/login');
    }
  }, [hasHydrated, token, router]);

  // Connect to WebSocket Room Syncing
  useEffect(() => {
    const activeToken = token;
    if (!activeToken || !projectId || !user) return;

    const apiHost = process.env.NEXT_PUBLIC_API_URL 
      ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws') 
      : 'ws://localhost:8080';
    const wsUrl = `${apiHost}/api/workspace/${projectId}/sync?token=${activeToken}`;

    const ws = new WebSocket(wsUrl);
    syncWsRef.current = ws;

    ws.onopen = () => {
      setIsSyncConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, senderId, senderName, color, payload } = msg;

        if (type === 'init' || type === 'join' || type === 'leave') {
          const members = payload ? JSON.parse(JSON.stringify(payload)) : [];
          if (Array.isArray(members)) {
            const activePeers = members.filter(m => m.id !== user.id);
            // Deduplicate by user ID to show each peer only once
            const uniquePeers = activePeers.filter((value, index, self) =>
              self.findIndex(m => m.id === value.id) === index
            );
            setCollaborators(uniquePeers);
          }
          if (type === 'leave') {
            setPeerCursors(prev => {
              const copy = { ...prev };
              delete copy[senderId];
              return copy;
            });
          }

          if (type === 'init' && Array.isArray(members)) {
            const activePeers = members.filter(m => m.id !== user.id);
            if (activePeers.length > 0) {
              ws.send(JSON.stringify({ type: 'request_sync' }));
            }
          }
        } else if (type === 'request_sync') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'change',
              payload: {
                nodes: useCanvasStore.getState().nodes,
                edges: useCanvasStore.getState().edges
              }
            }));
          }
        } else if (type === 'cursor') {
          setPeerCursors(prev => ({
            ...prev,
            [senderId]: { x: payload.x, y: payload.y, name: senderName, color }
          }));
        } else if (type === 'edit') {
          const { nodeId, isEditing } = payload;
          setPeerEdits(prev => {
            const copy = { ...prev };
            if (isEditing) {
              copy[nodeId] = senderName;
            } else {
              delete copy[nodeId];
            }
            return copy;
          });
        } else if (type === 'change') {
          const { nodes: peerNodes, edges: peerEdges } = payload;
          isIncomingSyncRef.current = true;
          if (peerNodes) useCanvasStore.getState().setNodes(peerNodes);
          if (peerEdges) useCanvasStore.getState().setEdges(peerEdges);
        }
      } catch (err) {
        console.warn('Error handling WebSocket sync message', err);
      }
    };

    ws.onclose = () => {
      setIsSyncConnected(false);
      setCollaborators([]);
      setPeerCursors({});
    };

    return () => {
      ws.close();
    };
  }, [projectId, user, token]);

  // Load Project Details & Canvas State on mount
  useEffect(() => {
    const activeToken = token;
    if (!activeToken || !projectId || !user) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    const loadProjectAndCanvas = async () => {
      try {
        // 1. Get project details and role
        const projRes = await fetch(`${API_URL}/api/projects/${projectId}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (!projRes.ok) {
          setSaveStatus('readonly');
          return;
        }
        const projDetails = await projRes.json();
        setProjectDetails(projDetails);
        if (projDetails.user_role === 'VIEWER') {
          setSaveStatus('readonly');
        } else {
          setSaveStatus('saved');
        }

        // 2. Fetch canvas state
        const canvasRes = await fetch(`${API_URL}/api/projects/${projectId}/canvas`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (canvasRes.ok) {
          const state = await canvasRes.json();
          
          isIncomingSyncRef.current = true;
          const parsedNodes = JSON.parse(state.nodes_json || '[]');
          const parsedEdges = JSON.parse(state.edges_json || '[]');
          
          setNodes(parsedNodes);
          setEdges(parsedEdges);
          setVersion(state.version || 1);
          setProjectId(projectId);

          // Restore viewport
          const viewport = JSON.parse(state.viewport_json || '{"x":0,"y":0,"zoom":1}');
          setViewport({ x: viewport.x || 0, y: viewport.y || 0, zoom: viewport.zoom || 1 }, { duration: 400 });
        }

        // 3. Fetch custom nodes templates
        const customRes = await fetch(`${API_URL}/api/projects/${projectId}/custom-nodes`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (customRes.ok) {
          const customNodes = await customRes.json();
          setCustomLibraryNodes(customNodes || []);
        }

        // 4. Fetch cloud credentials
        const credsRes = await fetch(`${API_URL}/api/projects/${projectId}/credentials`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (credsRes.ok) {
          const creds = await credsRes.json();
          setAvailableCredentials(creds || []);
        }
      } catch (err) {
        console.warn("Failed to load project canvas data", err);
      }
    };

    loadProjectAndCanvas();
  }, [projectId, user, setViewport, setNodes, setEdges, setVersion, setSaveStatus, setCustomLibraryNodes, setProjectId, token]);

  // Poll the paired Sandbox Agent's connection status (see
  // obsidian_memory/08.4's Phase 2 heartbeat/daemon-install entries) so a
  // disconnected agent is visible in the header instead of only discovered
  // via a failed deploy. Polling, not a WebSocket push: the underlying
  // disconnect detection itself already has a ~30-40s natural delay (yamux's
  // keepalive), so a live push wouldn't buy more responsiveness than an
  // interval this size. 404 (route not registered when the beta flag is off,
  // or no agent ever paired for this project) means "hide the badge," not an
  // error; any other failure leaves the previous value alone rather than
  // flickering the badge away on a transient network blip.
  useEffect(() => {
    const activeToken = token;
    if (!activeToken || !projectId || !user) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    let cancelled = false;

    const pollAgentStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/agents/latest`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (cancelled) return;
        if (res.status === 404) {
          setAgentStatus(null);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setAgentStatus(data.status ?? null);
      } catch (err) {
        // Transient network error — leave the previous badge state as-is.
        console.log("Agent status poll error", err);
      }
    };

    pollAgentStatus();
    const intervalId = setInterval(pollAgentStatus, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [projectId, user, token]);

  // Polls Phase 3's default-flip migration status (obsidian_memory/08.4) so a
  // FREE-plan user sees the "pair an agent or upgrade" notice before a deploy
  // ever gets rejected for it. 404 means "nothing to show" — not on the FREE
  // plan, or the default-flip isn't configured on this deployment at all —
  // same badge-hiding convention as the agent-status poll above.
  useEffect(() => {
    const activeToken = token;
    if (!activeToken || !projectId || !user) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    let cancelled = false;

    const pollMigrationStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/sandbox-migration-status`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (cancelled) return;
        if (res.status === 404) {
          setMigrationStatus(null);
          return;
        }
        if (!res.ok) return;
        setMigrationStatus(await res.json());
      } catch (err) {
        // Transient network error — leave the previous badge state as-is.
        console.log("Migration status poll error", err);
      }
    };

    pollMigrationStatus();
    const intervalId = setInterval(pollMigrationStatus, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [projectId, user, token]);

  // Broadcast local canvas state changes to room peers AND auto-save debouncely to REST API
  useEffect(() => {
    if (isIncomingSyncRef.current) {
      isIncomingSyncRef.current = false;
      lastStateRef.current = { nodes, edges };
      return;
    }

    if (JSON.stringify(nodes) === JSON.stringify(lastStateRef.current.nodes) &&
        JSON.stringify(edges) === JSON.stringify(lastStateRef.current.edges)) {
      return;
    }

    // 1. Broadcast real-time sync event to peers
    if (syncWsRef.current && syncWsRef.current.readyState === WebSocket.OPEN) {
      syncWsRef.current.send(JSON.stringify({
        type: 'change',
        payload: { nodes, edges }
      }));
    }

    lastStateRef.current = { nodes, edges };

    // 2. Debounced Database Auto-Save
    if (saveStatus === 'readonly') return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const activeToken = token;
      if (!activeToken || !projectId) return;

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
        
        // Fetch current zoom/pan coordinates for the viewport JSON
        const zoom = getZoom();
        const pane = document.querySelector('.react-flow__renderer') as HTMLElement;
        const transform = pane?.style.transform || '';
        const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        const x = match ? parseFloat(match[1]) : 0;
        const y = match ? parseFloat(match[2]) : 0;

        const res = await fetch(`${API_URL}/api/projects/${projectId}/canvas`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({
            nodes_json: JSON.stringify(nodes),
            edges_json: JSON.stringify(edges),
            viewport_json: JSON.stringify({ x, y, zoom }),
            version: version
          })
        });

        if (res.ok) {
          const result = await res.json();
          setVersion(result.version);
          setSaveStatus('saved');
        } else if (res.status === 409) {
          setSaveStatus('error');
          console.warn("Version mismatch conflict on auto-save.");
        } else {
          setSaveStatus('error');
        }
      } catch (err) {
        console.warn("Auto-save call error", err);
        setSaveStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [nodes, edges, projectId, version, saveStatus, getZoom, setSaveStatus, setVersion, token]);

  // Track cursor positions on mousemove (throttled)
  const lastCursorTimeRef = useRef<number>(0);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!syncWsRef.current || syncWsRef.current.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastCursorTimeRef.current < 60) return; // 60ms throttle
    lastCursorTimeRef.current = now;

    const container = document.querySelector('.react-flow__pane');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    syncWsRef.current.send(JSON.stringify({
      type: 'cursor',
      payload: { x, y }
    }));
  }, []);

  const handleStartEditing = useCallback((nodeId: string) => {
    if (syncWsRef.current && syncWsRef.current.readyState === WebSocket.OPEN) {
      syncWsRef.current.send(JSON.stringify({
        type: 'edit',
        payload: { nodeId, isEditing: true }
      }));
    }
  }, []);

  const handleEndEditing = useCallback((nodeId: string) => {
    if (syncWsRef.current && syncWsRef.current.readyState === WebSocket.OPEN) {
      syncWsRef.current.send(JSON.stringify({
        type: 'edit',
        payload: { nodeId, isEditing: false }
      }));
    }
  }, []);

  // Auto-scroll terminal when logs change
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Clean up websocket connection on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Sync execution status to the canvas store
  useEffect(() => {
    const isExecuting = deployStatus === 'PENDING' || deployStatus === 'RUNNING';
    useCanvasStore.getState().setIsExecuting(isExecuting);
  }, [deployStatus]);

  const handleDeployClick = async () => {
    if (nodes.length === 0) {
      alert("⚠️ Cannot deploy: Canvas is empty.");
      return;
    }

    setDeployStatus("PENDING");
    setLogs("[CLIENT] Compiling canvas files and preparing payload...\n");
    setIsTerminalOpen(true);
    setActiveRunId(null);
    useCanvasStore.getState().resetExecutionStatuses();
    useCanvasStore.getState().setPipelineAction('deploy');

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      // Compile files on the client side (Approach A)
      const compiledFiles = generateBundleFiles(nodes, edges);

      // Make post request to Go backend
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const activeToken = token;
      const response = await fetch(`${API_URL}/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          canvas: { nodes, edges },
          files: compiledFiles.map(f => ({ path: f.path, content: f.content })),
          autoDestroy: autoDestroy
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to deploy. HTTP status: ${response.status}`);
      }

      const data = await response.json();
      const runId = data.runId;
      setActiveRunId(runId);
      setDeployStatus(data.status);
      setLogs(prev => prev + `[CLIENT] Deployment registered with runID: ${runId}\n[CLIENT] Establishing log streaming WebSocket connection...\n`);

      // Connect to WebSocket endpoint
      const wsUrl = `ws://localhost:8080/api/ws/runs/${runId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setLogs(prev => prev + "[CLIENT] WebSocket connection established. Streaming pipeline runner logs...\n");
      };

      ws.onmessage = (event) => {
        try {
          const wsData = JSON.parse(event.data);
          if (wsData.type === "status_change") {
            setDeployStatus(wsData.status);
          } else if (wsData.type === "log") {
            setLogs(prev => prev + wsData.message);
          } else if (wsData.type === "node_status") {
            useCanvasStore.getState().setNodeExecutionStatus(wsData.nodeId, wsData.status);
          }
        } catch (e) {
          // Fallback if message is raw text
          setLogs(prev => prev + event.data + '\n' + e);
        }
      };

      ws.onerror = (err) => {
        setLogs(prev => prev + `\n[CLIENT] WebSocket encountered an error.\n`);
        console.warn("WS error:", err);
      };

      ws.onclose = (event) => {
        setLogs(prev => prev + `\n[CLIENT] Log stream closed (code: ${event.code}).\n`);
      };

    } catch (err: unknown) {
      setDeployStatus("FAILED");
      const errMessage = err instanceof Error ? err.message : String(err);
      setLogs(prev => prev + `\n[CLIENT_ERROR] Failed to execute deployment: ${errMessage}\n`);
    }
  };

  const handleDestroyClick = async () => {
    setDeployStatus("PENDING");
    setLogs("[CLIENT] Triggering infrastructure tear-down (terraform destroy)...\n");
    setIsTerminalOpen(true);
    setActiveRunId(null);
    useCanvasStore.getState().resetExecutionStatuses();
    useCanvasStore.getState().setPipelineAction('destroy');

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      // Make destroy request to Go backend
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const activeToken = token;
      const response = await fetch(`${API_URL}/api/projects/${projectId}/destroy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          canvas: { nodes, edges }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger destroy. HTTP status: ${response.status}`);
      }

      const data = await response.json();
      const runId = data.runId;
      setActiveRunId(runId);
      setDeployStatus(data.status);
      setLogs(prev => prev + `[CLIENT] Destroy run registered with runID: ${runId}\n[CLIENT] Establishing log streaming WebSocket connection...\n`);

      // Connect to WebSocket endpoint
      const wsUrl = `ws://localhost:8080/api/ws/runs/${runId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setLogs(prev => prev + "[CLIENT] WebSocket connection established. Streaming execution logs...\n");
      };

      ws.onmessage = (event) => {
        try {
          const wsData = JSON.parse(event.data);
          if (wsData.type === "status_change") {
            setDeployStatus(wsData.status);
          } else if (wsData.type === "log") {
            setLogs(prev => prev + wsData.message);
          } else if (wsData.type === "node_status") {
            useCanvasStore.getState().setNodeExecutionStatus(wsData.nodeId, wsData.status);
          }
        } catch (e) {
          setLogs(prev => prev + event.data + '\n' + e);
        }
      };

      ws.onerror = (err) => {
        setLogs(prev => prev + `\n[CLIENT] WebSocket encountered an error.\n`);
        console.warn("WS error:", err);
      };

      ws.onclose = (event) => {
        setLogs(prev => prev + `\n[CLIENT] Log stream closed (code: ${event.code}).\n`);
      };

    } catch (err: unknown) {
      setDeployStatus("FAILED");
      const errMessage = err instanceof Error ? err.message : String(err);
      setLogs(prev => prev + `\n[CLIENT_ERROR] Failed to execute destroy: ${errMessage}\n`);
    }
  };

  // Keep zoom level in header synced with React Flow viewport
  useEffect(() => {
    const checkZoom = setInterval(() => {
      try {
        const currentZoom = getZoom();
        if (currentZoom) {
          setZoomLevel(Math.round(currentZoom * 100));
        }
      } catch (e) {
        console.log("Error fetching zoom level:", e);
      }
    }, 500);

    return () => clearInterval(checkZoom);
  }, [getZoom]);

  const handleOSChange = (os: string) => {
    setSelectedOS(os);
  };

  const handleZoomInClick = () => {
    zoomIn();
  };

  const handleZoomOutClick = () => {
    zoomOut();
  };

  const handleZoomResetClick = () => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
    setZoomLevel(100);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleTechFilterSelect = (tech: string) => {
    setTechFilter(tech);
  };

  const toggleLeftPanel = () => {
    setLeftPanelCollapsed(!leftPanelCollapsed);
  };

  const toggleRightPanel = () => {
    setRightPanelCollapsed(!rightPanelCollapsed);
  };

  const handleInspectorTabChange = (tab: string) => {
    setInspectorTab(tab);
  };

  const handleCanvasToolSelect = (tool: string) => {
    if (deployStatus === 'PENDING' || deployStatus === 'RUNNING') return;
    setActiveTool(tool as 'select' | 'pan' | 'link');
  };

  const handleAddNodeToCanvas = (libNode: LibraryNode) => {
    if (deployStatus === 'PENDING' || deployStatus === 'RUNNING') {
      alert("⚠️ Canvas is locked: Cannot add nodes while a pipeline execution is running.");
      return;
    }
    const newId = `${libNode.id}_${Date.now().toString().slice(-4)}`;
    
    // Position formula to avoid complete overlap
    const position = {
      x: 350 + (nodes.length * 30) % 250,
      y: 150 + (nodes.length * 30) % 250,
    };

    const newNode: Node = {
      id: newId,
      type: 'customNode',
      position,
      data: {
        label: libNode.title,
        tech: libNode.tech,
        icon: libNode.icon,
        categoryLabel: libNode.tech === 'Terraform' ? 'AWS Resource' : libNode.tech === 'Ansible' ? 'Ansible Task' : libNode.tech === 'Source' ? 'Source Code' : libNode.tech === 'Target' ? 'Cloud Target' : 'K8s Resource',
        description: libNode.description,
        status: 'Validated',
        statusText: 'Validated',
      },
    };

    const defaultParams = getDefaultParametersForNode(libNode.id);
    if (defaultParams) {
      newNode.data.parameters = defaultParams;
      // Sync direct property bounds for compatibility
      newNode.data.port = defaultParams.port;
      newNode.data.dbUser = defaultParams.dbUser;
      newNode.data.dbPass = defaultParams.dbPass;
      newNode.data.repoUrl = defaultParams.repoUrl;
      newNode.data.branch = defaultParams.branch;
      newNode.data.startCommand = defaultParams.startCommand;
      newNode.data.appPort = defaultParams.appPort;
    }

    // Call store action
    useCanvasStore.getState().addNode(newNode);
    useCanvasStore.getState().setSelectedNodeId(newId);
  };

  // Compile playbook YAML from current canvas nodes
  const ansiblePlaybook = useMemo(() => generateAnsibleYAML(nodes, edges), [nodes, edges]);

  // Navigate to export-code page
  const handleExportClick = () => {
    router.push(`/export-code?project=${projectId}`);
  };

  const handleResetClick = () => {
    if (deployStatus === 'PENDING' || deployStatus === 'RUNNING') {
      alert("⚠️ Canvas is locked: Cannot reset canvas while a pipeline execution is running.");
      return;
    }
    resetCanvas();
  };

  // Handle specific format downloads
  const handleExportFormat = async (format: string) => {
    if (format === 'zip') {
      await downloadZipBundle(nodes, edges);
    } else if (format === 'yml') {
      const blob = new Blob([ansiblePlaybook], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'playbook.yml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (format === 'tf') {
      await downloadTerraformZip(nodes, edges);
    } else if (format === 'json') {
      const k8sContent = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "web-server" }
      };
      const blob = new Blob([JSON.stringify(k8sContent, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deployment.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    return edges.find(e => e.id === selectedEdgeId) || null;
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    if (selectedEdgeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInspectorTab('Parameters');
    }
  }, [selectedEdgeId]);

  if (!hasProjectParam) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground">
        <Icon icon="lucide:loader-2" className="animate-spin text-2xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <Header
        selectedProject={selectedProject}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomInClick}
        onZoomOut={handleZoomOutClick}
        onZoomReset={handleZoomResetClick}
        onExport={handleExportClick}
        onExportFormat={handleExportFormat}
        onDeploy={handleDeployClick}
        deployStatus={deployStatus}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        autoDestroy={autoDestroy}
        onAutoDestroyChange={setAutoDestroy}
        onDestroy={handleDestroyClick}
        collaborators={collaborators}
        isSyncConnected={isSyncConnected}
        saveStatus={saveStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        projectDetails={projectDetails}
        agentStatus={agentStatus}
        migrationStatus={migrationStatus}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <LibraryPanel
          collapsed={leftPanelCollapsed}
          onToggle={toggleLeftPanel}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          techFilter={techFilter}
          onTechFilterSelect={handleTechFilterSelect}
          libraryNodes={LIBRARY_NODES}
          onAddNode={handleAddNodeToCanvas}
          isReadOnly={deployStatus === 'PENDING' || deployStatus === 'RUNNING' || saveStatus === 'readonly'}
          selectedOS={selectedOS}
          onOSChange={handleOSChange}
          onCreateCustomNode={() => setIsCustomNodeOpen(true)}
        />

        <main className="flex-1 bg-background relative overflow-hidden flex flex-col">
          <WorkspaceCanvas 
            deployStatus={deployStatus} 
            peerCursors={peerCursors}
            handleMouseMove={handleMouseMove}
          />

          <CanvasControls
            activeTool={activeTool}
            onToolSelect={handleCanvasToolSelect}
            onReset={handleResetClick}
            isReadOnly={deployStatus === 'PENDING' || deployStatus === 'RUNNING' || saveStatus === 'readonly'}
          />

          {/* Terminal Drawer */}
          {isTerminalOpen && (
            <div className="absolute bottom-0 left-0 w-full h-72 bg-background/95 border-t border-border z-30 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
              {/* Terminal Header */}
              <div className="h-10 px-4 border-b border-border bg-card/90 flex items-center justify-between select-none">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon icon="lucide:terminal" className="text-primary text-xs" />
                    Runner Output Log
                  </span>
                  {deployStatus !== 'IDLE' && (
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-[9px] uppercase tracking-wide font-bold border",
                      deployStatus === 'PENDING' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                      deployStatus === 'RUNNING' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                      deployStatus === 'CLEANUP' && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                      deployStatus === 'SUCCESS' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                      deployStatus === 'FAILED' && "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    )}>
                      {deployStatus === 'CLEANUP' ? 'CLEANING UP' : deployStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setLogs("")}
                    className="text-[10px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 cursor-pointer"
                    title="Clear Log"
                  >
                    <Icon icon="lucide:trash-2" className="text-xs" />
                    Clear
                  </button>
                  <button
                    onClick={() => setIsTerminalOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-all cursor-pointer"
                    title="Close Panel"
                  >
                    <Icon icon="lucide:x" className="text-xs" />
                  </button>
                </div>
              </div>

              {/* Terminal Body */}
              <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-y-auto select-text scrollbar-thin">
                <pre className="whitespace-pre-wrap break-all pr-4">
                  {logs || "No active pipeline logs. Press \"Deploy\" to run visual orchestration..."}
                </pre>
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </main>

        <InspectorPanel
          collapsed={rightPanelCollapsed}
          onToggle={toggleRightPanel}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          activeTab={inspectorTab}
          onTabChange={handleInspectorTabChange}
          updateNodeData={updateNodeData}
          updateEdgeData={updateEdgeData}
          deleteEdge={deleteEdge}
          ansiblePlaybook={ansiblePlaybook}
          nodes={nodes}
          edges={edges}
          setSelectedNodeId={setSelectedNodeId}
          isReadOnly={deployStatus === 'PENDING' || deployStatus === 'RUNNING' || saveStatus === 'readonly'}
          onStartEditing={handleStartEditing}
          onEndEditing={handleEndEditing}
          availableCredentials={availableCredentials}
        />
      </div>

      <ProjectSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        projectDetails={projectDetails as Project}
        onUpdateProjectDetails={(updated) => setProjectDetails(updated)}
        projectId={projectId}
        onCredentialsChange={setAvailableCredentials}
      />

      <CustomNodeModal
        isOpen={isCustomNodeOpen}
        onClose={() => setIsCustomNodeOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col relative font-sans overflow-hidden">
      <ReactFlowProvider>
        <Suspense fallback={
          <div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
            <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
          </div>
        }>
          <WorkspaceContent />
        </Suspense>
      </ReactFlowProvider>
    </div>
  );
}
