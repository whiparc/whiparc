'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

const REPO = 'whiparc/whiparc';
const CACHE_KEY = 'whiparc:gh-stars';
const CACHE_TTL_MS = 60 * 60 * 1000;

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
}

export function GitHubStarButton({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const applyCached = (): boolean => {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return false;
        const { count, ts } = JSON.parse(raw) as { count: number; ts: number };
        if (Date.now() - ts > CACHE_TTL_MS) return false;
        setStars(count);
        return true;
      } catch {
        return false;
      }
    };

    if (applyCached()) return;

    fetch(`https://api.github.com/repos/${REPO}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { stargazers_count?: number }) => {
        if (cancelled || typeof data.stargazers_count !== 'number') return;
        setStars(data.stargazers_count);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ count: data.stargazers_count, ts: Date.now() }));
        } catch {
          // sessionStorage unavailable — skip caching, not fatal
        }
      })
      .catch(() => {
        // Rate-limited or offline — button still renders, just without a count.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const compact = variant === 'compact';

  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Star Whiparc on GitHub"
      className={
        compact
          ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] text-slate-300 transition hover:border-white/[0.12] hover:text-white cursor-pointer'
          : 'inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/[0.12] hover:text-white cursor-pointer'
      }
    >
      <Icon icon="lucide:github" className={compact ? 'text-lg' : 'text-base'} />
      {!compact && (
        <>
          <span>Star</span>
          <span className="flex items-center gap-1 text-slate-500">
            <Icon icon="lucide:star" className="text-amber-400 text-xs" />
            {stars !== null && <span>{formatStars(stars)}</span>}
          </span>
        </>
      )}
    </a>
  );
}

export default GitHubStarButton;
