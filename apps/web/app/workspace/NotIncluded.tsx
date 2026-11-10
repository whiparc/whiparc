import React, { type CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'var(--font-mono-marketing, monospace)' };

// NotIncluded lists what the model said it left out of a proposal. The text is a
// model's, so it is rendered as plain text only: never as markup, and never as a
// link. The server also cleans it (aigen.CleanNotes); this is the second layer.
export default function NotIncluded({ notes }: { notes: string[] }) {
  return (
    <div data-testid="ai-notes" style={{ border: '1px solid var(--line)', padding: 8 }}>
      <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
        Not included
      </span>
      <ul style={{ margin: '6px 0 0', paddingLeft: 16, ...mono, fontSize: 10.5, color: 'var(--ink2)' }}>
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
