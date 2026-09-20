'use client';

import { Suspense } from 'react';
import { Icon } from '@iconify/react';
import { DocsPageV2 } from './DocsPageV2';

export default function DocsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
          <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
        </div>
      }
    >
      <DocsPageV2 />
    </Suspense>
  );
}
