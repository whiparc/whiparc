'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Icon } from '@iconify/react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useAuthStore } from './store/useAuthStore';
import ProfileMenu from './components/ProfileMenu';
import { TiltCard } from './components/landing/TiltCard';
import { heroDisplayFont } from './fonts';

// WebGL needs the browser, so the shader background is loaded client-only.
const HeroShaderField = dynamic(
  () => import('./components/landing/HeroShaderField').then((m) => m.HeroShaderField),
  { ssr: false, loading: () => null }
);

// --- Animation Variants ---

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1 },
};

const EASE = [0.22, 1, 0.36, 1] as const;

// --- Navbar ---

function Navbar() {
  const { user, hasHydrated } = useAuthStore();
  const isLoggedIn = hasHydrated && !!user;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-10">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-background/60 px-6 py-3 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-lg shadow-indigo-500/20">
              <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 15h5M14 19h5" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-wide text-white">Whiparc</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            <a href="#features" className="text-sm text-slate-400 transition hover:text-white">Features</a>
            <a href="#how-it-works" className="text-sm text-slate-400 transition hover:text-white">How it works</a>
            <a href="#pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</a>
            <Link href="/docs" className="text-sm text-slate-400 transition hover:text-white">Docs</Link>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 lg:flex">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer">
                  Dashboard
                </Link>
                <ProfileMenu variant="compact" />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-400 transition hover:text-white cursor-pointer">
                  Sign in
                </Link>
                <Link href="/login?mode=signup" className="rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95 cursor-pointer">
                  Get Started Free
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] lg:hidden cursor-pointer"
            aria-label="Toggle Menu"
          >
            <Icon icon={mobileOpen ? 'lucide:x' : 'lucide:menu'} className="text-lg text-white" />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 rounded-2xl border border-white/[0.06] bg-background/90 p-6 shadow-2xl backdrop-blur-xl lg:hidden"
          >
            <nav className="flex flex-col gap-4">
              <a href="#features" onClick={() => setMobileOpen(false)} className="text-sm text-slate-400 hover:text-white transition">Features</a>
              <a href="#how-it-works" onClick={() => setMobileOpen(false)} className="text-sm text-slate-400 hover:text-white transition">How it works</a>
              <a href="#pricing" onClick={() => setMobileOpen(false)} className="text-sm text-slate-400 hover:text-white transition">Pricing</a>
              <Link href="/docs" onClick={() => setMobileOpen(false)} className="text-sm text-slate-400 hover:text-white transition">Docs</Link>
              <hr className="border-white/[0.06]" />
              {isLoggedIn ? (
                <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 py-3 text-sm font-semibold text-white cursor-pointer">Dashboard</Link>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl border border-white/[0.06] py-3 text-sm font-semibold text-white cursor-pointer">Sign in</Link>
                  <Link href="/login?mode=signup" onClick={() => setMobileOpen(false)} className="w-full text-center rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 py-3 text-sm font-semibold text-white cursor-pointer">Get Started Free</Link>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </div>
    </header>
  );
}

// --- Hero Section ---

type HeadlineWord = { text: string };

const LINE_ONE: HeadlineWord[] = [{ text: 'Design' }, { text: 'infrastructure.' }];
const LINE_THREE: HeadlineWord[] = [{ text: 'Deploy' }, { text: 'anywhere.' }];
const TYPED_LINE_TEXT = 'Generate code.';

const WORD_STEP = 0.09;
const TYPING_START = LINE_ONE.length * WORD_STEP + 0.2;
const TYPING_CHAR_STEP = 0.045;
const TYPING_DURATION = TYPED_LINE_TEXT.length * TYPING_CHAR_STEP;
const LINE_THREE_START = TYPING_START + TYPING_DURATION + 0.15;

