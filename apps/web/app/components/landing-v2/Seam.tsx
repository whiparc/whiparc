// A hard-edged color wipe bridging two adjacent dark/light sections.
// Two flat panels ("from" = the band above, "to" = the band below) are
// painted by MarketingEngine.paintSeams(); the "to" panel's clip-path is
// then driven every frame by MarketingEngine's seam progress calc as the
// user scrolls the boundary past the nav line, producing a scroll-scrubbed
// wipe instead of a pre-baked gradient blend.
export function Seam({ pair }: { pair: 'dark:light' | 'light:dark' }) {
  return (
    <div
      data-seam={pair}
      style={{ position: 'absolute', top: -90, left: 0, right: 0, height: 180, pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}
    >
      <div data-seam-panel="from" style={{ position: 'absolute', inset: 0 }} />
      <div data-seam-panel="to" style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
