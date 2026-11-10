import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { fetchAIStatus, generateProposal, mergeProposal, parseNotes } from "../aiGenerate";
import { generateAnsibleYAML } from "../exportYaml";
import { generateTerraformFiles } from "../bundleGenerator";
import fixture from "./aiProposal.fixture.json";

// aiProposal.fixture.json is real output of the Go side (mock model, then the
// validator, then the layout step) for "node api with a postgres database and
// an s3 bucket". It pins the contract between server and client.
const proposal = fixture as unknown as { nodes: Node[]; edges: Edge[]; warnings: unknown[]; notes: string[] };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("proposal contract with the generators", () => {
  it("carries the fields the canvas and generators read", () => {
    expect(proposal.nodes.length).toBeGreaterThan(5);
    for (const n of proposal.nodes) {
      const d = n.data as Record<string, unknown>;
      expect(n.type).toBe("customNode");
      expect(typeof d.label).toBe("string");
      expect(["Terraform", "Ansible"]).toContain(d.tech);
      expect(String(d.icon)).toMatch(/^lucide:/);
      expect(d.parameters).toBeTypeOf("object");
      expect(n.position.y).toBeGreaterThan(0);
    }
    // Nothing code-carrying or credential-carrying is ever proposed.
    for (const n of proposal.nodes) {
      const d = n.data as Record<string, unknown>;
      expect(d.isCustom).toBeFalsy();
      expect(d.rawCode).toBeFalsy();
      expect(d.credentialId ?? "").toBe("");
    }
  });

  it("compiles to Terraform without gaps or duplicate resource labels", () => {
    const { mainTf } = generateTerraformFiles(proposal.nodes, proposal.edges);
    for (const type of ["aws_vpc", "aws_subnet", "aws_security_group", "aws_instance", "aws_db_instance", "aws_s3_bucket"]) {
      expect(mainTf).toContain(`resource "${type}"`);
    }
    expect(mainTf).not.toMatch(/undefined|NaN|\[object Object\]/);

    const labels = [...mainTf.matchAll(/^resource "([a-z0-9_]+)" "([^"]+)"/gm)].map((m) => `${m[1]}.${m[2]}`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("compiles to an Ansible playbook in dependency order", () => {
    const yaml = generateAnsibleYAML(proposal.nodes, proposal.edges);
    expect(yaml).toContain("hosts:");
    expect(yaml).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(yaml.indexOf("Update apt cache")).toBeGreaterThan(-1);
    expect(yaml.indexOf("Update apt cache")).toBeLessThan(yaml.toLowerCase().indexOf("node"));
  });
});

describe("mergeProposal", () => {
  const node = (id: string): Node => ({ id, type: "customNode", position: { x: 0, y: 0 }, data: {} });
  const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

  it("appends the proposal after existing content", () => {
    const merged = mergeProposal([node("keep")], [], { nodes: [node("a"), node("b")], edges: [edge("e1", "a", "b")] });
    expect(merged.nodes.map((n) => n.id)).toEqual(["keep", "a", "b"]);
    expect(merged.edges).toHaveLength(1);
  });

  it("renames clashing IDs and follows the rename in edges", () => {
    const merged = mergeProposal([node("nginx_1")], [], {
      nodes: [node("nginx_1"), node("vm_1")],
      edges: [edge("e", "vm_1", "nginx_1")],
    });
    const ids = merged.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["nginx_1", "nginx_1_1", "vm_1"]);
    expect(merged.edges[0]).toMatchObject({ source: "vm_1", target: "nginx_1_1" });
  });

  it("keeps edge IDs unique and never mutates its inputs", () => {
    const existingNodes = [node("a")];
    const existingEdges = [edge("e_x_y", "p", "q")];
    const prop = { nodes: [node("x"), node("y")], edges: [edge("whatever", "x", "y")] };
    const before = JSON.stringify([existingNodes, existingEdges, prop]);
    const merged = mergeProposal(existingNodes, existingEdges, prop);
    expect(merged.edges.map((e) => e.id)).toEqual(["e_x_y", "e_x_y_1"]);
    expect(JSON.stringify([existingNodes, existingEdges, prop])).toBe(before);
  });

  it("keeps the real fixture valid when merged onto a canvas that already holds its IDs", () => {
    const merged = mergeProposal(proposal.nodes, proposal.edges, proposal);
    const ids = merged.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of merged.edges) {
      expect(ids).toContain(e.source);
      expect(ids).toContain(e.target);
    }
  });
});

