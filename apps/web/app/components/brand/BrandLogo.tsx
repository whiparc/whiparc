import type { CSSProperties } from 'react';
import { barlowCondensedFont } from '../../fonts';

// The mark itself lives in BrandMark.tsx, which has no font dependency, so it can
// be used (and tested) where the wordmark's font cannot be loaded.
import { BrandMark, BRAND_ORANGE } from './BrandMark';
export { BrandMark, BRAND_ORANGE };

// Mark + live-text wordmark. "whip" inherits the surrounding text colour and
// "arc" is brand orange, matching the two tspans in the official horizontal logo.
export function BrandLogo({
  size = 24,
  textSize,
  wordmark = true,
  style,
}: {
  size?: number;
  textSize?: number;
  wordmark?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className={barlowCondensedFont.variable}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.36), lineHeight: 1, ...style }}
    >
      <BrandMark size={size} />
      {wordmark && (
        <span
          style={{
            fontFamily: 'var(--font-brand), "Arial Narrow", sans-serif',
            fontWeight: 700,
            fontSize: textSize ?? Math.round(size * 0.85),
            letterSpacing: '-.02em',
            whiteSpace: 'nowrap',
          }}
        >
          whip<span style={{ color: BRAND_ORANGE }}>arc</span>
        </span>
      )}
    </span>
  );
}
