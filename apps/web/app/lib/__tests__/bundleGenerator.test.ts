import { describe, expect, it } from "vitest";
import { generateBundleFiles, generateTerraformFiles } from "../bundleGenerator";
import { awsTarget, ec2, edge, installNginx, node, updatePackages } from "./fixtures";

const fullCanvas = () => ({
  nodes: [awsTarget(), ec2({ instanceType: "t3.small" }), updatePackages(), installNginx()],
  edges: [edge("aws_target_1", "aws_instance.web_server_1")],
});

describe("generateTerraformFiles", () => {
  it("does not throw on an empty canvas and falls back to the local sandbox target", () => {
    const { mainTf } = generateTerraformFiles([], []);
    expect(mainTf).toContain('provider "aws"');
    expect(mainTf).toContain("http://localhost:4566");
  });

  it("uses the region and instance type configured on the canvas", () => {
    const { nodes, edges } = fullCanvas();
    const { mainTf, variablesTf } = generateTerraformFiles(nodes, edges);
    expect(mainTf).toContain('region = "eu-west-1"');
    expect(mainTf).toContain('resource "aws_instance" "web_server"');
    expect(mainTf).toContain('instance_type = "t3.small"');
    expect(variablesTf).toContain('default     = "eu-west-1"');
  });

  it("points the provider and state backend at LocalStack for the sandbox target", () => {
    const { mainTf } = generateTerraformFiles([awsTarget("localstack", "us-east-1"), ec2()], []);
    expect(mainTf).toContain("http://localhost:4566");
    expect(mainTf).toContain('backend "s3"');
  });

  it("uses plain provider settings and no local backend for a real AWS target", () => {
    const { mainTf } = generateTerraformFiles([awsTarget("aws"), ec2()], []);
    expect(mainTf).not.toContain("localhost:4566");
    expect(mainTf).not.toContain('backend "s3"');
  });

  it("adds the Google provider and its variables for a GCP target", () => {
    const gcp = node("gcp_target_1", {
      tech: "Target",
      label: "GCP Target",
      region: "europe-west1",
      gcpZone: "europe-west1-b",
      projectId: "demo-project",
    });
    const { mainTf, variablesTf } = generateTerraformFiles([gcp], []);
    expect(mainTf).toContain("hashicorp/google");
    expect(mainTf).toContain('provider "google"');
    expect(variablesTf).toContain('variable "gcp_project_id"');
    expect(variablesTf).toContain("demo-project");
    expect(variablesTf).toContain("europe-west1-b");
  });
});

describe("generateTerraformFiles with several servers", () => {
  const server = (id: string, name: string) =>
    node(id, { tech: "Terraform", label: name, parameters: { instanceName: name } });
  const keyPairBlocks = (tf: string) => tf.match(/^resource "aws_key_pair" "whiparc_key"/gm) ?? [];

  it("writes the shared key pair once, however many servers there are", () => {
    for (const count of [1, 2, 3]) {
      const nodes = [awsTarget(), ...Array.from({ length: count }, (_, i) => server(`aws_instance.web_server_${i + 1}`, `web_${i + 1}`))];
      const { mainTf } = generateTerraformFiles(nodes, []);
      expect(keyPairBlocks(mainTf), `${count} servers`).toHaveLength(1);
      // Each server still uses it.
      expect(mainTf.match(/key_name\s+= aws_key_pair\.whiparc_key\.key_name/g) ?? []).toHaveLength(count);
    }
  });

  it("gives every server its own resource and no duplicate resource labels", () => {
    const { mainTf } = generateTerraformFiles(
      [awsTarget(), server("aws_instance.web_server_1", "web_a"), server("aws_instance.web_server_2", "web_b")],
      [],
    );
    expect(mainTf).toContain('resource "aws_instance" "web_a"');
    expect(mainTf).toContain('resource "aws_instance" "web_b"');
    const labels = [...mainTf.matchAll(/^resource "([a-z0-9_]+)" "([^"]+)"/gm)].map((m) => `${m[1]}.${m[2]}`);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it("writes no key pair when there is no server", () => {
    expect(keyPairBlocks(generateTerraformFiles([awsTarget()], []).mainTf)).toHaveLength(0);
  });

  it("is unchanged for a single server: the key pair comes right before it", () => {
    const { mainTf } = generateTerraformFiles([awsTarget(), ec2()], []);
    expect(mainTf.indexOf('resource "aws_key_pair"')).toBeGreaterThan(-1);
    expect(mainTf.indexOf('resource "aws_key_pair"')).toBeLessThan(mainTf.indexOf('resource "aws_instance"'));
  });
});

