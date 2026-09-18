export type ThemeMode = 'scroll' | 'dark' | 'light';
export type Band = 'dark' | 'light';

export const PALETTES: Record<Band, Record<string, string>> = {
  dark: {
    '--ground': '#07080B',
    '--panel': '#0D0F16',
    '--line': '#1E2233',
    '--ink': '#FFFFFF',
    '--ink2': '#94A3B8',
    '--accent-ink': '#9EA2F9',
    '--accent': '#6366F1',
    '--amber': '#F59E0B',
    '--chip': 'rgba(255,255,255,.04)',
  },
  light: {
    '--ground': '#FBFBFC',
    '--panel': '#FFFFFF',
    '--line': '#E3E6ED',
    '--ink': '#0F1220',
    '--ink2': '#5B6577',
    '--accent-ink': '#4338CA',
    '--accent': '#4F46E5',
    '--amber': '#B45309',
    '--chip': 'rgba(15,18,32,.04)',
  },
};

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// Symmetric ease-in/ease-out for scroll-scrubbed (not duration-based)
// animation — slow at both ends of the 0-1 range, fast through the middle.
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
