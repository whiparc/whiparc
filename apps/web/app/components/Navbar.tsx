'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import ProfileMenu from './ProfileMenu';

export type NavItem = { label: string; href: string };

// Single source of truth for the marketing-site nav — both the desktop bar
// and the mobile menu render off this array, so a new top-level section
// (e.g. the /templates catalog) is a one-line addition here instead of a
// change in two duplicated JSX blocks.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Templates', href: '/templates' },
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Docs', href: '/docs' },
];

export function Navbar() {
  const { user, hasHydrated } = useAuthStore();
  const isLoggedIn = hasHydrated && !!user;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-10">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-background/60 px-6 py-3 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-lg shadow-indigo-500/20">
              <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 15h5M14 19h5" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-wide text-white">Whiparc</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-slate-400 transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 lg:flex">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer">
                  Dashboard
                </Link>
                <ProfileMenu variant="compact" />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-400 transition hover:text-white cursor-pointer">
                  Sign in
                </Link>
                <Link href="/login?mode=signup" className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer">
                  Get Started Free
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] lg:hidden cursor-pointer"
            aria-label="Toggle Menu"
          >
            <Icon icon={mobileOpen ? 'lucide:x' : 'lucide:menu'} className="text-lg text-white" />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 rounded-2xl border border-white/[0.06] bg-background/90 p-6 shadow-2xl backdrop-blur-xl lg:hidden"
          >
            <nav className="flex flex-col gap-4">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-slate-400 hover:text-white transition"
                >
                  {item.label}
                </Link>
              ))}
              <hr className="border-white/[0.06]" />
              {isLoggedIn ? (
                <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 py-3 text-sm font-semibold text-white cursor-pointer">Dashboard</Link>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl border border-white/[0.06] py-3 text-sm font-semibold text-white cursor-pointer">Sign in</Link>
                  <Link href="/login?mode=signup" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 py-3 text-sm font-semibold text-white cursor-pointer">Get Started Free</Link>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </div>
    </header>
  );
}

export default Navbar;
