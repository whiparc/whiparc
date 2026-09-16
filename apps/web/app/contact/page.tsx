import { StaticPageLayout } from '../components/StaticPageLayout';

export default function ContactPage() {
  return (
    <StaticPageLayout eyebrow="Contact" title="Get in touch">
      <p>
        The fastest way to reach the people working on Whiparc is GitHub — open an{' '}
        <a
          href="https://github.com/whiparc/whiparc/issues"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 underline decoration-indigo-400/30 hover:decoration-indigo-400/60"
        >
          issue
        </a>{' '}
        for bugs, or start a{' '}
        <a
          href="https://github.com/whiparc/whiparc/discussions"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 underline decoration-indigo-400/30 hover:decoration-indigo-400/60"
        >
          discussion
        </a>{' '}
        for questions, feature requests, or anything else.
      </p>
      <p>
        We don&apos;t yet have a dedicated support inbox — GitHub is the primary channel while
        the project is this size, and it means your question or report is visible to the whole
        community, not stuck in a private queue.
      </p>
    </StaticPageLayout>
  );
}
