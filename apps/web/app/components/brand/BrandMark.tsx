import type { CSSProperties } from 'react';

// Brand geometry lifted from the official logo kit (assets/icon-cutout-*.svg).
// The mark is drawn inline instead of loaded through <img> so the dark half
// can follow `currentColor` — one component serves the dark theme, the light
// theme and the marketing page's scroll-driven dark/light bands, where a
// pair of static light/dark SVG files would need JS to swap between them.
// The orange half is the brand colour and never changes with the theme.
export const BRAND_ORANGE = '#FF6A3D';

const INK_PATH =
  'M176.859 512L247.201 334.569L211.185 234.667L266.436 199.285L278.305 169.626L247.201 86.8943L162.072 304.39L81.036 0L0 36.9431L123.275 512H176.859Z';
const ARC_PATH =
  'M287.309 201.366L225.509 240.911L317.909 512H373.803L512 43.187L430.964 8.3252L410.091 97.8211H435.466L378.577 262.764H365.89L351.974 314.797L330.692 262.764H264.799L287.309 201.366Z';

// arcClassName lets a caller animate the orange arc on its own (the AI loading
// character whips it). It adds a class and nothing else, so the mark is unchanged
// everywhere it is not used.
export function BrandMark({ size = 24, style, arcClassName }: { size?: number; style?: CSSProperties; arcClassName?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={INK_PATH} fill="currentColor" />
      <path className={arcClassName} fillRule="evenodd" clipRule="evenodd" d={ARC_PATH} fill={BRAND_ORANGE} />
    </svg>
  );
}
