'use client';

import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@iconify/react';
import { useReactFlow } from '@xyflow/react';
import useCanvasStore from '../store/useCanvasStore';
import {
  fetchAIStatus,
  generateProposal,
  mergeProposal,
  type AIProposal,
  type AIStatus,
} from '../lib/aiGenerate';

const EXAMPLES = [
  'A web server running nginx behind a firewall',
  'A Node.js app server with a PostgreSQL database',
  'A static site host with an S3 bucket for uploads',
];

const mono: CSSProperties = { fontFamily: 'var(--font-mono-marketing, monospace)' };

const labelStyle: CSSProperties = {
  ...mono,
  fontSize: 9.5,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
};

const buttonBase: CSSProperties = {
  ...mono,
  fontSize: 11,
  padding: '7px 12px',
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--ink)',
  cursor: 'pointer',
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--accent-ink)',
  borderColor: 'var(--accent-ink)',
  color: 'var(--ground)',
};

type Phase = 'closed' | 'compose' | 'loading' | 'review';

interface Props {
  projectId: string;
  token: string | null;
  readOnly: boolean;
}

// AIGeneratePanel turns a plain-language description into a proposed set of
// nodes. The proposal is validated server-side against a catalog and is shown
// here for review; nothing touches the canvas until the user accepts it.
export default function AIGeneratePanel({ projectId, token, readOnly }: Props) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchAIStatus(token).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setPhase('closed');
    setError(null);
    setProposal(null);
  }, []);

  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, close]);

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (!token || !text || phase === 'loading') return;
    setError(null);
    setPhase('loading');
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await generateProposal(projectId, token, text, controller.signal);
    if (controller.signal.aborted) return;
    if (result.ok) {
      setProposal(result.proposal);
      setPhase('review');
    } else {
      setError(result.message);
      setPhase('compose');
    }
  }, [prompt, token, projectId, phase]);

  const accept = useCallback(() => {
    if (!proposal) return;
    const { nodes, edges, setNodes, setEdges } = useCanvasStore.getState();
    const merged = mergeProposal(nodes, edges, proposal);
    setNodes(merged.nodes);
    setEdges(merged.edges);
    setPrompt('');
    setProposal(null);
    setPhase('closed');
    // Wait a frame so React Flow has measured the new nodes before framing them.
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60);
  }, [proposal, fitView]);

  if (!status?.enabled || readOnly) return null;

  const wrapper: CSSProperties = { position: 'absolute', top: 14, left: 14, zIndex: 25 };

  if (phase === 'closed') {
    return (
      <div style={wrapper}>
        <button
          type="button"
          data-testid="ai-open"
          onClick={() => setPhase('compose')}
          style={{ ...buttonBase, display: 'flex', alignItems: 'center', gap: 7, background: 'var(--panel)' }}
        >
          <Icon icon="lucide:sparkles" width={13} />
          Generate with AI
        </button>
      </div>
    );
  }

  const remaining = status.maxPromptLength - prompt.length;

  return (
    <div style={wrapper}>
      <section
        aria-label="Generate infrastructure with AI"
        style={{
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          border: '1px solid var(--line)',
          background: 'var(--panel)',
          color: 'var(--ink)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>{phase === 'review' ? 'Review proposal' : 'Generate with AI'}</span>
          <button type="button" aria-label="Close" onClick={close} style={{ ...buttonBase, padding: '2px 6px', border: 0 }}>
            <Icon icon="lucide:x" width={13} />
          </button>
        </header>

        {phase !== 'review' && (
          <>
            <textarea
              data-testid="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              }}
              maxLength={status.maxPromptLength}
              disabled={phase === 'loading'}
              placeholder="Describe what you want to build, e.g. a Node.js app on a small server with a PostgreSQL database."
              rows={5}
              autoFocus
              style={{
                ...mono,
                fontSize: 12,
                width: '100%',
                resize: 'vertical',
                background: 'var(--ground)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                padding: 8,
              }}
            />
            {!prompt && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelStyle}>Try</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    style={{ ...buttonBase, textAlign: 'left', fontSize: 11, color: 'var(--ink2)', border: 0, padding: '2px 0' }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <div role="alert" data-testid="ai-error" style={{ ...mono, fontSize: 11, color: 'var(--amber)' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...mono, fontSize: 10, color: remaining < 100 ? 'var(--amber)' : 'var(--ink3)' }}>{remaining} left</span>
              <button
                type="button"
                data-testid="ai-generate"
                onClick={submit}
                disabled={!prompt.trim() || phase === 'loading'}
                style={{ ...primaryButton, opacity: !prompt.trim() || phase === 'loading' ? 0.5 : 1 }}
              >
                {phase === 'loading' ? 'Generating…' : 'Generate'}
              </button>
            </div>
            <p style={{ ...mono, fontSize: 10, color: 'var(--ink3)', margin: 0 }}>
              AI suggests a starting point from a fixed set of building blocks. You review it before anything is added, and credentials are never set by AI.
            </p>
          </>
        )}

        {phase === 'review' && proposal && (
          <>
            <ul data-testid="ai-nodes" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {proposal.nodes.map((n) => {
                const d = n.data as { label?: string; tech?: string; icon?: string };
                return (
                  <li key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <Icon icon={d.icon || 'lucide:box'} width={14} />
                    <span style={{ flex: 1 }}>{d.label}</span>
                    <span style={labelStyle}>{d.tech}</span>
                  </li>
                );
              })}
            </ul>
            <span style={{ ...mono, fontSize: 10, color: 'var(--ink3)' }}>
              {proposal.nodes.length} nodes, {proposal.edges.length} connections
            </span>
            {proposal.warnings.length > 0 && (
              <div data-testid="ai-warnings" style={{ border: '1px solid var(--line)', padding: 8 }}>
                <span style={labelStyle}>{proposal.warnings.length} adjustment{proposal.warnings.length === 1 ? '' : 's'}</span>
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, ...mono, fontSize: 10.5, color: 'var(--ink2)', maxHeight: 110, overflowY: 'auto' }}>
                  {proposal.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setProposal(null); setPhase('compose'); }} style={buttonBase}>
                Back
              </button>
              <button type="button" onClick={close} style={buttonBase}>
                Discard
              </button>
              <button type="button" data-testid="ai-accept" onClick={accept} style={primaryButton}>
                Add to canvas
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
