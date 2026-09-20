'use client';

import { Suspense } from 'react';
import { Icon } from '@iconify/react';
import { DashboardV2 } from './DashboardV2';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
          <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
        </div>
      }
    >
      <DashboardV2 />
    </Suspense>
  );
}
