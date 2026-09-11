'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { Node, Edge } from '@xyflow/react';
import { TemplateCanvasPreview } from './TemplateCanvasPreview';
import { useAuthStore } from '../store/useAuthStore';
import type { Template } from '../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface TemplateDetailContentProps {
  id: string;
  // 'page': the standalone /templates/{id} route — full-height hero sizing.
  // 'modal': rendered inside TemplateModal (the intercepting-route popup
  // opened from the /templates grid) — slightly more compact.
  variant: 'page' | 'modal';
}

// Shared by the standalone /templates/[id] page and the intercepting-route
// modal (app/@modal/(.)templates/[id]) so the fetch/fork logic and the
// actual detail markup exist in exactly one place — see product-memory 10.1
// for why both a real page and a popup need to render the same content.
export function TemplateDetailContent({ id, variant }: TemplateDetailContentProps) {
  const { user, hasHydrated } = useAuthStore();

  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isForking, setIsForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);
  const [showContributeComingSoon, setShowContributeComingSoon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/templates/${id}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data: Template = await res.json();
        if (!cancelled) setTemplate(data);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load this template.';
          setLoadError(msg.includes('fetch') ? 'Cannot connect to the backend server. Please try again shortly.' : msg);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const parsedCanvas = useMemo(() => {
    if (!template) return { nodes: [] as Node[], edges: [] as Edge[], viewport: undefined };
    try {
      const nodes = JSON.parse(template.nodes_json || '[]');
      const edges = JSON.parse(template.edges_json || '[]');
      const viewport = template.viewport_json ? JSON.parse(template.viewport_json) : undefined;
      return {
        nodes: Array.isArray(nodes) ? (nodes as Node[]) : [],
        edges: Array.isArray(edges) ? (edges as Edge[]) : [],
        viewport,
      };
    } catch {
      return { nodes: [] as Node[], edges: [] as Edge[], viewport: undefined };
    }
  }, [template]);

  const handleGetStarted = async () => {
    if (!hasHydrated || isForking) return;
    if (!user) {
      // A hard navigation, not router.push(): when this component is
      // rendered inside the intercepting-route popup (variant="modal"),
      // Next.js's @modal parallel slot does not reset on a client-side
      // push to a route outside the intercepted /templates/* family — the
      // URL changes and /login renders underneath, but the modal's own
      // fixed-position overlay stays mounted on top of it, hiding it
      // entirely. A full navigation forces both the main and @modal slots
      // to resolve fresh for the new URL, which reliably clears the modal.
      // See product-memory 10.1 / 07.2 for the full writeup.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?redirect=/templates/${id}`;
      return;
    }
    setForkError(null);
    setIsForking(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/templates/${id}/use`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data: { project_id: string } = await res.json();
      // Same reasoning as above — hard navigation so the popup can't get
      // stuck on top of the workspace after a signed-in fork.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/workspace?project=${data.project_id}`;
    } catch (err) {
      setIsForking(false);
      const msg = err instanceof Error ? err.message : 'Failed to start a new project from this template.';
      setForkError(msg.includes('fetch') ? 'Cannot connect to the backend server. Please try again shortly.' : msg);
    }
  };

  const previewHeight = variant === 'modal' ? 'h-[320px]' : 'h-[420px]';

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
        <p className="text-xs">Loading template...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="py-20 border border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-secondary/10">
        <Icon icon="lucide:file-question" className="text-3xl text-slate-500 mb-3" />
        <h3 className="font-bold text-white text-sm">Template not found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-normal">
          This template may have been unpublished or the link is incorrect.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-20 border border-dashed border-red-500/20 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-red-500/5">
        <Icon icon="lucide:alert-circle" className="text-2xl text-red-400 mb-2" />
        <p className="text-xs text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 border-b border-border/30 pb-8">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
            {template.category}
          </span>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Icon icon="lucide:download" className="text-xs" />
            <span className="text-xs font-medium">{template.install_count} uses</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{template.title}</h1>

        <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
          {template.description || 'No description provided.'}
        </p>

        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-slate-400 bg-card border border-border/80 rounded-md px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Icon icon="lucide:git-branch" className="text-primary text-sm" />
            Canvas Preview
          </h2>
          <span className="text-[10px] text-slate-500">Scroll to zoom · Drag to pan · Read-only</span>
        </div>
        <div className={`${previewHeight} w-full rounded-3xl border border-border bg-secondary/10 overflow-hidden`}>
          <TemplateCanvasPreview nodes={parsedCanvas.nodes} edges={parsedCanvas.edges} viewport={parsedCanvas.viewport} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Resources</p>
          <p className="text-lg font-bold text-white mt-1">{parsedCanvas.nodes.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Connections</p>
          <p className="text-lg font-bold text-white mt-1">{parsedCanvas.edges.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Author</p>
          <p className="text-sm font-bold text-white mt-1.5 truncate">{template.author_name || 'Whiparc Official'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Published</p>
          <p className="text-sm font-bold text-white mt-1.5">
            {new Date(template.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-secondary/20 p-8 flex flex-col items-center text-center gap-4">
        <Icon icon="lucide:rocket" className="text-3xl text-primary" />
        <div>
          <h3 className="text-lg font-bold text-white">Ready to build on this template?</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md">
            {hasHydrated && user
              ? 'Fork this canvas into a new project in your own workspace.'
              : 'Sign in to fork this canvas into a new project in your own workspace.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleGetStarted}
            disabled={isForking}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
          >
            {isForking ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin text-sm" />
                <span>Setting up your project...</span>
              </>
            ) : (
              <>
                <span>Get Started</span>
                <Icon icon="lucide:arrow-right" className="text-sm" />
              </>
            )}
          </button>

          {/* Lets a developer fine-tune this template's nodes/config and
              submit changes back — planned as its own future phase after
              Publish (Phase 5) ships, not built yet. Shown now (matching
              the product wireframe) as an honest "coming soon" rather than
              hidden, same treatment "Get Started" got before Phase 3
              existed. See product-memory 10.1's roadmap for the plan. */}
          <button
            onClick={() => setShowContributeComingSoon(true)}
            className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-secondary hover:text-white transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Icon icon="lucide:git-pull-request" className="text-sm" />
            <span>Contribute</span>
          </button>
        </div>

        {forkError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{forkError}</p>
        )}
        {showContributeComingSoon && (
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Contributing changes back to a template is launching in a future phase — this template will be open for
            community fine-tuning soon.
          </p>
        )}
      </div>
    </div>
  );
}
