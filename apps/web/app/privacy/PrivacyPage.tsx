'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { spaceGroteskFont, barlowFont, jetBrainsMonoFont } from '../fonts';
import { THEME_PALETTES, type Theme } from '../components/ui/theme-palette';
import { BrandLogo } from '../components/brand/BrandLogo';

// Bump when the policy text changes in a way users should notice.
const LAST_UPDATED = '24 November 2026';

const h2Style: CSSProperties = {
  margin: '44px 0 12px',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontSize: 20,
  letterSpacing: '-.01em',
  color: 'var(--ink)',
};

const pStyle: CSSProperties = { margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink2)' };
const listStyle: CSSProperties = { ...pStyle, paddingLeft: 20 };
const codeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono-marketing), ui-monospace, monospace',
  fontSize: 12.5,
  padding: '1px 5px',
  background: 'var(--elevated)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code style={codeStyle}>{children}</code>;
}

const cliRows: { command: string; sent: string }[] = [
  { command: 'whiparc login', sent: 'The email and password you type, sent once to exchange for a session token. The password is not stored by the CLI.' },
  { command: 'whiparc projects', sent: 'Project names and identifiers needed to list, create or delete a workspace.' },
  { command: 'whiparc import', sent: 'The Terraform / YAML files you point it at, parsed locally and uploaded to the project you choose.' },
  { command: 'whiparc deploy', sent: 'A request to run the deployment pipeline for a project you can access.' },
  { command: 'whiparc sandbox', sent: 'Opt-in beta. Pairing and connection status for a local Sandbox Agent, via the hosted gateway.' },
  { command: 'whiparc config / logout / --version / --help', sent: 'Nothing. These run locally. logout clears the stored token.' },
];

