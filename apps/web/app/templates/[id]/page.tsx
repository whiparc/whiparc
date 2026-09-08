'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { Navbar } from '../../components/Navbar';
import { TemplateDetailContent } from '../../components/TemplateDetailContent';
import { heroDisplayFont } from '../../fonts';

// Standalone, directly-navigable /templates/{id} page — full page chrome
// (Navbar, background) plus a "Back to Templates" link. Rendered on a hard
// navigation / shared link / search-engine crawl. Clicking a card from
// /templates instead intercepts to the popup version at
// app/@modal/(.)templates/[id]/page.tsx, which renders the exact same
// TemplateDetailContent inside TemplateModal. See product-memory 10.1.
export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className={`min-h-screen w-full bg-background flex flex-col relative text-slate-100 overflow-x-hidden ${heroDisplayFont.className}`}>
      <div className="pointer-events-none fixed inset-0 bg-dot-pattern opacity-30 z-0" />

      <Navbar />

      <main className="flex flex-1 flex-col relative z-10 mx-auto w-full max-w-6xl px-6 pt-36 pb-24 lg:px-10">
        <Link href="/templates" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition mb-8 w-fit">
          <Icon icon="lucide:arrow-left" className="text-sm" />
          Back to Templates
        </Link>

        <TemplateDetailContent id={params.id} variant="page" />
      </main>
    </div>
  );
}
