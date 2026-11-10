// Client for AI mode (prompt to canvas proposal). The server validates the
// model's output against a catalog and returns a proposal that is NOT saved;
// the user reviews it and only then does it join the canvas through the normal
// autosave path. See docs/plans/ai-mode-phase-1-design.md.

import type { Edge, Node } from '@xyflow/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface AIStatus {
  enabled: boolean;
  maxPromptLength: number;
}

export interface AIWarning {
  code: string;
  ref?: string;
  message: string;
}

export interface AIProposal {
  nodes: Node[];
  edges: Edge[];
  warnings: AIWarning[];
  // What the model said it left out. Plain text from a model: show it as text only.
  notes: string[];
}

export type AIGenerateResult =
  | { ok: true; proposal: AIProposal }
  // notes is set on a refusal where the model said why it built nothing.
  | { ok: false; status: number; message: string; notes: string[] };

const MAX_NOTES = 5;

// parseNotes accepts only a list of non-empty strings and applies the server's
// count limit again, so a bad response cannot flood the review panel.
export function parseNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, MAX_NOTES);
}

const FALLBACK_STATUS: AIStatus = { enabled: false, maxPromptLength: 2000 };

// fetchAIStatus resolves to "disabled" on any failure: the prompt box is an
// optional extra and must never get in the way of the canvas.
export async function fetchAIStatus(token: string): Promise<AIStatus> {
  try {
    const res = await fetch(`${API_URL}/api/ai/status`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return FALLBACK_STATUS;
    const body = await res.json();
    return {
      enabled: body?.enabled === true,
      maxPromptLength: typeof body?.maxPromptLength === 'number' ? body.maxPromptLength : FALLBACK_STATUS.maxPromptLength,
    };
  } catch {
    return FALLBACK_STATUS;
  }
}

async function errorDetails(res: Response): Promise<{ message: string; notes: string[] }> {
  try {
    const body = await res.json();
    const notes = parseNotes(body?.notes);
    if (body && typeof body.error === 'string' && body.error) return { message: body.error, notes };
  } catch {
    // fall through
  }
  if (res.status === 403) return { message: 'You need edit access to this project to use AI generation.', notes: [] };
  if (res.status === 429) return { message: 'Too many requests. Please wait a moment and try again.', notes: [] };
  return { message: 'Something went wrong. Please try again.', notes: [] };
}

export async function generateProposal(projectId: string, token: string, prompt: string, signal?: AbortSignal): Promise<AIGenerateResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, status: 0, message: 'Cancelled.', notes: [] };
    }
    return { ok: false, status: 0, message: 'Could not reach the server. Check your connection and try again.', notes: [] };
  }

  if (!res.ok) return { ok: false, status: res.status, ...(await errorDetails(res)) };

  try {
    const body = await res.json();
    if (!Array.isArray(body?.nodes) || !Array.isArray(body?.edges)) throw new Error('shape');
    return {
      ok: true,
      proposal: {
        nodes: body.nodes,
        edges: body.edges,
        warnings: Array.isArray(body.warnings) ? body.warnings : [],
        notes: parseNotes(body.notes),
      },
    };
  } catch {
    return { ok: false, status: res.status, message: 'The server returned an unreadable response. Please try again.', notes: [] };
  }
}

// mergeProposal appends an accepted proposal to the current canvas. The server
// already avoids ID clashes with the saved canvas, but the live canvas can have
// moved on since (another collaborator, unsaved nodes), so IDs are re-checked
// here and edges follow any rename.
export function mergeProposal(
  existingNodes: Node[],
  existingEdges: Edge[],
  proposal: Pick<AIProposal, 'nodes' | 'edges'>,
): { nodes: Node[]; edges: Edge[] } {
  const taken = new Set(existingNodes.map((n) => n.id));
  const renamed = new Map<string, string>();

  const added = proposal.nodes.map((n) => {
    let id = n.id;
    for (let i = 1; taken.has(id); i++) id = `${n.id}_${i}`;
    taken.add(id);
    if (id !== n.id) renamed.set(n.id, id);
    return id === n.id ? n : { ...n, id };
  });

  const takenEdges = new Set(existingEdges.map((e) => e.id));
  const addedEdges = proposal.edges.map((e) => {
    const source = renamed.get(e.source) ?? e.source;
    const target = renamed.get(e.target) ?? e.target;
    let id = `e_${source}_${target}`;
    for (let i = 1; takenEdges.has(id); i++) id = `e_${source}_${target}_${i}`;
    takenEdges.add(id);
    return { ...e, id, source, target };
  });

  return { nodes: [...existingNodes, ...added], edges: [...existingEdges, ...addedEdges] };
}
