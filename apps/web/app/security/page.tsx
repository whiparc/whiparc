import { StaticPageLayout } from '../components/StaticPageLayout';

export default function SecurityPage() {
  return (
    <StaticPageLayout eyebrow="Legal" title="Security">
      <p>
        Cloud credentials you register on a project are encrypted at rest, not stored in
        plaintext, and scoped to that project. Authentication uses signed tokens verified on
        every request.
      </p>
      <p>
        We haven&apos;t pursued formal certifications like SOC 2 — if that&apos;s a hard
        requirement for your team, the self-hosted BSL 1.1 core lets you run Whiparc entirely on
        infrastructure you control instead of a hosted account.
      </p>
      <p>
        Found a vulnerability? Please report it privately through a{' '}
        <a
          href="https://github.com/whiparc/whiparc/security/advisories/new"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 underline decoration-indigo-400/30 hover:decoration-indigo-400/60"
        >
          GitHub Security Advisory
        </a>{' '}
        on the repo rather than a public issue, so it can be fixed before it&apos;s disclosed.
      </p>
    </StaticPageLayout>
  );
}
