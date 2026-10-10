import type { Edge, Node } from "@xyflow/react";

/** Minimal canvas node: the compilers only read `id` and `data`. */
export function node(id: string, data: Record<string, unknown>): Node {
  return { id, position: { x: 0, y: 0 }, data };
}

export function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target };
}

export const awsTarget = (environment: "aws" | "localstack" = "aws", region = "eu-west-1") =>
  node("aws_target_1", { tech: "Target", label: "AWS Target", environment, region });

export const ec2 = (parameters: Record<string, unknown> = {}) =>
  node("aws_instance.web_server_1", { tech: "Terraform", label: "Virtual Machine (EC2)", parameters });

export const updatePackages = () =>
  node("update-packages-1", { tech: "Ansible", label: "Update Packages" });

export const installNginx = () =>
  node("nginx-1", { tech: "Ansible", label: "Install Nginx" });
