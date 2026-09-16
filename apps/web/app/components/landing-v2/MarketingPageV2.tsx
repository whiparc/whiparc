'use client';

import type { CSSProperties } from 'react';
import { spaceGroteskFont, barlowFont, jetBrainsMonoFont } from '../../fonts';
import { useMarketingEngine } from './useMarketingEngine';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { Limits } from './Limits';
import { Templates } from './Templates';
import { Pricing } from './Pricing';
import { Footer } from './Footer';
import '../ui/blueprint.css';
import './marketing-v2.css';

const rootStyle: CSSProperties = {
  ['--ground' as string]: '#07080B',
  ['--panel' as string]: '#0D0F16',
  ['--line' as string]: '#1E2233',
  ['--ink' as string]: '#FFFFFF',
  ['--ink2' as string]: '#94A3B8',
  ['--accent-ink' as string]: '#9EA2F9',
  ['--accent' as string]: '#6366F1',
  ['--amber' as string]: '#F59E0B',
  ['--chip' as string]: 'rgba(255,255,255,.04)',
  background: '#07080B',
  color: '#FFFFFF',
};

export default function MarketingPageV2() {
  const { rootRef, mode, setMode } = useMarketingEngine();

  return (
    <div
      ref={rootRef}
      data-whiparc-root
      className={`wp-root ${spaceGroteskFont.variable} ${barlowFont.variable} ${jetBrainsMonoFont.variable}`}
      style={{ ...rootStyle, fontFamily: 'var(--font-body-marketing), system-ui, sans-serif' }}
    >
      <Nav mode={mode} setMode={setMode} />
      <Hero />
      <HowItWorks />
      <Limits />
      <Templates />
      <Pricing />
      <Footer />
    </div>
  );
}
