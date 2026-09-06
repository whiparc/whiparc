'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import ProfileMenu from '../components/ProfileMenu';

function CodeBlock({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const legacyCopy = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  };

  const handleCopy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      } else {
        ok = legacyCopy(code);
      }
    } catch {
      ok = legacyCopy(code);
    }
    setStatus(ok ? 'copied' : 'error');
    setTimeout(() => setStatus('idle'), 1600);
  };

  return (
    <div className="relative">
      <pre className="bg-card border border-border p-4 pr-12 rounded-xl text-xs font-mono overflow-x-auto text-slate-300">
        {code}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : 'Copy command'}
        title={status === 'error' ? 'Copy failed — select the text manually' : undefined}
        className={`absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg border transition-all cursor-pointer ${
          status === 'copied'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : status === 'error'
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : 'border-border bg-secondary/80 text-slate-400 hover:text-primary hover:border-primary/40 hover:bg-secondary'
        }`}
      >
        <Icon icon={status === 'copied' ? 'lucide:check' : status === 'error' ? 'lucide:x' : 'lucide:copy'} className="text-sm" />
      </button>
    </div>
  );
}

const NAV_SECTIONS = [
  {
    group: 'Getting Started',
    items: [
      { id: 'intro', label: 'Introduction', icon: 'lucide:book-open' },
      { id: 'install', label: 'Installation Guide', icon: 'lucide:download' },
    ],
  },
  {
    group: 'Local Sandbox Agent',
    items: [
      { id: 'sandbox-intro', label: 'Why a Local Sandbox?', icon: 'lucide:server' },
      { id: 'sandbox-setup', label: 'Setup & Pairing', icon: 'lucide:link' },
      { id: 'sandbox-commands', label: 'Command Reference', icon: 'lucide:terminal' },
      { id: 'sandbox-troubleshooting', label: 'Troubleshooting', icon: 'lucide:life-buoy' },
    ],
  },
  {
    group: 'CLI Commands',
    items: [
      { id: 'auth', label: 'Authentication', icon: 'lucide:key-round' },
      { id: 'projects', label: 'Projects CRUD', icon: 'lucide:folder-git-2' },
      { id: 'import', label: 'Importing Code', icon: 'lucide:upload-cloud' },
      { id: 'deploy', label: 'Deploy & Runs', icon: 'lucide:play-circle' },
    ],
  },
];

