import { describe, expect, it } from "vitest";
import { summarizeNode } from "../nodeSummary";
import fixture from "./aiProposal.fixture.json";

describe("summarizeNode", () => {
  it("summarizes each node type by the settings that matter", () => {
    expect(summarizeNode("aws_instance.web_server_1", { instanceType: "t3.small", rootVolumeSize: 50 })).toBe("t3.small · 50 GB");
    expect(summarizeNode("aws_s3_bucket_1", { versioningEnabled: true })).toBe("versioning");
    expect(summarizeNode("aws_s3_bucket_1", { versioningEnabled: false })).toBe("no versioning");
    expect(summarizeNode("aws_db_instance_1", { instanceClass: "db.t3.small", allocatedStorage: 50 })).toBe("db.t3.small · 50 GB");
    expect(summarizeNode("aws_vpc_1_1", { cidrBlock: "10.20.0.0/16" })).toBe("10.20.0.0/16");
    expect(summarizeNode("aws_subnet_1", { cidrBlock: "10.20.1.0/24", availabilityZone: "us-east-1b" })).toBe("10.20.1.0/24 · us-east-1b");
    expect(summarizeNode("apt_install_1", { packages: "git, jq, unzip" })).toBe("git, jq, unzip");
    expect(summarizeNode("create_user_1", { username: "deployer" })).toBe("deployer");
    expect(summarizeNode("systemd_service_1", { serviceName: "nginx", state: "started" })).toBe("nginx · started");
    expect(summarizeNode("open-port_1", { port: "8080" })).toBe("port 8080");
    expect(summarizeNode("postgresql_1", { dbUser: "postgres", dbPass: "hunter2" })).toBe("user postgres");
  });

  it("shows posture only when the setting is on, and says PUBLIC loudly", () => {
    expect(summarizeNode("aws_s3_bucket_1", { versioningEnabled: true, blockPublicAccess: true, encryptionEnabled: true })).toBe("versioning · private · encrypted");
    // A bucket saved before these settings existed makes no claim about them.
    expect(summarizeNode("aws_s3_bucket_1", { versioningEnabled: true })).toBe("versioning");
    expect(summarizeNode("aws_s3_bucket_1", { versioningEnabled: true, blockPublicAccess: false })).toBe("versioning");
    expect(summarizeNode("aws_db_instance_1", { instanceClass: "db.t3.micro", allocatedStorage: 20, multiAz: true, storageEncrypted: true })).toBe("db.t3.micro · 20 GB · multi-AZ · encrypted");
    expect(summarizeNode("aws_db_instance_1", { instanceClass: "db.t3.micro", allocatedStorage: 20, publiclyAccessible: true })).toBe("db.t3.micro · 20 GB · PUBLIC");
    expect(summarizeNode("aws_db_instance_1", { instanceClass: "db.t3.micro", allocatedStorage: 20, publiclyAccessible: false })).toBe("db.t3.micro · 20 GB");
  });

  it("describes a security group by its ports, SSH and CIDR", () => {
    expect(summarizeNode("aws_security_group_1", { httpPort: 8080, httpsPort: 8443, sshEnabled: true, allowedCidr: "10.0.0.0/8" })).toBe("8080, 8443 · SSH · 10.0.0.0/8");
    expect(summarizeNode("aws_security_group_1", { sshEnabled: false })).toBe("80, 443 · no SSH");
    // A node edited through the fallback "ingress ports" field still reads sensibly.
    expect(summarizeNode("aws_security_group_1", { ingressPorts: "80, 443, 22" })).toBe("ports 80, 443, 22 · SSH");
  });

  it("accepts numbers that arrive as strings and ignores junk", () => {
    expect(summarizeNode("aws_instance.web_server_1", { instanceType: "t3.micro", rootVolumeSize: "30" })).toBe("t3.micro · 30 GB");
    expect(summarizeNode("aws_instance.web_server_1", { instanceType: "", rootVolumeSize: "lots" })).toBe("");
  });

  it("never shows credentials, even if they are present", () => {
    const secrets = { password: "SuperSecurePassword123!", dbPass: "s3cr3t-db-pass-xyz", token: "tok-9f8e7d", secretKey: "sk-live-abc123", accessKey: "AKIAEXAMPLE0000" };
    for (const id of ["aws_db_instance_1", "postgresql_1", "aws_instance.web_server_1", "aws_s3_bucket_1"]) {
      const line = summarizeNode(id, { ...secrets, instanceClass: "db.t3.micro", dbUser: "postgres" });
      for (const value of Object.values(secrets)) expect(line).not.toContain(value);
    }
  });

  it("returns an empty string when there is nothing worth showing", () => {
    expect(summarizeNode("nginx_1", { ansibleHost: "", ansibleUser: "ubuntu" })).toBe("");
    expect(summarizeNode("update-packages_1", {})).toBe("");
    expect(summarizeNode("some_custom_node", { a: 1 })).toBe("");
    expect(summarizeNode("aws_vpc_1", undefined)).toBe("");
    expect(summarizeNode("aws_vpc_1", null)).toBe("");
    expect(summarizeNode("aws_vpc_1", "not an object")).toBe("");
  });

  it("keeps a long value bounded", () => {
    const line = summarizeNode("apt_install_1", { packages: "x".repeat(500) });
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith("…")).toBe(true);
  });

  it("gives every node in a real AI proposal that has settings a non-empty line", () => {
    const nodes = (fixture as { nodes: Array<{ id: string; data: { parameters: unknown } }> }).nodes;
    const withLine = nodes.filter((n) => summarizeNode(n.id, n.data.parameters) !== "");
    // update-packages, nginx and nodejs carry only host details; everything else shows something.
    expect(withLine.length).toBeGreaterThanOrEqual(nodes.length - 3);
    for (const n of withLine) expect(summarizeNode(n.id, n.data.parameters)).not.toMatch(/undefined|NaN|\[object/);
  });
});
