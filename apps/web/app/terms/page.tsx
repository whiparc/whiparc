import { StaticPageLayout } from '../components/StaticPageLayout';

export default function TermsPage() {
  return (
    <StaticPageLayout eyebrow="Legal" title="Terms of use">
      <p>
        Use Whiparc to design, simulate, and deploy infrastructure you own or are authorized to
        manage. Don&apos;t use it to attack, abuse, or gain unauthorized access to systems that
        aren&apos;t yours.
      </p>
      <p>
        The self-hosted core is licensed under the Business Source License 1.1 — free to
        self-host, not resellable as a competing hosted service. The CLI and sandbox tooling are
        MIT. See LICENSE and NOTICE.md in the repo for the exact terms.
      </p>
      <p>
        Paid tiers (Team, Enterprise) are billed as described on the pricing page. If something
        looks wrong with your billing, reach us on{' '}
        <a
          href="https://github.com/whiparc/whiparc"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 underline decoration-indigo-400/30 hover:decoration-indigo-400/60"
        >
          GitHub
        </a>
        .
      </p>
      <p>
        The service is provided as-is, without warranty, while it&apos;s under active
        development. See the Security page for how we handle vulnerabilities.
      </p>
    </StaticPageLayout>
  );
}