describe("fetchAIStatus", () => {
  it("reports enabled only for an explicit true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { enabled: true, maxPromptLength: 1500 })));
    expect(await fetchAIStatus("t")).toEqual({ enabled: true, maxPromptLength: 1500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { enabled: "yes" })));
    expect((await fetchAIStatus("t")).enabled).toBe(false);
  });

  it("falls back to disabled on errors and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect((await fetchAIStatus("t")).enabled).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect((await fetchAIStatus("t")).enabled).toBe(false);
  });

  it("sends the bearer token", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { enabled: false }));
    vi.stubGlobal("fetch", f);
    await fetchAIStatus("tok");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
});

describe("generateProposal", () => {
  it("posts the prompt and returns the proposal", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, proposal));
    vi.stubGlobal("fetch", f);
    const res = await generateProposal("proj/1", "tok", "a web app");
    expect(res.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain("/api/projects/proj%2F1/ai/generate");
    expect(JSON.parse(init.body)).toEqual({ prompt: "a web app" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("defaults warnings to an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { nodes: [], edges: [] })));
    const res = await generateProposal("p", "t", "x");
    expect(res.ok && res.proposal.warnings).toEqual([]);
  });

  it("defaults notes to an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { nodes: [], edges: [] })));
    const res = await generateProposal("p", "t", "x");
    expect(res.ok && res.proposal.notes).toEqual([]);
  });

  it("returns the model's notes with a proposal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ...proposal, notes: ["No Kubernetes."] })));
    const res = await generateProposal("p", "t", "x");
    expect(res.ok && res.proposal.notes).toEqual(["No Kubernetes."]);
  });

  it("carries the notes of a refusal so the user learns why nothing was built", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: "Try rephrasing it.", notes: ["Google Cloud is not available."] })));
    expect(await generateProposal("p", "t", "x")).toEqual({
      ok: false,
      status: 422,
      message: "Try rephrasing it.",
      notes: ["Google Cloud is not available."],
    });
  });

  it("surfaces the server's message for failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: "Try rephrasing it." })));
    expect(await generateProposal("p", "t", "x")).toEqual({ ok: false, status: 422, message: "Try rephrasing it.", notes: [] });
  });

  it("has sensible messages when the body has no error text", async () => {
    for (const [status, text] of [[403, /edit access/], [429, /Too many/], [500, /went wrong/]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status })));
      const res = await generateProposal("p", "t", "x");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(text);
    }
  });

  it("rejects a malformed success body instead of throwing", async () => {
    for (const body of [{ nodes: "x", edges: [] }, { edges: [] }, "text"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, body)));
      const res = await generateProposal("p", "t", "x");
      expect(res.ok).toBe(false);
    }
  });

  it("reports network failures and cancellation without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await generateProposal("p", "t", "x")).toMatchObject({ ok: false, status: 0 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    expect(await generateProposal("p", "t", "x")).toMatchObject({ ok: false, message: "Cancelled." });
  });
});

describe("parseNotes", () => {
  it("keeps only non-empty strings", () => {
    expect(parseNotes(["a", "", "  ", 3, null, { x: 1 }, "b"])).toEqual(["a", "b"]);
  });

  it("returns an empty list for anything that is not a list", () => {
    for (const v of [undefined, null, "text", 7, { 0: "a" }]) expect(parseNotes(v)).toEqual([]);
  });

  it("applies the count limit again", () => {
    expect(parseNotes(["1", "2", "3", "4", "5", "6", "7"])).toEqual(["1", "2", "3", "4", "5"]);
  });
});