export default function PrivacyPage() {
  const [theme, setTheme] = useState<Theme>('dark');
  const palette = THEME_PALETTES[theme];
  const rootVars = useMemo(
    () => ({ ...palette, background: palette['--ground'], color: palette['--ink'] }) as CSSProperties,
    [palette]
  );

  return (
    <div
      className={`${spaceGroteskFont.variable} ${barlowFont.variable} ${jetBrainsMonoFont.variable}`}
      style={{
        ...rootVars,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background .3s ease, color .3s ease',
        fontFamily: 'var(--font-body-marketing), system-ui, sans-serif',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px,4vw,40px)', borderBottom: '1px solid var(--line)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <BrandLogo size={26} style={{ color: 'var(--ink)' }} />
        </Link>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          title="Toggle theme"
          aria-label="Toggle theme"
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink2)', cursor: 'pointer' }}
        >
          <Icon icon={theme === 'light' ? 'lucide:moon' : 'lucide:sun'} width={15} />
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '56px clamp(20px,4vw,40px) 96px', boxSizing: 'border-box' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-mono-marketing)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
          Last updated {LAST_UPDATED}
        </p>
        <h1 style={{ margin: '10px 0 18px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, letterSpacing: '-.02em', color: 'var(--ink)' }}>
          Privacy Policy
        </h1>
        <p style={pStyle}>
          This policy explains what personal data Whiparc collects when you use the website at whiparc.com, the hosted
          service behind it (<C>api.whiparc.com</C> and <C>gateway.whiparc.com</C>), and the Whiparc command-line tool (CLI), why we
          collect it, who else handles it, and the controls you have. It does not cover self-hosted deployments: if you run
          Whiparc on your own infrastructure, your data stays there and is governed by whoever operates that instance.
        </p>

        <Section id="collect" title="1. What we collect">
          <p style={pStyle}>We collect only what the product needs to work:</p>
          <ul style={listStyle}>
            <li><strong>Account data.</strong> Your email address, display name, and a bcrypt hash of your password. If you sign in with Google or GitHub, we store the provider identity linked to your account, not your provider password.</li>
            <li><strong>Workspace content.</strong> Projects, canvases and their saved snapshots, custom nodes, templates you author or contribute, and the pipeline run history for your projects.</li>
            <li><strong>Cloud credentials you add.</strong> Credentials you give the credential vault so deployments can run. They are stored encrypted (AES-256-GCM) and used only to run your own deployments.</li>
            <li><strong>Teams.</strong> Team and project membership, invitations (including the invitee&apos;s email address), and join requests.</li>
            <li><strong>Activity.</strong> Dashboard activity events such as who changed or ran what in a project, visible to your team.</li>
            <li><strong>Billing.</strong> Subscription state and the identifiers that link your team to our payment provider. We do not receive or store your card number.</li>
            <li><strong>Things you send us.</strong> Messages submitted through the contact form, newsletter sign-ups, emails sent to us, and an avatar if you upload one.</li>
            <li><strong>Technical data.</strong> The IP address of a request is used to rate-limit sign-in and similar endpoints. Your browser keeps your signed-in session and interface preferences (such as your current team) in local storage.</li>
          </ul>
          <p style={pStyle}>
            We do not use advertising trackers or third-party analytics scripts on the website, and we do not sell personal data.
          </p>
        </Section>

        <Section id="cli" title="2. The Whiparc CLI">
          <p style={pStyle}>
            The CLI contacts the hosted service only when you run a command that needs it. It has no background telemetry,
            usage reporting or crash reporting. By default it talks to <C>https://api.whiparc.com</C>; the opt-in Sandbox
            beta also uses <C>https://gateway.whiparc.com</C>. You can point it at another server with{' '}
            <C>--api-url</C> or the <C>config</C> command.
          </p>
          <div style={{ border: '1px solid var(--line)', margin: '0 0 14px' }}>
            {cliRows.map((row, i) => (
              <div key={row.command} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6, padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                <span><C>{row.command}</C></span>
                <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink2)' }}>{row.sent}</span>
              </div>
            ))}
          </div>
          <p style={pStyle}>
            After <C>whiparc login</C> the CLI saves a session token in <C>.whiparc/config.json</C> in your home directory.{' '}
            <C>whiparc logout</C> removes it. The Windows installer is per-user and writes only to your user profile.
          </p>
        </Section>

        <Section id="use" title="3. How we use data">
          <ul style={listStyle}>
            <li>To provide the service: authenticate you, store and sync your workspaces, run the deployments you start, and show your team its activity.</li>
            <li>To send transactional email: address verification, password resets, email-change confirmation and team invitations.</li>
            <li>To process payments and manage subscriptions.</li>
            <li>To protect the service: rate limiting and abuse prevention.</li>
            <li>To respond to messages you send us, and to send the newsletter only if you subscribed to it.</li>
          </ul>
        </Section>

        <Section id="share" title="4. Who else handles your data">
          <p style={pStyle}>We use a small number of providers to run the service, each only for the purpose below:</p>
          <ul style={listStyle}>
            <li><strong>Paddle</strong> processes subscription payments and acts as merchant of record. Checkout happens on Paddle&apos;s own pages and overlay.</li>
            <li><strong>Resend</strong> delivers transactional email.</li>
            <li><strong>Google and GitHub</strong> authenticate you only if you choose to sign in with them.</li>
            <li><strong>Your own cloud providers.</strong> When you run a deployment, Whiparc uses the credentials you supplied to call the provider you selected, such as AWS. That traffic is between the runner and your provider.</li>
            <li><strong>Your teammates.</strong> Anything in a shared project is visible to that project&apos;s members according to their role.</li>
          </ul>
          <p style={pStyle}>We may also disclose data when the law requires it or to protect the security of the service and its users.</p>
        </Section>

        <Section id="retention" title="5. Retention, export and deletion">
          <p style={pStyle}>
            We keep your data while your account is active. You can download a copy of your account data from your account
            page and delete your account there as well. Deleting an account removes the user record, linked sign-in
            identities, avatar, and the projects, canvases, snapshots, custom nodes, stored credentials and paired agents
            that belong to it, along with teams you own. A team you own must first have its other members removed and any
            live paid subscription cancelled. Copies held by our payment and email providers, and routine backups, are
            removed on their own schedules.
          </p>
        </Section>

        <Section id="security" title="6. Security">
          <p style={pStyle}>
            Passwords are hashed with bcrypt, cloud credentials are encrypted at rest, and the hosted endpoints are served
            over HTTPS. No system is perfectly secure. Report a vulnerability through the process in our{' '}
            <a href="https://github.com/whiparc/whiparc/blob/main/SECURITY.md" style={{ color: 'var(--accent-ink)' }}>security policy</a>.
          </p>
        </Section>

        <Section id="rights" title="7. Your choices and rights">
          <p style={pStyle}>
            Depending on where you live, you may have the right to access, correct, export, delete or restrict the
            processing of your personal data, and to object to it. Most of this is available directly in your account
            settings; for anything else, contact us using the details below and we will respond within a reasonable time.
            You can unsubscribe from the newsletter at any time using the link in any issue.
          </p>
        </Section>

        <Section id="children" title="8. Children">
          <p style={pStyle}>Whiparc is a developer tool and is not directed at children. We do not knowingly collect data from children.</p>
        </Section>

        <Section id="changes" title="9. Changes to this policy">
          <p style={pStyle}>
            When we change this policy we will update the date at the top of this page. For material changes affecting
            registered users we will also notify them by email.
          </p>
        </Section>

        <Section id="contact" title="10. Contact">
          <p style={pStyle}>
            Questions or requests about your data: use the <Link href="/contact" style={{ color: 'var(--accent-ink)' }}>contact form</Link>.
          </p>
        </Section>
      </main>
    </div>
  );
}