const wordReveal = {
  hidden: { opacity: 0, y: 34, rotateX: -70, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' },
};
const wordRevealFlat = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function WordLine({
  words,
  startDelay,
  reduceMotion,
}: {
  words: HeadlineWord[];
  startDelay: number;
  reduceMotion: boolean | null;
}) {
  const variant = reduceMotion ? wordRevealFlat : wordReveal;
  return (
    <span className="block" style={{ transformStyle: 'preserve-3d' }}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial="hidden"
          animate="show"
          variants={variant}
          transition={{ duration: 0.65, delay: startDelay + i * WORD_STEP, ease: EASE }}
          className="inline-block will-change-transform"
          style={{ transformStyle: 'preserve-3d', marginRight: '0.28em' }}
        >
          {word.text}
        </motion.span>
      ))}
    </span>
  );
}

// The generated-code line types itself out, terminal-style, instead of
// fading in — it's the one line about the product actually writing code.
function TypedCodeLine({ reduceMotion }: { reduceMotion: boolean | null }) {
  const chars = React.useMemo(() => TYPED_LINE_TEXT.split(''), []);

  return (
    <span className="block">
      <span className="relative inline-flex flex-wrap bg-gradient-to-r from-indigo-400 via-amber-300 to-indigo-400 bg-clip-text text-transparent">
        {chars.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.01, delay: reduceMotion ? 0 : TYPING_START + i * TYPING_CHAR_STEP }}
            className="inline-block"
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
        {!reduceMotion && (
          <motion.span
            aria-hidden
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{
              duration: 0.55,
              repeat: Infinity,
              repeatType: 'reverse',
              delay: TYPING_START,
              ease: 'easeInOut',
            }}
            className="ml-1 inline-block w-[0.09em] translate-y-[0.05em] bg-amber-300"
            style={{ height: '0.85em' }}
          />
        )}
      </span>
    </span>
  );
}

function AnimatedHeadline({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <h1
      className="text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]"
      style={{ perspective: 800 }}
    >
      <WordLine words={LINE_ONE} startDelay={0} reduceMotion={reduceMotion} />
      <TypedCodeLine reduceMotion={reduceMotion} />
      <WordLine words={LINE_THREE} startDelay={LINE_THREE_START} reduceMotion={reduceMotion} />
    </h1>
  );
}

