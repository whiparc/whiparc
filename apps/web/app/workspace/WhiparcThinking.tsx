'use client';

import React, { useEffect, useState } from 'react';
import { BrandMark } from '../components/brand/BrandMark';
import './WhiparcThinking.css';

const DEFAULT_PHRASES = [
  'Reading your description',
  'Choosing building blocks',
  'Checking the connections',
  'Setting sensible defaults',
];

// After this long the caption admits it is taking a while, so a slow provider
// reads as slow and not as stuck.
const SLOW_AFTER_MS = 12000;
const SWAP_EVERY_MS = 2400;

interface Props {
  phrases?: string[];
}

// WhiparcThinking is the loading state of AI generation: the brand mark as a
// character, with a caption that moves through what the request is doing. The
// caption is a live region; the animation itself is decoration.
export default function WhiparcThinking({ phrases = DEFAULT_PHRASES }: Props) {
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const swap = setInterval(() => setIndex((i) => (i + 1) % phrases.length), SWAP_EVERY_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearInterval(swap);
      clearTimeout(slowTimer);
    };
  }, [phrases.length]);

  const caption = slow ? 'Still working, this one is taking a moment' : phrases[index % phrases.length];

  return (
    <div className="wp-think" data-testid="ai-thinking">
      <div className="wp-think-stage" aria-hidden="true">
        <span className="wp-think-mark">+</span>
        <span className="wp-think-mark">+</span>
        <span className="wp-think-mark">+</span>
        <span className="wp-think-mark">+</span>
        <span className="wp-think-shadow" />
        <div className="wp-think-hop">
          <BrandMark size={56} arcClassName="wp-think-arc" />
        </div>
      </div>
      <div className="wp-think-caption" role="status" aria-live="polite">
        {caption}
        <span className="wp-think-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
