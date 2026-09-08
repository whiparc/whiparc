'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { motion } from 'framer-motion';

// The Canva-style popup shell for the intercepting route at
// app/@modal/(.)templates/[id]/page.tsx. Closes on Escape, on an outside
// (backdrop) click, and via the close button — all three call router.back()
// so the URL correctly reverts to /templates rather than navigating away.
// See product-memory 10.1 for why this is an intercepting route (URL-backed
// popup, not plain client-side modal state) and its one accepted gap: no
// exit animation on close, since animating a route-driven unmount here would
// need AnimatePresence wired at the root layout around the parallel slot —
// left as a follow-up rather than expanding this pass's scope.
export function TemplateModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm px-4 py-10 sm:py-16"
      onClick={close}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-4xl rounded-3xl border border-border bg-background shadow-2xl p-6 sm:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-slate-400 hover:text-white hover:bg-secondary transition cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-lg" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
