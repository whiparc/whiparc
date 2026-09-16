import { StaticPageLayout } from '../components/StaticPageLayout';

export default function PrivacyPage() {
  return (
    <StaticPageLayout eyebrow="Legal" title="Privacy">
      <p>
        <strong className="text-slate-300">What we collect.</strong> Your name, email address,
        and an authentication credential (a hashed password or an OAuth token) to operate your
        account. We don&apos;t collect anything beyond what&apos;s needed to run the product.
      </p>
      <p>
        <strong className="text-slate-300">Sandbox runs.</strong> Local sandbox simulations run
        entirely in Docker containers on your own machine (or a hosted sandbox on paid tiers) and
        are torn down when the run finishes. Nothing about your sandbox infrastructure is sent
        anywhere else.
      </p>
      <p>
        <strong className="text-slate-300">Cloud credentials.</strong> Any cloud credentials you
        register on a project are encrypted at rest and used only to run deployments you
        explicitly trigger.
      </p>
      <p>
        <strong className="text-slate-300">Sharing.</strong> We don&apos;t sell your data, and we
        don&apos;t share it with third parties beyond what&apos;s required to run the service
        itself (e.g. payment processing for paid tiers).
      </p>
      <p>
        This is a small, actively developed project rather than a large company with a dedicated
        legal team — if you have questions about this policy, reach us on{' '}
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
    </StaticPageLayout>
  );
}
