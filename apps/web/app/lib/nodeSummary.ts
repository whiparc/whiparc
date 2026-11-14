// nodeSummary turns a node's parameters into one short line of the settings that
// matter at a glance ("t3.small · 50 GB"), for the AI review list and the canvas
// card. It is display only: it reads parameters and never writes them.
//
// It is an allow-list. Only the keys named below are ever shown, so a credential
// (a database password, a key, a token) cannot reach the screen by being added
// to a node later. Nodes whose settings are not worth a line (the Ansible tasks
// that take only host details) return an empty string.

type Params = Record<string, unknown>;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const count = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

// A package list or other free text can be long; the card truncates visually,
// this keeps the tooltip and the review row bounded as well.
const MAX_LEN = 80;
const clip = (s: string) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s);

const gb = (v: unknown) => {
  const n = count(v);
  return n === undefined ? undefined : `${n} GB`;
};

// Matched by node ID prefix, like the rest of the workspace, because layout and
// copying append suffixes (aws_vpc_1_1). More specific prefixes come first.
const SUMMARIES: Array<[prefix: string, summarize: (p: Params) => Array<string | undefined>]> = [
  ['aws_instance.web_server', (p) => [text(p.instanceType), gb(p.rootVolumeSize)]],
  [
    'aws_security_group',
    (p) => {
      const custom = text(p.ingressPorts);
      const legacyOnly = p.httpPort === undefined && p.httpsPort === undefined && custom;
      const ports = legacyOnly ? `ports ${custom}` : `${count(p.httpPort) ?? 80}, ${count(p.httpsPort) ?? 443}`;
      return [ports, p.sshEnabled === false ? 'no SSH' : 'SSH', text(p.allowedCidr)];
    },
  ],
  [
    'aws_s3_bucket',
    // The posture words appear only when the setting is on. A bucket saved before
    // these settings existed has neither key, so it shows no claim about them.
    (p) => [p.versioningEnabled === false ? 'no versioning' : 'versioning', p.blockPublicAccess === true ? 'private' : undefined, p.encryptionEnabled === true ? 'encrypted' : undefined],
  ],
  [
    'aws_db_instance',
    (p) => [
      text(p.instanceClass),
      count(p.allocatedStorage) === undefined ? undefined : `${count(p.allocatedStorage)} GB`,
      p.multiAz === true ? 'multi-AZ' : undefined,
      p.storageEncrypted === true ? 'encrypted' : undefined,
      // Shown in capitals on purpose: this is the one setting that exposes a database.
      p.publiclyAccessible === true ? 'PUBLIC' : undefined,
    ],
  ],
  ['aws_vpc', (p) => [text(p.cidrBlock)]],
  ['aws_subnet', (p) => [text(p.cidrBlock), text(p.availabilityZone)]],
  ['apt_install', (p) => [text(p.packages)]],
  ['create_user', (p) => [text(p.username)]],
  ['systemd_service', (p) => [text(p.serviceName), text(p.state)]],
  ['open-port', (p) => [count(p.port) === undefined ? undefined : `port ${count(p.port)}`]],
  ['postgresql', (p) => [text(p.dbUser) ? `user ${text(p.dbUser)}` : undefined]],
];

export function summarizeNode(nodeId: string, parameters: unknown): string {
  if (!parameters || typeof parameters !== 'object') return '';
  const entry = SUMMARIES.find(([prefix]) => nodeId.startsWith(prefix));
  if (!entry) return '';
  const parts = entry[1](parameters as Params).filter((s): s is string => !!s);
  return clip(parts.join(' · '));
}
