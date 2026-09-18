'use client';

import React from 'react';
import { BaseEdge, Position, type EdgeProps } from '@xyflow/react';

// Same technique as ReactFlowCanvasNode's hashSeed — deterministic per-edge
// so a connection's wobble is stable across re-renders/selection, but varies
// edge-to-edge so a canvas full of connections doesn't look templated.
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Cheap deterministic pseudo-random in [0, 1), seeded by (seed, salt).
function seededRandom(seed: number, salt: number): number {
  const x = Math.sin(seed + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function extendPoint(x: number, y: number, position: Position | undefined, dist: number): [number, number] {
  switch (position) {
    case Position.Left:
      return [x - dist, y];
    case Position.Right:
      return [x + dist, y];
    case Position.Top:
      return [x, y - dist];
    case Position.Bottom:
      return [x, y + dist];
    default:
      return [x, y];
  }
}

// A single cubic bezier whose control points are pushed out from each
// handle along its connection direction (so edges still exit/enter nodes
// cleanly) and then perturbed by a small, per-edge seeded jitter — reads as
// a loosely hand-drawn thread rather than a uniform smooth curve. Matches
// the design mock's irregular connector paths without needing a
// multi-segment path or a rough.js-style dependency.
export default function ThreadEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  markerStart,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
}: EdgeProps) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;
  const px = -uy;
  const py = ux;

  const seed = hashSeed(id);
  const extend = Math.min(90, Math.max(24, dist * 0.45));

  let [c1x, c1y] = extendPoint(sourceX, sourceY, sourcePosition, extend);
  let [c2x, c2y] = extendPoint(targetX, targetY, targetPosition, extend);

  const jitterMag = Math.min(16, 5 + dist * 0.035);
  const j1 = (seededRandom(seed, 1) - 0.5) * 2 * jitterMag;
  const j2 = (seededRandom(seed, 2) - 0.5) * 2 * jitterMag;
  c1x += px * j1;
  c1y += py * j1;
  c2x += px * j2;
  c2y += py * j2;

  const path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  const labelX = (sourceX + 2 * c1x + 2 * c2x + targetX) / 6;
  const labelY = (sourceY + 2 * c1y + 2 * c2y + targetY) / 6;

  return (
    <BaseEdge
      id={id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      style={{ strokeLinecap: 'round', ...style }}
      markerEnd={markerEnd}
      markerStart={markerStart}
      label={label}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      interactionWidth={interactionWidth}
    />
  );
}
