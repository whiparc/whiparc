'use client';

import { useEffect, useRef, useState } from 'react';
import { MarketingEngine } from './MarketingEngine';
import type { ThemeMode } from './palette';

export function useMarketingEngine() {
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MarketingEngine | null>(null);
  const [mode, setModeState] = useState<ThemeMode>('scroll');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const engine = new MarketingEngine(root, reducedMotion);
    engineRef.current = engine;
    engine.mount();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    engineRef.current?.setMode(next);
  };

  return { rootRef, mode, setMode };
}
