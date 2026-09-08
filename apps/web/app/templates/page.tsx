'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { Navbar } from '../components/Navbar';
import { TiltCard } from '../components/landing/TiltCard';
import { heroDisplayFont } from '../fonts';
import type { Template, TemplateListResponse } from '../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

type SortMode = 'newest' | 'popular';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // The catalog is small enough (seed-scale) to fetch once and filter/sort
  // client-side, matching the dashboard's existing filteredProjects pattern
  // — no debounce or per-keystroke network round trip needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/templates?limit=100`);
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data: TemplateListResponse = await res.json();
        if (!cancelled) setTemplates(data.templates || []);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load templates.';
          setLoadError(msg.includes('fetch') ? 'Cannot connect to the backend server. Please try again shortly.' : msg);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = templates.filter((t) => {
      const matchesCategory = activeCategory === 'All' || t.category === activeCategory;
      const matchesQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
    list = [...list].sort((a, b) =>
      sortMode === 'popular'
        ? b.install_count - a.install_count
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return list;
  }, [templates, searchQuery, activeCategory, sortMode]);

  return (
    <div className={`min-h-screen w-full bg-background flex flex-col relative text-slate-100 overflow-x-hidden ${heroDisplayFont.className}`}>
      <div className="pointer-events-none fixed inset-0 bg-dot-pattern opacity-30 z-0" />

      <Navbar />

      <main className="flex flex-1 flex-col relative z-10 mx-auto w-full max-w-7xl px-6 pt-36 pb-24 lg:px-10">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.06] bg-secondary/40 px-4 py-1.5 text-xs font-medium text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Community &amp; Official Templates
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start from a ready-made infrastructure canvas
          </h1>
          <p className="max-w-2xl text-sm text-slate-400 leading-relaxed">
            Browse infrastructure templates built by the Whiparc team and the community. Preview any of them for free —
            sign in when you&apos;re ready to fork one into your own workspace.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4 border-b border-border/30 pb-6 mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${
                  activeCategory === cat
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-secondary/40 text-slate-400 border border-border hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-card border border-border/80 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
              />
            </div>
            <div className="flex gap-1 bg-secondary/40 p-1 rounded-xl border border-border">
              <button
                onClick={() => setSortMode('newest')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${
                  sortMode === 'newest' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Newest
              </button>
              <button
                onClick={() => setSortMode('popular')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${
                  sortMode === 'popular' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Popular
              </button>
            </div>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
            <p className="text-xs">Loading templates...</p>
          </div>
        ) : loadError ? (
          <div className="py-20 border border-dashed border-red-500/20 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-red-500/5">
            <Icon icon="lucide:alert-circle" className="text-2xl text-red-400 mb-2" />
            <p className="text-xs text-red-400">{loadError}</p>
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="py-20 border border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-secondary/10 select-none">
            <div className="text-3xl mb-3">🗂️</div>
            <h3 className="font-bold text-white text-sm">No templates found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-normal">
              Try a different search term or category.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleTemplates.map((template) => (
              <Link key={template.id} href={`/templates/${template.id}`} className="block">
                <TiltCard
                  tiltLimit={0}
                  scale={1}
                  spotlight
                  className="h-full rounded-[24px] border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/30 hover:shadow-2xl transition-colors duration-300 p-6 flex flex-col justify-between shadow-xl group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {template.category}
                      </span>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Icon icon="lucide:download" className="text-xs" />
                        <span className="text-[10px] font-medium">{template.install_count}</span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white group-hover:text-primary transition duration-200">
                      {template.title}
                    </h3>

                    <p className="text-sm text-slate-400 mt-2.5 leading-relaxed line-clamp-3">
                      {template.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-col gap-4 border-t border-border/40 pt-4">
                    {template.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {template.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-medium text-slate-400 bg-card border border-border/80 rounded-md px-2 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Icon icon="lucide:user" className="text-sm" />
                        <span className="text-[10px] font-medium truncate max-w-[140px]">
                          {template.author_name || 'Whiparc Official'}
                        </span>
                      </div>
                      <span className="rounded-xl bg-secondary group-hover:bg-primary group-hover:text-white px-4 py-2 text-xs font-bold text-slate-300 transition duration-200 flex items-center gap-1">
                        <span>View Template</span>
                        <Icon icon="lucide:chevron-right" className="text-sm" />
                      </span>
                    </div>
                  </div>
                </TiltCard>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
