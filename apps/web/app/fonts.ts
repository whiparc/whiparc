import localFont from 'next/font/local';

// Marketing page v2 ("Draw it once. Ship the Terraform.") type system.
//
// Self-hosted from app/_fonts (latin subset, SIL Open Font License, see
// _fonts/README.md) instead of next/font/google. The Google loader fetches
// fonts.googleapis.com when the dev server or build starts, and when that
// request fails (offline, proxy, TLS inspection) it silently falls back to
// system fonts: the page renders in Arial-style type with proportional "mono"
// labels, and the failure is cached. Local files make dev, CI and Docker
// builds independent of that network call, and there is still no
// render-blocking request and no CLS on first paint.
export const spaceGroteskFont = localFont({
  src: [{ path: './_fonts/space-grotesk-latin.woff2', weight: '300 700', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
});

export const barlowFont = localFont({
  src: [
    { path: './_fonts/barlow-400-latin.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/barlow-500-latin.woff2', weight: '500', style: 'normal' },
    { path: './_fonts/barlow-600-latin.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-body-marketing',
  display: 'swap',
});

export const jetBrainsMonoFont = localFont({
  src: [{ path: './_fonts/jetbrains-mono-latin.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-mono-marketing',
  display: 'swap',
});

// Whiparc wordmark only (see components/brand/BrandLogo.tsx) — the supplied
// logo artwork sets "whiparc" in Barlow Condensed Bold, so the live-text
// lockup loads that exact face rather than approximating it with the
// marketing display font.
export const barlowCondensedFont = localFont({
  src: [{ path: './_fonts/barlow-condensed-700-latin.woff2', weight: '700', style: 'normal' }],
  variable: '--font-brand',
  display: 'swap',
});
