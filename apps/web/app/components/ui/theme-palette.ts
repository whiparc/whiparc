export type Theme = 'dark' | 'light';

// Shared dark/light token set for the Industry-design-system pages (login,
// dashboard, and others as they're ported) — each page owns its own local
// theme state (no cross-page persistence), but they all repaint against
// these same values so switching between them doesn't feel like a
// different product.
export const THEME_PALETTES: Record<Theme, Record<string, string>> = {
  dark: {
    '--ground': '#07080B',
    '--panel': '#0D0F16',
    '--elevated': '#12141C',
    '--line': '#1E2233',
    '--ink': '#FFFFFF',
    '--ink2': '#94A3B8',
    '--ink3': '#64748B',
    '--accent-ink': '#9EA2F9',
    '--accent': '#6366F1',
    '--accent-hover': '#4F46E5',
    '--amber': '#F59E0B',
    '--success': '#10B981',
    '--danger': '#F43F5E',
    '--chip': 'rgba(255,255,255,.04)',
    '--k8s-ink': '#7DD3FC',
    '--target-ink': '#5EEAD4',
  },
  light: {
    '--ground': '#FBFBFC',
    '--panel': '#FFFFFF',
    '--elevated': '#FFFFFF',
    '--line': '#E3E6ED',
    '--ink': '#0F1220',
    '--ink2': '#5B6577',
    '--ink3': '#8A93A6',
    '--accent-ink': '#4338CA',
    '--accent': '#4F46E5',
    '--accent-hover': '#4338CA',
    '--amber': '#B45309',
    '--success': '#047857',
    '--danger': '#BE123C',
    '--chip': 'rgba(15,18,32,.04)',
    '--k8s-ink': '#0369A1',
    '--target-ink': '#0F766E',
  },
};
