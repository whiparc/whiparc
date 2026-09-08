'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { Navbar } from '../../components/Navbar';
import { useAuthStore } from '../../store/useAuthStore';
import { heroDisplayFont } from '../../fonts';
import type { Template } from '../../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();

  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/templates/${params.id}`);
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
  }, [params.id]);

  const resourceCounts = useMemo(() => {
    if (!template) return { nodes: 0, edges: 0 };
    try {
      const nodes = JSON.parse(template.nodes_json || '[]');
      const edges = JSON.parse(template.edges_json || '[]');
      return { nodes: Array.isArray(nodes) ? nodes.length : 0, edges: Array.isArray(edges) ? edges.length : 0 };
    } catch {
      return { nodes: 0, edges: 0 };
    }
  }, [template]);

  const handleGetStarted = () => {
    if (!hasHydrated) return;
    if (!user) {
      router.push(`/login?redirect=/templates/${params.id}`);
      return;
    }
    // The actual fork-into-a-new-project flow (POST /api/templates/{id}/use)
    // ships in the next phase — see product-memory 10.1 "Phase 3". Signed-in
    // users get an honest "not yet" instead of a button that looks broken.
    setShowComingSoon(true);
  };

  return (
    <div className={`min-h-screen w-full bg-background flex flex-col relative text-slate-100 overflow-x-hidden ${heroDisplayFont.className}`}>
      <div className="pointer-events-none fixed inset-0 bg-dot-pattern opacity-30 z-0" />

      <Navbar />

      <main className="flex flex-1 flex-col relative z-10 mx-auto w-full max-w-4xl px-6 pt-36 pb-24 lg:px-10">
        <Link href="/templates" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition mb-8 w-fit">
          <Icon icon="lucide:arrow-left" className="text-sm" />
          Back to Templates
        </Link>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
            <p className="text-xs">Loading template...</p>
          </div>
        ) : notFound ? (
          <div className="py-20 border border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-secondary/10">
            <Icon icon="lucide:file-question" className="text-3xl text-slate-500 mb-3" />
            <h3 className="font-bold text-white text-sm">Template not found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-normal">
              This template may have been unpublished or the link is incorrect.
            </p>
          </div>
        ) : loadError ? (
          <div className="py-20 border border-dashed border-red-500/20 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-red-500/5">
            <Icon icon="lucide:alert-circle" className="text-2xl text-red-400 mb-2" />
            <p className="text-xs text-red-400">{loadError}</p>
          </div>
        ) : template ? (
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

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Resources</p>
                <p className="text-lg font-bold text-white mt-1">{resourceCounts.nodes}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Connections</p>
                <p className="text-lg font-bold text-white mt-1">{resourceCounts.edges}</p>
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
              <button
                onClick={handleGetStarted}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <span>Get Started</span>
                <Icon icon="lucide:arrow-right" className="text-sm" />
              </button>
              {showComingSoon && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Forking into your workspace is launching very soon — this template will be waiting for you.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
