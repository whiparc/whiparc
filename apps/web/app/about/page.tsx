import { StaticPageLayout } from '../components/StaticPageLayout';

export default function AboutPage() {
  return (
    <StaticPageLayout eyebrow="About" title="What Whiparc is">
      <p>
        Whiparc is a visual compiler for infrastructure. Draw Terraform, Ansible, and Kubernetes
        resources on one canvas, and it writes the real HCL, YAML, and manifests behind them —
        then runs that against a free local sandbox so you can watch it succeed or fail before
        anything touches a real cloud account.
      </p>
      <p>
        The core canvas, compilers, and runner are source-available under BSL 1.1; the CLI and
        sandbox tooling are MIT. The full license breakdown lives in the repo&apos;s NOTICE.md.
      </p>
      <p>
        It&apos;s a small, actively developed project rather than a large company with a
        dedicated support org. If you hit something broken or missing, GitHub Discussions and
        Issues are the fastest way to reach whoever&apos;s working on it.
      </p>
    </StaticPageLayout>
  );
}
