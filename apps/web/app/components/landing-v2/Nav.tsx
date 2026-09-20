import Link from 'next/link';
import { Icon } from '@iconify/react';
import type { ThemeMode } from './palette';
import { useMarketingCta } from './useMarketingCta';

const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Limits', href: '#rough' },
  { label: 'Templates', href: '/templates' },
  { label: 'Pricing', href: '#pricing' },
];

const SEGMENTS: { key: ThemeMode; label: string }[] = [
  { key: 'scroll', label: 'AUTO' },
  { key: 'dark', label: 'DARK' },
  { key: 'light', label: 'LIGHT' },
];

export function Nav({ mode, setMode }: { mode: ThemeMode; setMode: (m: ThemeMode) => void }) {
  const { startHref } = useMarketingCta();

  return (
    <div
      data-nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        background: 'rgba(7,8,11,.82)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid #1E2233',
        color: '#FFFFFF',
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '0 clamp(16px,4vw,44px)',
          height: 66,
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(14px,2.5vw,34px)',
        }}
      >
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <span
            style={{
              width: 28,
              height: 28,
              border: '1px solid currentColor',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 15h5M14 19h5" />
            </svg>
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>whiparc</span>
        </a>

        <div
          data-navlinks
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(12px,1.8vw,26px)',
            fontFamily: 'var(--font-mono-marketing)',
            fontSize: 11,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            marginLeft: 'auto',
            overflow: 'hidden',
          }}
        >
          {NAV_LINKS.map((link) =>
            link.href.startsWith('/') ? (
              <Link key={link.href} href={link.href} style={{ whiteSpace: 'nowrap', opacity: 0.72 }}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} style={{ whiteSpace: 'nowrap', opacity: 0.72 }}>
                {link.label}
              </a>
            )
          )}
        </div>

        <div
          data-seg
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid var(--line)',
            flexShrink: 0,
            fontFamily: 'var(--font-mono-marketing)',
            fontSize: 9,
            letterSpacing: '.12em',
          }}
        >
          {SEGMENTS.map((seg, i) => (
            <button
              key={seg.key}
              data-seg-btn={seg.key}
              onClick={() => setMode(seg.key)}
              aria-pressed={mode === seg.key}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 0,
                borderLeft: i > 0 ? '1px solid currentColor' : undefined,
                color: 'inherit',
                font: 'inherit',
                padding: '6px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <a
          data-gh
          href="https://github.com/whiparc/whiparc"
          target="_blank"
          rel="noopener"
          title="Star whiparc on GitHub"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexShrink: 0,
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            padding: '8px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon icon="simple-icons:github" width={15} />
          <Icon icon="lucide:star" width={12} style={{ opacity: 0.7 }} />
        </a>

        <Link
          href={startHref}
          data-cta
          style={{
            flexShrink: 0,
            background: '#6366F1',
            color: '#FFFFFF',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 13,
            padding: '9px 16px',
            whiteSpace: 'nowrap',
          }}
        >
          Start free
        </Link>
      </div>
    </div>
  );
}