describe("generateBundleFiles", () => {
  it("produces the documented bundle layout", () => {
    const { nodes, edges } = fullCanvas();
    const paths = generateBundleFiles(nodes, edges).map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "terraform/main.tf",
        "terraform/variables.tf",
        "terraform/outputs.tf",
        "ansible/playbook.yml",
        "ansible/hosts.ini",
        "README.md",
      ]),
    );
  });

  it("reports line counts that match the file content", () => {
    const { nodes, edges } = fullCanvas();
    for (const file of generateBundleFiles(nodes, edges)) {
      expect(file.lines).toBe(file.content.split("\n").length);
    }
  });

  it("includes the Ansible tasks for connected Ansible nodes", () => {
    const { nodes, edges } = fullCanvas();
    const playbook = generateBundleFiles(nodes, edges).find((f) => f.path === "ansible/playbook.yml");
    expect(playbook?.content).toContain("Install Nginx Web Server");
    expect(playbook?.content).toContain("Update apt cache");
  });

  it("is deterministic for the same canvas", () => {
    const { nodes, edges } = fullCanvas();
    expect(generateBundleFiles(nodes, edges)).toEqual(generateBundleFiles(nodes, edges));
  });

  it("carries only current branding in generated output", () => {
    const { nodes, edges } = fullCanvas();
    const all = generateBundleFiles(nodes, edges)
      .map((f) => f.content)
      .join("\n");
    expect(all).toContain("Generated by Whiparc");
    expect(all).not.toMatch(/infraflow|infracanvas|project alpha/i);
  });
});

// Posture settings added after the first release. They are opt-in on the value
// (=== true): a node saved before they existed has no such key and must keep
// producing exactly the Terraform it always did.
describe("generateTerraformFiles posture settings", () => {
  const s3 = (parameters: Record<string, unknown>) =>
    node("aws_s3_bucket_1", { tech: "Terraform", label: "Object Storage (S3)", parameters: { bucketName: "uploads", ...parameters } });
  const rds = (parameters: Record<string, unknown>) =>
    node("aws_db_instance_1", { tech: "Terraform", label: "Relational Database (RDS)", parameters: { dbName: "appdb", ...parameters } });
  const tf = (...nodes: ReturnType<typeof node>[]) => generateTerraformFiles([awsTarget(), ...nodes], []).mainTf;

  it("blocks public access and encrypts a bucket created with the new defaults", () => {
    const out = tf(s3({ blockPublicAccess: true, encryptionEnabled: true }));
    expect(out).toContain('resource "aws_s3_bucket_public_access_block" "uploads_public_access"');
    expect(out).toContain("restrict_public_buckets = true");
    expect(out).toContain('resource "aws_s3_bucket_server_side_encryption_configuration" "uploads_encryption"');
    expect(out).toContain('sse_algorithm = "AES256"');
    // Versioning, the public-access block and the encryption each attach to this bucket.
    expect(out.match(/bucket\s+= aws_s3_bucket\.uploads\.id/g)).toHaveLength(3);
  });

  it("leaves a bucket saved before these settings existed exactly as it was", () => {
    const legacy = tf(s3({ forceDestroy: true, versioningEnabled: true }));
    expect(legacy).not.toContain("aws_s3_bucket_public_access_block");
    expect(legacy).not.toContain("aws_s3_bucket_server_side_encryption_configuration");
    expect(legacy).toContain('resource "aws_s3_bucket" "uploads"');
    expect(legacy).toContain('resource "aws_s3_bucket_versioning" "uploads_versioning"');
  });

  it("writes nothing for a setting the user turned off", () => {
    const out = tf(s3({ blockPublicAccess: false, encryptionEnabled: false }));
    expect(out).not.toContain("aws_s3_bucket_public_access_block");
    expect(out).not.toContain("aws_s3_bucket_server_side_encryption_configuration");
  });

  it("gives two buckets their own posture resources with no duplicate labels", () => {
    const a = s3({ bucketName: "assets", blockPublicAccess: true, encryptionEnabled: true });
    const b = node("aws_s3_bucket_2", { tech: "Terraform", label: "S3", parameters: { bucketName: "logs", blockPublicAccess: true, encryptionEnabled: true } });
    const out = tf(a, b);
    const labels = [...out.matchAll(/^resource "([a-z0-9_]+)" "([^"]+)"/gm)].map((m) => `${m[1]}.${m[2]}`);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("aws_s3_bucket_public_access_block.assets_public_access");
    expect(labels).toContain("aws_s3_bucket_public_access_block.logs_public_access");
  });

  it("encrypts, exposes and replicates a database only when asked", () => {
    const on = tf(rds({ storageEncrypted: true, multiAz: true, publiclyAccessible: true }));
    expect(on).toContain("storage_encrypted = true");
    expect(on).toContain("multi_az = true");
    expect(on).toContain("publicly_accessible = true");

    for (const off of [{}, { storageEncrypted: false, multiAz: false, publiclyAccessible: false }]) {
      const out = tf(rds(off));
      expect(out).not.toContain("storage_encrypted");
      expect(out).not.toContain("multi_az");
      expect(out).not.toContain("publicly_accessible");
      expect(out).toContain('resource "aws_db_instance" "appdb"');
    }
  });

  it("keeps the database block well formed with every option on", () => {
    const out = tf(rds({ storageEncrypted: true, multiAz: true, publiclyAccessible: true }));
    const block = out.slice(out.indexOf('resource "aws_db_instance"'));
    const body = block.slice(0, block.indexOf("\n}\n") + 2);
    expect((body.match(/{/g) ?? []).length).toBe((body.match(/}/g) ?? []).length);
    expect(body).toMatch(/skip_final_snapshot = true\n  storage_encrypted = true\n  multi_az = true\n  publicly_accessible = true\n}/);
  });
});
