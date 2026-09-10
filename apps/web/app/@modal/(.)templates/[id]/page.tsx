'use client';

import { useParams } from 'next/navigation';
import { TemplateModal } from '../../../components/TemplateModal';
import { TemplateDetailContent } from '../../../components/TemplateDetailContent';

// Intercepts client-side navigation from /templates to /templates/{id} and
// renders it as a popup over the grid instead of a full page transition —
// the URL still becomes /templates/{id} (shareable, and a hard refresh or
// direct visit renders the real page at app/templates/[id]/page.tsx
// instead of this intercepted version). See product-memory 10.1.
export default function InterceptedTemplateModal() {
  const params = useParams<{ id: string }>();

  return (
    <TemplateModal>
      <TemplateDetailContent id={params.id} variant="modal" />
    </TemplateModal>
  );
}
