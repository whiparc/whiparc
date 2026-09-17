'use client';

import React, { type RefObject } from 'react';
import { Icon } from '@iconify/react';

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--amber)',
  RUNNING: 'var(--accent-ink)',
  CLEANUP: 'var(--accent-ink)',
  SUCCESS: 'var(--success, #10B981)',
  FAILED: 'var(--danger)',
};

export interface ConsoleBarProps {
  isOpen: boolean;
  onToggle: () => void;
  logs: string;
  onClearLogs: () => void;
  deployStatus: string;
  terminalEndRef: RefObject<HTMLDivElement | null>;
}

// A persistent full-width bottom strip (matches the design's always-docked
// "console" bar) that expands into the real runner-output log drawer —
// same `logs`/`deployStatus` state the app already streams over the
// deploy WebSocket, just no longer hidden until the header button is
// clicked.
export function ConsoleBar({ isOpen, onToggle, logs, onClearLogs, deployStatus, terminalEndRef }: ConsoleBarProps) {
  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--line)', background: 'var(--panel)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="wp-ws-console-toggle"
        style={{ height: 34, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <Icon icon={isOpen ? 'lucide:chevron-down' : 'lucide:chevron-up'} width={12} style={{ color: 'var(--ink3)' }} />
        <span style={{ fontFamily: 'var(--font-mono-marketing, monospace)', fontSize: 11, color: 'var(--ink2)' }}>console</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono-marketing, monospace)',
            fontSize: 11,
            color: deployStatus === 'IDLE' ? 'var(--ink3)' : STATUS_COLOR[deployStatus] || 'var(--ink3)',
          }}
        >
          {deployStatus === 'IDLE' ? 'idle — press Deploy to run the pipeline' : deployStatus === 'CLEANUP' ? 'cleaning up' : deployStatus.toLowerCase()}
        </span>
      </button>

      {isOpen && (
        <div style={{ height: 240, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--line)' }}>
          <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--font-mono-marketing, monospace)', fontSize: 10.5, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon icon="lucide:terminal" width={11} style={{ color: 'var(--accent-ink)' }} />
              Runner output log
            </span>
            <button
              type="button"
              onClick={onClearLogs}
              className="wp-ws-navlink"
              style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--ink2)', fontSize: 10.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Icon icon="lucide:trash-2" width={10} />
              Clear
            </button>
          </div>
          <div style={{ flex: 1, padding: 12, overflowY: 'auto', fontFamily: 'var(--font-mono-marketing, monospace)', fontSize: 11, lineHeight: 1.6, color: 'var(--ink2)' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logs || 'No active pipeline logs. Press "Deploy" to run visual orchestration…'}</pre>
            <div ref={terminalEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
