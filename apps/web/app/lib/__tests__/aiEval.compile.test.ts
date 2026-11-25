// Second stage of the AI-mode evaluation (see apps/api/cmd/aieval).
//
// The Go side checks that a model's answer is catalog-legal. This checks that
// what passed also compiles: each validated proposal goes through the real
// Terraform and Ansible generators, the ones users actually hit. Skipped unless
// AI_EVAL_RESULTS points at a results file, so it never runs in normal test runs.
//
//   cd apps/api && go run ./cmd/aieval -provider mock
//   cd apps/web && AI_EVAL_RESULTS=../api/aieval-results.json npx vitest run app/lib/__tests__/aiEval.compile.test.ts

import { readFileSync } from "node:fs";
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { generateBundleFiles, generateTerraformFiles } from "../bundleGenerator";
import { generateAnsibleYAML } from "../exportYaml";

interface Run {
  id: string;
  category: string;
  outcome: string;
  nodes?: Node[];
  edges?: Edge[];
}

const resultsPath = process.env.AI_EVAL_RESULTS;
const runs: Run[] = resultsPath ? (JSON.parse(readFileSync(resultsPath, "utf8")).runs ?? []) : [];
const proposals = runs.filter((r) => r.nodes?.length && r.edges);

// Catalog ID to the Terraform resource type its generator emits.
const RESOURCE_FOR: Record<string, string> = {
  aws_vpc: "aws_vpc",
  aws_subnet: "aws_subnet",
  aws_security_group: "aws_security_group",
  aws_s3_bucket: "aws_s3_bucket",
  aws_db_instance: "aws_db_instance",
  "aws_instance.web_server": "aws_instance",
};

const typeOf = (id: string) =>
  Object.keys(RESOURCE_FOR)
    .concat(["update-packages", "nginx", "nodejs", "postgresql", "open-port", "apt_install", "create_user", "systemd_service"])
    .filter((t) => id.startsWith(`${t}_`))
    .sort((a, b) => b.length - a.length)[0];

// A line whose double quotes do not pair up is how an injected value would show up.
const unbalancedQuotes = (text: string) =>
  text.split("\n").filter((line) => ((line.replace(/\\"/g, "").match(/"/g) ?? []).length % 2) === 1);

describe.skipIf(!resultsPath)("validated AI proposals compile with the real generators", () => {
  it("has proposals to check", () => {
    expect(
      proposals.length,
      "The results file has no validated proposals. The evaluation itself failed (see its summary, e.g. provider errors); there is nothing to compile.",
    ).toBeGreaterThan(0);
  });

  it.each(proposals.map((r, i) => [`${r.id}#${i}`, r] as const))("%s", (_name, run) => {
    const nodes = run.nodes!;
    const edges = run.edges!;

    const { mainTf } = generateTerraformFiles(nodes, edges);
    const yaml = generateAnsibleYAML(nodes, edges);
    const bundle = generateBundleFiles(nodes, edges);
    expect(bundle.length).toBeGreaterThan(0);

    for (const text of [mainTf, yaml]) {
      expect(text).not.toMatch(/undefined|NaN|\[object Object\]/);
    }

    // Every Terraform block on the canvas produced its resource.
    const types = nodes.map((n) => typeOf(n.id)).filter(Boolean);
    for (const t of new Set(types)) {
      if (RESOURCE_FOR[t]) expect(mainTf, `${t} missing from main.tf`).toContain(`resource "${RESOURCE_FOR[t]}"`);
    }

    // Resource labels are unique, which is what Terraform requires.
    const labels = [...mainTf.matchAll(/^resource "([a-z0-9_]+)" "([^"]+)"/gm)].map((m) => `${m[1]}.${m[2]}`);
    // No exceptions: the shared key pair used to be written once per server and
    // was tolerated here; it is now written once, so any duplicate is a real defect.
    const duplicated = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect(duplicated, "duplicate Terraform resources").toEqual([]);

    // Ansible tasks exist for Ansible blocks, in a playbook that has a host line.
    const ansibleNodes = types.filter((t) => !RESOURCE_FOR[t]);
    if (ansibleNodes.length > 0) {
      expect(yaml).toContain("hosts:");
      expect((yaml.match(/^\s*- name:/gm) ?? []).length).toBeGreaterThanOrEqual(ansibleNodes.length);
    }

    // No injected value broke out of its quotes.
    expect(unbalancedQuotes(mainTf), "unbalanced quotes in main.tf").toEqual([]);
    expect(unbalancedQuotes(yaml), "unbalanced quotes in playbook").toEqual([]);
  });
});