export default function DocsPage() {
  const { user, hasHydrated } = useAuthStore();
  const isLoggedIn = hasHydrated && !!user;

  const [activeTab, setActiveTab] = useState<'windows' | 'macos' | 'linux'>('windows');
  const [activeSection, setActiveSection] = useState<string>('intro');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const API_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:8080';
  const downloadBaseUrl = `${API_URL}/downloads`;

  const downloadLinks = {
    windows: `${downloadBaseUrl}/infracanvas-windows-amd64.exe`,
    macosSilicon: `${downloadBaseUrl}/infracanvas-darwin-arm64`,
    macosIntel: `${downloadBaseUrl}/infracanvas-darwin-amd64`,
    linux: `${downloadBaseUrl}/infracanvas-linux-amd64`,
  };

  return (
    <div className="min-h-screen w-full bg-background text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-primary/35 selection:text-white">
      {/* BACKGROUND GRADIENTS */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute left-1/4 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl"></div>
        <div className="absolute bottom-10 right-1/4 h-96 w-96 rounded-full bg-amber-500/5 blur-3xl"></div>
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="flex min-w-0 items-center gap-3 hover:opacity-90 transition">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-md">
                <div className="h-4 w-4 rounded-md bg-gradient-to-br from-primary to-amber-500"></div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-wide text-white">Whiparc</p>
                <p className="truncate text-xs text-slate-400">Documentation</p>
              </div>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link href="/" className="hidden text-sm text-slate-400 hover:text-white transition mr-2 sm:inline-block sm:mr-4">
              Back to Home
            </Link>
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 transition sm:px-4">
                  Dashboard
                </Link>
                <ProfileMenu variant="compact" />
              </>
            ) : (
              <Link href="/login" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-white shadow-md hover:bg-secondary transition sm:px-4">
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* MOBILE SECTION NAV */}
        <div className="border-t border-border/80 lg:hidden">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <button
              onClick={() => setMobileNavOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 py-3 text-sm font-medium text-white cursor-pointer"
              aria-expanded={mobileNavOpen}
            >
              <span className="flex items-center gap-2">
                <Icon
                  icon={NAV_SECTIONS.flatMap((g) => g.items).find((i) => i.id === activeSection)?.icon ?? 'lucide:book-open'}
                  className="text-base text-primary"
                />
                {NAV_SECTIONS.flatMap((g) => g.items).find((i) => i.id === activeSection)?.label ?? 'Introduction'}
              </span>
              <Icon icon="lucide:chevron-down" className={`text-base text-slate-400 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
            </button>

            {mobileNavOpen && (
              <nav className="flex flex-col gap-5 pb-4">
                {NAV_SECTIONS.map((group) => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group.group}</p>
                    <ul className="mt-2 space-y-1">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <button
                            onClick={() => {
                              setActiveSection(item.id);
                              setMobileNavOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition cursor-pointer ${activeSection === item.id ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:bg-secondary hover:text-slate-100'}`}
                          >
                            <Icon icon={item.icon} className="text-base" />
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:flex-row lg:px-10">
        {/* SIDEBAR NAVIGATION (desktop) */}
        <aside className="hidden w-64 shrink-0 lg:block border-r border-border/80 pr-8">
          <nav className="sticky top-28 flex flex-col gap-6">
            {NAV_SECTIONS.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group.group}</p>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition cursor-pointer ${activeSection === item.id ? 'bg-primary/10 text-primary font-medium' : 'text-slate-400 hover:bg-secondary hover:text-slate-100'}`}
                      >
                        <Icon icon={item.icon} className="text-base" />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* DOCS CONTENT */}
        <main className="min-w-0 flex-1 lg:pl-10 max-w-3xl">
          {/* SECTION 1: INTRO */}
          {activeSection === 'intro' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Whiparc CLI</h1>
              <p className="text-lg text-slate-400 leading-relaxed">
                The Whiparc Command-Line Interface (`infracanvas`) is a powerful tool designed to integrate visual configuration layouts directly with native infrastructure-as-code manifests. With the CLI, platform teams can synchronize local directories, query workspace settings, and stream deployment pipelines from their local terminals or CI/CD pipelines.
              </p>

              <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md">
                <h3 className="text-base font-semibold text-white">Main Capabilities</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-400">
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:check-circle-2" className="text-primary mt-0.5 shrink-0 text-base" />
                    <span><strong>Code Reverse-Parsing</strong>: Recursively parse Terraform HCL, Ansible YAML, and Kubernetes manifests into canvas visual blocks.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:check-circle-2" className="text-primary mt-0.5 shrink-0 text-base" />
                    <span><strong>Live WebSocket Sync</strong>: Sync changes locally and see the browser visual canvas update in real-time.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:check-circle-2" className="text-primary mt-0.5 shrink-0 text-base" />
                    <span><strong>Deployment Logs Stream</strong>: Pipe pipeline output straight to terminal stdout.</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setActiveSection('install')}
                  className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-3.5 text-sm font-semibold text-white transition flex items-center gap-2 cursor-pointer"
                >
                  Proceed to Installation
                  <Icon icon="lucide:arrow-right" />
                </button>
              </div>
            </section>
          )}

          {/* SECTION 2: INSTALL */}
          {activeSection === 'install' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Installation Guide</h1>
              <p className="text-slate-400">
                Choose your platform below to download and configure the standalone `infracanvas` CLI tool.
              </p>

              {/* DOWNLOAD GATE */}
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon icon="lucide:download-cloud" className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Download Executables</h3>
                    <p className="text-xs text-slate-400">Always compiled with the latest stable CLI changes.</p>
                  </div>
                </div>

                {isLoggedIn ? (
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <a
                      href={downloadLinks.windows}
                      download
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium hover:bg-secondary hover:border-border transition"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="logos:microsoft-windows" className="text-base" />
                        Windows 64-bit
                      </span>
                      <Icon icon="lucide:arrow-down-to-line" className="text-slate-500" />
                    </a>
                    <a
                      href={downloadLinks.macosSilicon}
                      download
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium hover:bg-secondary hover:border-border transition"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="logos:apple" className="text-base text-white" />
                        macOS (Apple M1/M2/M3)
                      </span>
                      <Icon icon="lucide:arrow-down-to-line" className="text-slate-500" />
                    </a>
                    <a
                      href={downloadLinks.macosIntel}
                      download
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium hover:bg-secondary hover:border-border transition"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="logos:apple" className="text-base" />
                        macOS (Intel Core)
                      </span>
                      <Icon icon="lucide:arrow-down-to-line" className="text-slate-500" />
                    </a>
                    <a
                      href={downloadLinks.linux}
                      download
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium hover:bg-secondary hover:border-border transition"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="logos:linux-tux" className="text-base" />
                        Linux 64-bit
                      </span>
                      <Icon icon="lucide:arrow-down-to-line" className="text-slate-500" />
                    </a>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background p-6 text-center">
                    <Icon icon="lucide:lock" className="text-slate-600 text-3xl mb-2" />
                    <p className="text-sm text-slate-400 mb-4">You must be logged in to download compiled binaries.</p>
                    <Link
                      href="/login"
                      className="rounded-lg bg-primary hover:bg-primary/90 px-5 py-2.5 text-xs font-semibold text-white transition"
                    >
                      Sign In to Download
                    </Link>
                  </div>
                )}
              </div>

              {/* INSTALL TABS */}
              <div className="mt-8">
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setActiveTab('windows')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === 'windows' ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                  >
                    Windows
                  </button>
                  <button
                    onClick={() => setActiveTab('macos')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === 'macos' ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                  >
                    macOS
                  </button>
                  <button
                    onClick={() => setActiveTab('linux')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === 'linux' ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                  >
                    Linux
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  {activeTab === 'windows' && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400">
                        1. Download `infracanvas-windows-amd64.exe` using the link above.
                      </p>
                      <p className="text-sm text-slate-400">
                        2. Create a folder (e.g. `C:\tools\infracanvas`) and move the downloaded binary into it, renaming it to `infracanvas.exe`.
                      </p>
                      <p className="text-sm text-slate-400">
                        3. Add `C:\tools\infracanvas` to your User **Environment Variables PATH**:
                      </p>
                      <CodeBlock code={'[System.Environment]::SetEnvironmentVariable("PATH", $env:Path + ";C:\\tools\\infracanvas", "User")'} />
                      <p className="text-sm text-slate-400">
                        4. Restart your terminal and verify the installation:
                      </p>
                      <CodeBlock code="infracanvas --help" />
                    </div>
                  )}

                  {activeTab === 'macos' && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400">
                        1. Download the macOS binary matching your system architecture (Apple Silicon M1/M2/M3 vs Intel Core).
                      </p>
                      <p className="text-sm text-slate-400">
                        2. Move the binary into your local executable search PATH:
                      </p>
                      <CodeBlock code="sudo mv ~/Downloads/infracanvas-darwin-arm64 /usr/local/bin/infracanvas" />
                      <p className="text-sm text-slate-400">
                        3. Give the binary execute permissions:
                      </p>
                      <CodeBlock code="chmod +x /usr/local/bin/infracanvas" />
                      <p className="text-sm text-slate-400">
                        4. Run command check to verify:
                      </p>
                      <CodeBlock code="infracanvas --help" />
                    </div>
                  )}

                  {activeTab === 'linux' && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400">
                        1. Download `infracanvas-linux-amd64`.
                      </p>
                      <p className="text-sm text-slate-400">
                        2. Move the binary into `/usr/local/bin`:
                      </p>
                      <CodeBlock code="sudo mv ~/Downloads/infracanvas-linux-amd64 /usr/local/bin/infracanvas" />
                      <p className="text-sm text-slate-400">
                        3. Grant execution rights:
                      </p>
                      <CodeBlock code="chmod +x /usr/local/bin/infracanvas" />
                      <p className="text-sm text-slate-400">
                        4. Verify installation:
                      </p>
                      <CodeBlock code="infracanvas --help" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setActiveSection('sandbox-intro')}
                  className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-3.5 text-sm font-semibold text-white transition flex items-center gap-2 cursor-pointer"
                >
                  Next: Set Up Your Local Sandbox
                  <Icon icon="lucide:arrow-right" />
                </button>
              </div>
            </section>
          )}

          {/* SECTION 2B: SANDBOX INTRO */}
          {activeSection === 'sandbox-intro' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Why a Local Sandbox?</h1>
              <p className="text-lg text-slate-400 leading-relaxed">
                Every deploy that targets the built-in sandbox (LocalStack + simulated SSH targets, no real cloud account needed) has to run *somewhere*. Historically that meant Whiparc’s own servers — free for you, but a real, unbounded compute cost on our side for every user who never upgrades. The <strong>Sandbox Agent</strong> moves that compute onto your own machine instead: a small `infracanvas` process opens an outbound connection to Whiparc, and your deploys run against Docker containers on your own laptop or workstation, driven the exact same way from the visual canvas.
              </p>

              <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md space-y-3">
                <h3 className="text-base font-semibold text-white">What actually changes</h3>
                <ul className="space-y-3 text-sm text-slate-400">
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:check-circle-2" className="text-primary mt-0.5 shrink-0 text-base" />
                    <span>Deploys, destroys, and log streaming from the canvas work exactly as before — the Runner still does everything it always did, it just reaches your machine through a tunnel instead of a container on the same host.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:check-circle-2" className="text-primary mt-0.5 shrink-0 text-base" />
                    <span>Your machine needs Docker running while you’re deploying (see the Docker Desktop note below) — nothing else changes about how you use the canvas.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Icon icon="lucide:alert-triangle" className="text-amber-400 mt-0.5 shrink-0 text-base" />
                    <span>On the Free plan, sandbox deploys may require a paired Agent — the workspace header shows a notice before this ever blocks you, with time to set one up. Pro plans keep the hosted sandbox with no local Docker requirement at all.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md space-y-2">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Icon icon="logos:docker-icon" className="text-lg" /> Docker Desktop licensing
                </h3>
                <p className="text-sm text-slate-400">
                  Docker Desktop is free for individuals, small businesses, education, and open-source use — but requires a paid subscription at larger companies. If that applies to you, <strong>Podman</strong>, <strong>Colima</strong>, and <strong>Rancher Desktop</strong> are all compatible alternatives; the sandbox only needs a working Docker-compatible socket, not Docker Desktop specifically.
                </p>
                <p className="text-sm text-slate-400 pt-1">
                  <strong>Windows</strong> users: Docker Desktop with the WSL2 backend is the supported path. Most “it just doesn’t work” reports on Windows trace back to WSL2 not being enabled, not Whiparc itself.
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setActiveSection('sandbox-setup')}
                  className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-3.5 text-sm font-semibold text-white transition flex items-center gap-2 cursor-pointer"
                >
                  Continue to Setup & Pairing
                  <Icon icon="lucide:arrow-right" />
                </button>
              </div>
            </section>
          )}

          {/* SECTION 2C: SANDBOX SETUP */}
          {activeSection === 'sandbox-setup' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Setup & Pairing</h1>
              <p className="text-slate-400">
                One command brings up the local sandbox containers and pairs an Agent to a project — no repository checkout needed, just the CLI binary from the Installation Guide.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">1. Log in</h3>
                <CodeBlock code="infracanvas login" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">2. Enable the Sandbox Agent</h3>
                <p className="text-sm text-slate-400">This is an opt-in beta feature — enable it once per machine:</p>
                <CodeBlock code="infracanvas config set sandbox-agent-beta true" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">3. Bring up the sandbox</h3>
                <p className="text-sm text-slate-400">
                  Find your project ID from its URL in the dashboard (<code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">/workspace/&lt;project-id&gt;</code>), then run:
                </p>
                <CodeBlock code="infracanvas sandbox up --project <project-id>" />
                <p className="text-sm text-slate-400">
                  This generates a fresh SSH keypair for this installation, builds and starts the local sandbox containers via Docker, registers the key with Whiparc, and pairs an Agent — all in one step, no browser approval needed. You’ll see output like:
                </p>
                <CodeBlock code={`Generating per-installation SSH keypair for agent-a1b2c3d4...
Building and starting local sandbox containers (docker compose)...
Registering agent key with Whiparc...
Registered agent agent-a1b2c3d4 (key fingerprint: SHA256:...)
Pairing with the Agent Gateway...
Starting the local Agent process...
Waiting for the Agent to connect...
Agent agent-a1b2c3d4 is now ACTIVE. Sandbox is ready.`} />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">4. Deploy from the canvas</h3>
                <p className="text-sm text-slate-400">
                  Open the project’s workspace — a green “Agent Connected” badge appears in the header. Deploy as usual; sandbox-targeted nodes now run through your machine instead of a hosted container.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Icon icon="lucide:info" className="text-primary text-base" /> Custom Gateway URL
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  The CLI defaults to a local Gateway at <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">http://localhost:9090</code> (for testing against a locally-run stack). Against a real deployment, set the actual Gateway URL first:
                </p>
                <CodeBlock code="infracanvas config set gateway-url https://gateway.<your-domain>" />
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setActiveSection('sandbox-commands')}
                  className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-3.5 text-sm font-semibold text-white transition flex items-center gap-2 cursor-pointer"
                >
                  See the Full Command Reference
                  <Icon icon="lucide:arrow-right" />
                </button>
              </div>
            </section>
          )}

          {/* SECTION 2D: SANDBOX COMMAND REFERENCE */}
          {activeSection === 'sandbox-commands' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Sandbox Command Reference</h1>
              <p className="text-slate-400">
                The full `infracanvas sandbox` subcommand group, once paired via the Setup & Pairing steps above.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">Check connection status</h3>
                <p className="text-sm text-slate-400">Shows the paired Agent’s ID, connection status (<code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">PENDING</code> / <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">ACTIVE</code> / <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">DISCONNECTED</code>), and last-seen time — the first thing to check when a deploy isn’t reaching your sandbox:</p>
                <CodeBlock code="infracanvas sandbox status" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Pause the sandbox</h3>
                <p className="text-sm text-slate-400">Stops the local sandbox containers and the Agent process, but keeps your pairing — running `sandbox up` again later reconnects the <em>same</em> agent instead of registering a new one. Downloaded container images stay cached too, so the next `up` is fast:</p>
                <CodeBlock code="infracanvas sandbox down" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Retire an agent for good</h3>
                <p className="text-sm text-slate-400">
                  Add <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">--revoke</code> to also revoke the agent server-side and clear its local pairing state — use this when you’re done with a machine for good, not just stepping away. A future `sandbox up` will pair a brand-new agent instead of trying to reconnect this one:
                </p>
                <CodeBlock code="infracanvas sandbox down --revoke" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Run the Agent as a background service</h3>
                <p className="text-sm text-slate-400">
                  By default the Agent process from `sandbox up` runs only as long as your session does. Install it as a persistent OS service (a systemd user unit on Linux, a launchd agent on macOS, or a Windows Service) so it survives reboots without needing to re-run `sandbox up`:
                </p>
                <CodeBlock code="infracanvas sandbox agent install" />
                <p className="text-sm text-slate-400">
                  Windows requires an elevated (Administrator) shell to install/uninstall the service; Linux and macOS don’t. Re-running <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">install</code> replaces any prior registration in place — safe to re-run after re-pairing to a different project.
                </p>
                <CodeBlock code="infracanvas sandbox agent uninstall" />
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md">
                <h3 className="text-base font-semibold text-white">Managing paired Agents</h3>
                <p className="text-sm text-slate-400 mt-2">
                  A project’s <strong>Settings → Sandbox Agents</strong> tab lists every Agent ever paired to it and lets a project Editor or Admin revoke one — the paired machine is disconnected immediately and its pairing token is invalidated. Useful when replacing a machine or removing access from someone who no longer needs it. A developer can also revoke their own agent directly from the machine it’s paired to with <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">infracanvas sandbox down --revoke</code>, without needing project-owner access.
                </p>
              </div>
            </section>
          )}

          {/* SECTION 2E: SANDBOX TROUBLESHOOTING */}
          {activeSection === 'sandbox-troubleshooting' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Troubleshooting</h1>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">“Sandbox Agent is an opt-in beta”</h3>
                <p className="text-sm text-slate-400">Every `sandbox` subcommand needs the beta flag enabled once per machine:</p>
                <CodeBlock code="infracanvas config set sandbox-agent-beta true" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Agent status stuck on PENDING</h3>
                <p className="text-sm text-slate-400">
                  Pairing was registered but the Agent process hasn’t connected yet — usually a Docker or network issue on your machine. Check <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">docker ps</code> for the sandbox containers and confirm your machine can reach the Gateway URL from `infracanvas config set gateway-url`.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Agent shows DISCONNECTED, deploys are rejected</h3>
                <p className="text-sm text-slate-400">
                  A connection that was working can drop from sleep, WiFi changes, or a VPN reconnecting — this is normal for a machine-hosted tunnel, not a sign something is broken. Deploys are rejected outright while disconnected rather than hanging against a dead connection. Reconnection is automatic (with backoff); re-run <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">infracanvas sandbox status</code> after a minute, or `infracanvas sandbox up` again if it doesn’t recover.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">“This project’s local Sandbox Agent is not connected”</h3>
                <p className="text-sm text-slate-400">
                  A deploy or destroy pre-flight check rejecting a request because the paired Agent is <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">PENDING</code> or <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">DISCONNECTED</code> — this is deliberate, so a run never silently falls back to a different target than the one you intended. Reconnect the Agent, or revoke it under Project Settings → Sandbox Agents to deploy without it instead (falls back to the hosted sandbox, where available for your plan).
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">“Free-tier sandbox deploys now run through your own machine…”</h3>
                <p className="text-sm text-slate-400">
                  Your plan and signup date put you past the local-sandbox migration window. Follow Setup & Pairing above to pair an Agent, or upgrade to Pro to keep using the hosted sandbox with no local Docker requirement.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Docker daemon not found</h3>
                <p className="text-sm text-slate-400">
                  `sandbox up` needs a running Docker-compatible daemon. Confirm Docker Desktop (or Podman/Colima/Rancher Desktop) is actually running before retrying — see the Docker Desktop licensing note on the “Why a Local Sandbox?” page for alternatives if Docker Desktop isn’t an option at your company.
                </p>
              </div>
            </section>
          )}

          {/* SECTION 3: AUTH */}
          {activeSection === 'auth' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Authentication</h1>
              <p className="text-slate-400">
                To link commands to your user accounts and target workspace permission boundaries, authenticate your CLI instance.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">Login</h3>
                <p className="text-sm text-slate-400">
                  Run the login sub-command. The program will prompt for your account email and password securely, then query and write your session token:
                </p>
                <CodeBlock code="infracanvas login" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Logout</h3>
                <p className="text-sm text-slate-400">
                  To clear your locally cached credentials and end the session:
                </p>
                <CodeBlock code="infracanvas logout" />
              </div>
            </section>
          )}

          {/* SECTION 4: PROJECTS */}
          {activeSection === 'projects' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Workspace Projects CRUD</h1>
              <p className="text-slate-400">
                Query, initialize, or delete visual workspace canvas projects using the `projects` subcommand.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">List Projects</h3>
                <CodeBlock code="infracanvas projects list" />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Create a Project</h3>
                <p className="text-sm text-slate-400">Initialize a new project workspace by name:</p>
                <CodeBlock code='infracanvas projects create --name "My VPC Stack" --visibility PRIVATE' />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Delete a Project</h3>
                <CodeBlock code='infracanvas projects delete --id "my-vpc-stack-id" --force' />
              </div>
            </section>
          )}

          {/* SECTION 5: IMPORT */}
          {activeSection === 'import' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Importing IaC Code</h1>
              <p className="text-slate-400">
                You can import existing code configurations directly into your visual workspace. The engine automatically maps resource structures into nodes/edges and auto-arranges layout coordinates.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">Import a Single File</h3>
                <p className="text-sm text-slate-400">Upload and parse a single Terraform or Kubernetes configuration:</p>
                <CodeBlock code='infracanvas import --project "VPC-Stack" --file "./terraform/main.tf"' />
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Import a Directory</h3>
                <p className="text-sm text-slate-400">Recursively scan and import all configurations from a target directory:</p>
                <CodeBlock code='infracanvas import --project "VPC-Stack" --dir "./deployments/"' />
              </div>
            </section>
          )}

          {/* SECTION 6: DEPLOY */}
          {activeSection === 'deploy' && (
            <section className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Deploy & Logs Streaming</h1>
              <p className="text-slate-400">
                Deploy pipelines from the visual canvas and stream execution logs directly to your shell.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">Execute Deployment Pipeline</h3>
                <CodeBlock code='infracanvas deploy --project "VPC-Stack"' />
                <p className="text-sm text-slate-400 mt-2">
                  This command connects to the deployment tracker socket, streaming all progress logs sequentially and printing them in real-time.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="text-base font-semibold text-white">Deploy with Auto-Destroy</h3>
                <p className="text-sm text-slate-400">To spin up testing systems and tear them down immediately upon execution completion:</p>
                <CodeBlock code='infracanvas deploy --project "VPC-Stack" --auto-destroy' />
              </div>
            </section>
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-border/80 bg-background/80 py-8 relative z-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>© 2026 Whiparc. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/" className="hover:text-slate-300 transition">Home</Link>
            <span className="cursor-not-allowed">Terms</span>
            <span className="cursor-not-allowed">Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