function HeroSection() {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // Layered parallax: the 3D graph and glow drift at different rates than
  // the copy as the hero scrolls out, which is what sells the depth.
  const graphY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 140]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 70]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -70]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      ref={heroRef}
      className="relative isolate flex min-h-screen items-center justify-center overflow-hidden pt-20"
    >
      {/* Minimal animated shader background */}
      <motion.div className="absolute inset-0" style={{ y: graphY }}>
        <HeroShaderField />
      </motion.div>

      {/* Gradient overlays */}
      <motion.div className="pointer-events-none absolute inset-0" style={{ y: glowY }}>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-indigo-500/8 via-amber-500/6 to-indigo-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#07080B] to-transparent" />
      </motion.div>

      {/* Content */}
      <motion.div
        className="relative z-10 mx-auto max-w-4xl px-6 text-center"
        initial="hidden"
        animate="show"
        variants={staggerContainer}
        style={{ y: contentY, opacity: contentOpacity }}
      >
        {/* Badge */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-indigo-500/20 bg-indigo-950/30 px-4 py-2 text-xs text-indigo-300 shadow-lg backdrop-blur-md"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
          </span>
          <span>Open Source Visual DevOps Compiler</span>
        </motion.div>

        {/* Headline */}
        <AnimatedHeadline reduceMotion={reduceMotion} />

        {/* Subtitle */}
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
          className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg"
        >
          Drag cloud resources onto a canvas. Watch Terraform and Ansible code write itself.
          Run everything in a free local sandbox. No YAML by hand.
        </motion.p>

        {/* CTA */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.55, ease: EASE, delay: 0.42 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/login?mode=signup"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-amber-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:gap-3 active:scale-95 cursor-pointer"
          >
            Start Building Free
            <Icon icon="lucide:arrow-right" className="text-sm transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-7 py-3.5 text-sm font-medium text-slate-300 backdrop-blur-sm transition hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            Read the Docs
          </Link>
        </motion.div>

        {/* Trust signals */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
          className="mt-12 flex flex-wrap justify-center gap-4 text-xs text-slate-500"
        >
          {[
            { icon: 'lucide:circle-check', text: 'Zero AWS bills in sandbox', color: 'text-indigo-400' },
            { icon: 'lucide:shield-check', text: 'AES-256 encrypted vault', color: 'text-amber-400' },
            { icon: 'lucide:zap', text: 'Terraform + Ansible in one canvas', color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2 rounded-full border border-white/[0.04] bg-white/[0.02] px-4 py-2 backdrop-blur-sm">
              <Icon icon={item.icon} className={`text-sm ${item.color}`} />
              <span>{item.text}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

// --- Logo Cloud ---

function LogoCloud() {
  const brands = ['HashiCorp', 'AWS', 'Docker', 'Kubernetes', 'Ansible', 'GitHub'];

  return (
    <section className="relative border-t border-white/[0.04] py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <motion.p
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          variants={fadeIn}
          transition={{ duration: 0.5 }}
          className="text-center text-[11px] uppercase tracking-[0.25em] text-slate-500 font-medium mb-8"
        >
          Built for the tools you already use
        </motion.p>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          variants={staggerContainer}
          className="grid grid-cols-3 gap-3 md:grid-cols-6"
        >
          {brands.map((brand) => (
            <motion.div
              key={brand}
              variants={fadeUp}
              transition={{ duration: 0.4, ease: EASE }}
              className="flex items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02] px-5 py-4 text-xs font-medium text-slate-500 backdrop-blur-sm transition hover:border-white/[0.08] hover:text-slate-300 cursor-default"
            >
              {brand}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// --- Features Section (3D Tilt Cards) ---

function FeaturesSection() {
  const features = [
    {
      icon: 'lucide:layout-grid',
      title: 'Visual Compiler',
      description: 'Drag cloud resources onto a canvas. Connections become Terraform dependencies. Parameters become HCL variables. No YAML by hand, ever.',
      gradient: 'from-indigo-500/10 to-indigo-500/5',
      iconColor: 'text-indigo-400',
      borderHover: 'hover:border-indigo-500/20',
    },
    {
      icon: 'lucide:container',
      title: 'Local Sandbox',
      description: 'Run terraform apply and ansible-playbook against Docker containers locally. Zero AWS bills. Zero risk. Full end-to-end simulation.',
      gradient: 'from-amber-500/10 to-amber-500/5',
      iconColor: 'text-amber-400',
      borderHover: 'hover:border-amber-500/20',
    },
    {
      icon: 'lucide:file-code-2',
      title: 'Reverse Import',
      description: 'Drop existing .tf or .yaml files. The AST parser reconstructs your architecture as interactive visual nodes on the canvas automatically.',
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      iconColor: 'text-emerald-400',
      borderHover: 'hover:border-emerald-500/20',
    },
  ];

  return (
    <section id="features" className="relative py-24 lg:py-32">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="text-xs uppercase tracking-widest text-indigo-400 font-semibold">
            Core Capabilities
          </motion.p>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="mt-4 text-3xl font-extrabold text-white lg:text-5xl tracking-tight leading-tight">
            Everything you need.<br />Nothing you don&apos;t.
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-4 text-base text-slate-400 max-w-xl mx-auto">
            Three engines working together: visual compilation, local sandboxing, and code reverse-import.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="grid gap-6 md:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={scaleIn} transition={{ duration: 0.5, ease: EASE }}>
              <TiltCard
                tiltLimit={12}
                scale={1.03}
                effect="evade"
                spotlight
                className={`h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-md transition-colors ${feature.borderHover} cursor-default`}
              >
                <div className="relative z-20">
                  {/* Icon */}
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} border border-white/[0.06] mb-6`}>
                    <Icon icon={feature.icon} className={`text-xl ${feature.iconColor}`} />
                  </div>

                  <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{feature.description}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// --- How It Works ---

function HowItWorksSection() {
  const steps = [
    {
      step: '01',
      title: 'Drag',
      description: 'Pick cloud resources, servers, and configuration blocks from the sidebar. Drop them onto the visual canvas.',
      icon: 'lucide:mouse-pointer-click',
      color: 'text-indigo-400',
      borderColor: 'border-indigo-500/20',
      borderHover: 'hover:border-indigo-500/30',
      bgColor: 'bg-indigo-500/10',
    },
    {
      step: '02',
      title: 'Connect',
      description: 'Draw edges between nodes to define dependencies. The compiler resolves topology and generates HCL, YAML, and Kubernetes manifests.',
      icon: 'lucide:git-branch',
      color: 'text-amber-400',
      borderColor: 'border-amber-500/20',
      borderHover: 'hover:border-amber-500/30',
      bgColor: 'bg-amber-500/10',
    },
    {
      step: '03',
      title: 'Deploy',
      description: 'Hit execute. Watch terraform apply and ansible-playbook run inside Docker containers. Stream logs in real-time via WebSocket.',
      icon: 'lucide:rocket',
      color: 'text-emerald-400',
      borderColor: 'border-emerald-500/20',
      borderHover: 'hover:border-emerald-500/30',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <section id="how-it-works" className="relative py-24 lg:py-32 border-t border-white/[0.04]">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="text-xs uppercase tracking-widest text-amber-400 font-semibold">
            Workflow
          </motion.p>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="mt-4 text-3xl font-extrabold text-white lg:text-5xl tracking-tight">
            Three steps. Zero boilerplate.
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="grid gap-8 md:grid-cols-3"
        >
          {steps.map((step) => (
            <motion.div key={step.step} variants={fadeUp} transition={{ duration: 0.5, ease: EASE }}>
              <TiltCard
                tiltLimit={10}
                scale={1.02}
                effect="evade"
                spotlight
                className={`relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-sm transition-colors ${step.borderHover} cursor-default`}
              >
                <div className="relative z-20">
                  {/* Step number */}
                  <span className="text-5xl font-extrabold text-white/[0.10] absolute top-4 right-6 font-mono">{step.step}</span>

                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${step.bgColor} ${step.borderColor} border mb-6`}>
                    <Icon icon={step.icon} className={`text-lg ${step.color}`} />
                  </div>

                  <h3 className="text-xl font-bold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{step.description}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// --- Code Preview Section ---

function CodePreviewSection() {
  const [activeTab, setActiveTab] = useState<'terraform' | 'ansible' | 'k8s'>('terraform');

  const codeSnippets = {
    terraform: `resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "infracanvas-vpc" }
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id
  tags = { Name = "web-server" }
}`,
    ansible: `---
- name: Configure web servers
  hosts: "{{ ec2_public_ip }}"
  become: true
  tasks:
    - name: Install Nginx
      apt:
        name: nginx
        state: present
        update_cache: yes

    - name: Start Nginx service
      service:
        name: nginx
        state: started
        enabled: yes`,
    k8s: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
        - name: app
          image: infracanvas/web:latest
          ports:
            - containerPort: 3000`,
  };

  const tabs = [
    { key: 'terraform' as const, label: 'Terraform', icon: 'lucide:cloud' },
    { key: 'ansible' as const, label: 'Ansible', icon: 'lucide:terminal' },
    { key: 'k8s' as const, label: 'Kubernetes', icon: 'lucide:ship' },
  ];

  return (
    <section className="relative py-24 lg:py-32 border-t border-white/[0.04]">
      <div className="pointer-events-none absolute top-0 left-1/4 w-[500px] h-[300px] bg-indigo-500/5 rounded-full blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left: text */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="text-xs uppercase tracking-widest text-indigo-400 font-semibold">
              Visual to Code
            </motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="mt-4 text-3xl font-extrabold text-white lg:text-4xl tracking-tight leading-tight">
              Every node compiles to production-ready code.
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-4 text-base text-slate-400 leading-relaxed">
              The visual graph is the source of truth. Connect an EC2 to a VPC and the compiler emits valid HCL with proper resource references. Link an Ansible role to a server node and the playbook targets the right host automatically.
            </motion.p>

            <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-8 grid grid-cols-3 gap-4">
              {[
                { label: 'Compilation', value: '< 2s', color: 'text-indigo-400' },
                { label: 'Output Formats', value: '3', color: 'text-amber-400' },
                { label: 'Deploy Cost', value: '$0', color: 'text-emerald-400' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center backdrop-blur-sm">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
                  <p className={`mt-1.5 text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: code preview */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={scaleIn}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <TiltCard
              tiltLimit={8}
              scale={1.02}
              effect="gravitate"
              spotlight
              className="rounded-2xl border border-white/[0.08] bg-background/80 shadow-2xl backdrop-blur-xl overflow-hidden"
            >
              <div className="relative z-20">
                {/* Window chrome */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500/70" />
                    <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                    <span className="h-3 w-3 rounded-full bg-green-500/70" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">infracanvas output</span>
                </div>

                {/* Tab bar */}
                <div className="flex items-center gap-1 border-b border-white/[0.04] px-4 py-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                        activeTab === tab.key
                          ? 'bg-white/[0.06] text-white'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Icon icon={tab.icon} className="text-xs" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Code */}
                <div className="p-5 min-h-[280px]">
                  <pre className="font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                    <code>{codeSnippets[activeTab]}</code>
                  </pre>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// --- Pricing Section ---

function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const price = (base: number) => (isAnnual ? Math.round(base * 0.8) : base);

  const tiers = [
    {
      name: 'Free',
      subtitle: 'For individual developers',
      price: '$0',
      period: '',
      cta: 'Get Started Free',
      ctaStyle: 'border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.06]',
      features: ['1 workspace', '2 projects', 'Local sandbox simulation', 'Export code bundles (ZIP)'],
      popular: false,
    },
    {
      name: 'Team',
      subtitle: 'For growing engineering teams',
      price: `$${price(49)}`,
      period: '/mo',
      cta: 'Start Team Trial',
      ctaStyle: 'bg-gradient-to-r from-indigo-500 to-amber-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
      features: ['Unlimited workspaces', 'Real-time cursor sync', 'Canvas locks & history', 'Run state logging'],
      popular: true,
    },
    {
      name: 'Enterprise',
      subtitle: 'For organizations at scale',
      price: `$${price(149)}`,
      period: '/mo',
      cta: 'Contact Sales',
      ctaStyle: 'border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.06]',
      features: ['SSO & granular RBAC', 'Custom playbook catalogs', 'OPA compliance engine', 'Audit trails & dedicated support'],
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="relative py-24 lg:py-32 border-t border-white/[0.04]">
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="text-center mb-12"
        >
          <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="text-xs uppercase tracking-widest text-amber-400 font-semibold">
            Pricing
          </motion.p>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="mt-4 text-3xl font-extrabold text-white lg:text-5xl tracking-tight">
            Start free. Scale when ready.
          </motion.h2>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex items-center justify-center gap-3 mb-12"
        >
          <span className={`text-sm font-medium transition ${!isAnnual ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative flex h-7 w-13 items-center rounded-full bg-white/[0.08] p-1 transition cursor-pointer"
            aria-label="Toggle billing cycle"
          >
            <div className={`h-5 w-5 rounded-full bg-gradient-to-r from-indigo-500 to-amber-600 shadow transition-transform duration-200 ${isAnnual ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
          <span className={`text-sm font-medium transition ${isAnnual ? 'text-white' : 'text-slate-500'}`}>Annual</span>
          <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-[10px] font-semibold text-indigo-400">Save 20%</span>
        </motion.div>

        {/* Cards */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="grid gap-6 lg:grid-cols-3"
        >
          {tiers.map((tier) => (
            <motion.div key={tier.name} variants={scaleIn} transition={{ duration: 0.5, ease: EASE }}>
              <TiltCard
                tiltLimit={8}
                scale={1.02}
                effect="evade"
                spotlight
                className={`h-full rounded-2xl border p-8 backdrop-blur-md ${
                  tier.popular
                    ? 'border-indigo-500/30 bg-indigo-950/10'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="relative z-20 flex flex-col h-full">
                  {tier.popular && (
                    <span className="absolute -top-4 right-4 rounded-full bg-gradient-to-r from-indigo-500 to-amber-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Most Popular
                    </span>
                  )}

                  <p className="text-sm font-semibold text-white">{tier.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{tier.subtitle}</p>

                  <div className="mt-6">
                    <span className="text-4xl font-extrabold text-white font-mono">{tier.price}</span>
                    {tier.period && <span className="text-sm text-slate-500 ml-1">{tier.period}</span>}
                  </div>

                  <hr className="border-white/[0.06] my-6" />

                  <ul className="space-y-3 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm text-slate-400">
                        <Icon icon="lucide:check" className="text-indigo-400 text-sm shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={tier.name === 'Enterprise' ? '/login' : '/login?mode=signup'}
                    className={`mt-8 w-full text-center rounded-xl px-4 py-3.5 text-sm font-semibold transition-all active:scale-95 cursor-pointer ${tier.ctaStyle}`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// --- CTA Section ---

function CTASection() {
  return (
    <section className="relative py-24 lg:py-32 border-t border-white/[0.04] overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-gradient-to-r from-indigo-500/10 via-amber-500/8 to-indigo-500/10 rounded-full blur-[140px]" />
      </div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={staggerContainer}
        className="relative z-10 mx-auto max-w-3xl px-6 text-center"
      >
        <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="text-3xl font-extrabold text-white lg:text-5xl tracking-tight leading-tight">
          Ship infrastructure<br />with confidence.
        </motion.h2>
        <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-6 text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
          Join engineers who design, simulate, and deploy cloud architecture visually.
          Start with the free sandbox. No credit card required.
        </motion.p>
        <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/login?mode=signup"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-amber-600 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:gap-3 active:scale-95 cursor-pointer"
          >
            Start Building Free
            <Icon icon="lucide:arrow-right" className="text-sm transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-8 py-4 text-sm font-medium text-slate-300 backdrop-blur-sm transition hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Icon icon="lucide:book-open" className="text-sm" />
            Explore Documentation
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

// --- CLI Download Section ---

function CliSection() {
  const { user, hasHydrated } = useAuthStore();
  const isLoggedIn = hasHydrated && !!user;
  const API_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:8080';
  const downloadBaseUrl = `${API_URL}/downloads`;

  return (
    <section className="relative py-24 lg:py-32 border-t border-white/[0.04] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-indigo-500/3 via-transparent to-amber-500/3" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left: text */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-950/30 px-4 py-2 text-xs text-indigo-300 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              CLI v1.0.0
            </motion.div>

            <motion.h2 variants={fadeUp} transition={{ duration: 0.6, ease: EASE }} className="text-3xl font-extrabold text-white lg:text-4xl tracking-tight">
              Control your cloud from the terminal.
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-4 text-base text-slate-400 leading-relaxed">
              Manage workspaces, trigger deployments, stream logs, and reverse-parse infrastructure manifests from your local machine.
            </motion.p>

            <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: EASE }} className="mt-8 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <>
                  <a href={`${downloadBaseUrl}/infracanvas-windows-amd64.exe`} download className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/[0.06] cursor-pointer">
                    <Icon icon="logos:microsoft-windows-icon" /> Windows
                  </a>
                  <a href={`${downloadBaseUrl}/infracanvas-darwin-arm64`} download className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/[0.06] cursor-pointer">
                    <Icon icon="logos:apple" /> macOS
                  </a>
                  <a href={`${downloadBaseUrl}/infracanvas-linux-amd64`} download className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/[0.06] cursor-pointer">
                    <Icon icon="logos:linux-tux" /> Linux
                  </a>
                </>
              ) : (
                <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition cursor-pointer">
                  <Icon icon="lucide:lock" /> Sign In to Download
                </Link>
              )}
              <Link href="/docs" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-300 backdrop-blur-sm transition hover:bg-white/[0.06] hover:text-white cursor-pointer">
                <Icon icon="lucide:book-open" /> CLI Docs
              </Link>
            </motion.div>
          </motion.div>

          {/* Right: terminal */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={scaleIn}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <TiltCard tiltLimit={6} scale={1.02} effect="gravitate" spotlight className="rounded-2xl border border-white/[0.08] bg-background/80 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="relative z-20">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500/70" />
                    <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                    <span className="h-3 w-3 rounded-full bg-green-500/70" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">terminal</span>
                </div>
                <div className="p-5 font-mono text-xs space-y-2 text-slate-300">
                  <p><span className="text-slate-500">$</span> infracanvas login</p>
                  <p className="text-indigo-400">Enter Email: user@company.com</p>
                  <p className="text-slate-500">Authenticated successfully.</p>
                  <p className="mt-2"><span className="text-slate-500">$</span> infracanvas import --project &quot;Prod-Stack&quot; -f main.tf</p>
                  <p className="text-emerald-400">Success: 12 nodes imported. Layout computed.</p>
                  <p className="mt-2"><span className="text-slate-500">$</span> infracanvas deploy --project &quot;Prod-Stack&quot;</p>
                  <p className="text-indigo-500">[SYSTEM] Pipeline: RUNNING</p>
                  <p className="text-slate-400">aws_instance.web: Creating...</p>
                  <p className="text-emerald-500">[SYSTEM] Pipeline: SUCCESS</p>
                  <span className="inline-block w-2 h-4 bg-indigo-400 animate-terminal-blink" />
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// --- Footer ---

function Footer() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1000);
  };

  const footerLinks = {
    Product: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'How it works', href: '#how-it-works' },
    ],
    Resources: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '#' },
      { label: 'Status', href: '#' },
    ],
    Company: [
      { label: 'About', href: '#' },
      { label: 'Security', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  };

  return (
    <footer className="border-t border-white/[0.04]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-lg shadow-indigo-500/20">
                <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 15h5M14 19h5" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white">Whiparc</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              The visual compiler and local sandbox for modern DevOps. Design, simulate, and deploy cloud infrastructure from a single canvas.
            </p>

            {/* Newsletter */}
            <div className="mt-6">
              <form onSubmit={handleSubscribe} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || submitted}
                  placeholder="your@email.com"
                  className="h-10 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500/30 backdrop-blur-sm"
                />
                <button
                  type="submit"
                  disabled={loading || submitted}
                  className="h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-4 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Icon icon="lucide:loader-2" className="animate-spin" /> : submitted ? <Icon icon="lucide:check" /> : 'Subscribe'}
                </button>
              </form>
              {submitted && <p className="mt-2 text-xs text-indigo-400">Subscribed successfully.</p>}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category} className="lg:col-span-2">
              <p className="text-xs uppercase tracking-widest text-white font-semibold mb-4">{category}</p>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link href={link.href} className="text-sm text-slate-500 hover:text-white transition cursor-pointer">{link.label}</Link>
                    ) : (
                      <a href={link.href} className="text-sm text-slate-500 hover:text-white transition cursor-pointer">{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Compliance badges */}
          <div className="lg:col-span-2">
            <p className="text-xs uppercase tracking-widest text-white font-semibold mb-4">Compliance</p>
            <div className="flex flex-col gap-2">
              <span className="inline-flex w-fit rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-slate-500 font-mono backdrop-blur-sm">SOC2</span>
              <span className="inline-flex w-fit rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-slate-500 font-mono backdrop-blur-sm">GDPR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl flex flex-col gap-4 px-6 py-6 text-xs text-slate-600 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>&copy; 2026 Whiparc Inc. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="hover:text-slate-400 transition cursor-pointer">Privacy</span>
            <span className="hover:text-slate-400 transition cursor-pointer">Terms</span>
            <span className="hover:text-slate-400 transition cursor-pointer">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// --- Main Page ---

export default function LandingPage() {
  return (
    <div className={`min-h-screen w-full bg-background flex flex-col relative text-slate-100 overflow-x-hidden ${heroDisplayFont.className}`}>
      {/* Subtle background dot pattern */}
      <div className="pointer-events-none fixed inset-0 bg-dot-pattern opacity-30 z-0" />

      <Navbar />

      <main className="flex flex-1 flex-col relative z-10">
        <HeroSection />
        <LogoCloud />
        <FeaturesSection />
        <HowItWorksSection />
        <CodePreviewSection />
        <CliSection />
        <PricingSection />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}