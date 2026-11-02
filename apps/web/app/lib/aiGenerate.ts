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
}

export type AIGenerateResult =
  | { ok: true; proposal: AIProposal }
  | { ok: false; status: number; message: string };

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

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // fall through
  }
  if (res.status === 403) return 'You need edit access to this project to use AI generation.';
  if (res.status === 429) return 'Too many requests. Please wait a moment and try again.';
  return 'Something went wrong. Please try again.';
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
      return { ok: false, status: 0, message: 'Cancelled.' };
    }
    return { ok: false, status: 0, message: 'Could not reach the server. Check your connection and try again.' };
  }

  if (!res.ok) return { ok: false, status: res.status, message: await errorMessage(res) };

  try {
    const body = await res.json();
    if (!Array.isArray(body?.nodes) || !Array.isArray(body?.edges)) throw new Error('shape');
    return {
      ok: true,
      proposal: { nodes: body.nodes, edges: body.edges, warnings: Array.isArray(body.warnings) ? body.warnings : [] },
    };
  } catch {
    return { ok: false, status: res.status, message: 'The server returned an unreadable response. Please try again.' };
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
