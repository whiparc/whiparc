'use client';

import { Suspense } from 'react';
import { Icon } from '@iconify/react';
import { ExportCodePageV2 } from './ExportCodePageV2';

export default function ExportCodePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full bg-background flex items-center justify-center text-muted-foreground">
          <Icon icon="lucide:loader-2" className="animate-spin text-2xl" />
        </div>
      }
    >
      <ExportCodePageV2 />
    </Suspense>
  );
}
