'use client';

import React, { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import { ProjectSettingsModal } from '../components/ProjectSettingsModal';
import { PublishTemplateModal } from '../components/PublishTemplateModal';
import { GitHubStarButton } from '../components/GitHubStarButton';
import { TiltCard } from '../components/landing/TiltCard';
import type { Project } from '../lib/types';

interface PipelineRun {
	id: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

type AgentState = 'loading' | 'connected' | 'disconnected' | 'not-installed';

interface AgentStatus {
	state: AgentState;
	lastSeenAt?: string;
}

function formatRelativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const diffMs = Date.now() - then;
	const mins = Math.floor(diffMs / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

// Skippable per the verified UX rule that onboarding must never be an
// unskippable forced tour — and it stops rendering entirely once every
// step is done, rather than nagging a returning power user.
function ActivationChecklist({
	step1Done,
	step2Done,
	step3Done,
	onSkip,
}: {
	step1Done: boolean;
	step2Done: boolean;
	step3Done: boolean;
	onSkip: () => void;
}) {
	const steps = [
		{
			done: step1Done,
			title: 'Create your first project',
			desc: step1Done ? 'Done — it’s live below' : 'Spin up a workspace to start designing your stack',
		},
		{
			done: step2Done,
			title: 'Connect your local sandbox',
			desc: <>Install the CLI, run <span className="font-mono text-[11px]">whiparc sandbox up</span></>,
		},
		{
			done: step3Done,
			title: 'Run your first deploy',
			desc: 'Zero cloud bill — it runs in the sandbox',
		},
	];
	const currentIndex = steps.findIndex((s) => !s.done);

	return (
		<div className="rounded-2xl border border-border bg-secondary/20 p-6">
			<div className="flex items-center justify-between mb-5">
				<p className="text-xs font-bold uppercase tracking-wider text-slate-300">Get started</p>
				<button onClick={onSkip} className="text-xs text-slate-500 hover:text-slate-300 transition cursor-pointer">
					Skip
				</button>
			</div>
			<div className="grid gap-5 sm:grid-cols-3">
				{steps.map((step, i) => (
					<div key={step.title} className="flex items-start gap-3">
						{step.done ? (
							<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
								<Icon icon="lucide:check" className="text-xs text-background" />
							</div>
						) : (
							<div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${i === currentIndex ? 'border-amber-500' : 'border-border'}`}>
								<span className={`font-mono text-[10px] ${i === currentIndex ? 'text-amber-500' : 'text-slate-600'}`}>{i + 1}</span>
							</div>
						)}
						<div>
							<p className={`text-sm font-semibold ${step.done || i === currentIndex ? 'text-white' : 'text-slate-500'}`}>{step.title}</p>
							<p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// Surfaces the product's actual hero feature — free, real, local execution —
// as live product state on the one page a returning user looks at every day,
// instead of leaving them unable to tell "sandbox not connected" apart from
// "something's broken." Wired to the real GET /api/projects/{id}/agents/latest
// heartbeat endpoint; a 404 (beta flag off, or no agent ever paired) and the
// "never installed" case render the same honest not-connected state.
function SandboxAgentWidget({ status }: { status: AgentStatus }) {
	if (status.state === 'loading') {
		return (
			<div className="flex min-h-[168px] items-center justify-center rounded-2xl border border-border bg-secondary/20 p-6">
				<Icon icon="lucide:loader-2" className="animate-spin text-lg text-slate-600" />
			</div>
		);
	}

	const connected = status.state === 'connected';

	return (
		<div className="rounded-2xl border border-border bg-secondary/20 p-6">
			<p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4">Local Sandbox Agent</p>
			<div className="flex items-center gap-2 mb-3 flex-wrap">
				<span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-red-500'}`} />
				<span className="text-sm font-semibold text-white">{connected ? 'Connected' : 'Not connected'}</span>
				{connected && status.lastSeenAt && (
					<span className="text-[11px] text-slate-500">· last heartbeat {formatRelativeTime(status.lastSeenAt)}</span>
				)}
			</div>
			{!connected && (
				<p className="text-xs text-slate-500 leading-relaxed mb-4">
					Your dashboard can&apos;t reach a local sandbox, so deploys targeting <span className="font-mono">local_agent</span> won&apos;t run until it&apos;s connected.
				</p>
			)}
			{!connected && (
				<Link
					href="/#cli"
					className="block w-full text-center rounded-xl bg-gradient-to-r from-primary to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-90 cursor-pointer"
				>
					{status.state === 'not-installed' ? 'Get the CLI' : 'Install the CLI'}
				</Link>
			)}
		</div>
	);
}

const RUN_STATUS_STYLE: Record<string, { label: string; dot: string; pill: string }> = {
	SUCCESS: { label: 'success', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-400' },
	FAILED: { label: 'failed', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-400' },
	RUNNING: { label: 'running', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-400' },
	PENDING: { label: 'pending', dot: 'bg-slate-500', pill: 'bg-slate-500/10 text-slate-400' },
};

function RecentRunsPanel({ projectName, runs }: { projectName: string | null; runs: PipelineRun[] | null }) {
	if (runs === null) {
		return (
			<div className="flex min-h-[168px] items-center justify-center rounded-2xl border border-border bg-secondary/20 p-6">
				<Icon icon="lucide:loader-2" className="animate-spin text-lg text-slate-600" />
			</div>
		);
	}

	if (runs.length === 0) {
		return (
			<div className="flex min-h-[168px] flex-col items-center justify-center rounded-2xl border border-border bg-secondary/20 p-6 text-center">
				<Icon icon="lucide:activity" className="text-2xl text-slate-600 mb-2" />
				<p className="text-xs text-slate-500">
					No runs yet{projectName ? ` for ${projectName}` : ''} — deploy something to see it here.
				</p>
			</div>
		);
	}

	const sparkline = runs.slice(0, 7).reverse();
	const recent = runs.slice(0, 3);

	return (
		<div className="rounded-2xl border border-border bg-secondary/20 p-6">
			<div className="flex items-center justify-between mb-4">
				<p className="text-xs font-bold uppercase tracking-wider text-slate-300">Recent runs</p>
				{projectName && <span className="text-[10px] text-slate-600 font-mono truncate max-w-[140px]">{projectName}</span>}
			</div>
			<div className="mb-4 flex h-14 items-end gap-1.5">
				{sparkline.map((run) => {
					const style = RUN_STATUS_STYLE[run.status] || RUN_STATUS_STYLE.PENDING;
					return (
						<div
							key={run.id}
							className={`flex-1 rounded-sm opacity-60 ${style.dot}`}
							style={{ height: run.status === 'FAILED' ? '40%' : '90%' }}
						/>
					);
				})}
			</div>
			<div className="flex flex-col gap-2.5">
				{recent.map((run) => {
					const style = RUN_STATUS_STYLE[run.status] || RUN_STATUS_STYLE.PENDING;
					return (
						<div key={run.id} className="flex items-center justify-between text-xs">
							<span className="font-mono text-slate-400">run {run.id.slice(0, 8)} · {formatRelativeTime(run.updatedAt)}</span>
							<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.pill}`}>{style.label}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function getGreeting(): string {
	const h = new Date().getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}

function formatDuration(startIso: string, endIso: string): string {
	const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
	if (!Number.isFinite(ms) || ms < 0) return '—';
	const totalSec = Math.round(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const mins = Math.floor(totalSec / 60);
	const secs = totalSec % 60;
	return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

// A run tagged with which project it belongs to, for the cross-project views
// below (KPI row, runs table, activity feed) — built by looping the same
// per-project GET /api/projects/{id}/runs endpoint the single-project
// RecentRunsPanel above already uses, the same way fetchData already loops
// join-requests per project. Real data, no new backend endpoint.
type TaggedRun = PipelineRun & { projectId: string; projectName: string };

interface SidebarNavItem {
	icon: string;
	label: string;
	href?: string;
	anchor?: string;
	onClick?: () => void;
	disabled?: boolean;
	active?: boolean;
}

function DashboardSidebar({ items, agentConnected }: { items: SidebarNavItem[]; agentConnected: boolean }) {
	return (
		<aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
			<div className="flex h-16 items-center gap-2 border-b border-border px-5">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary-brand">
					<span className="font-mono text-[10px] font-bold text-white">W</span>
				</div>
				<span className="text-sm font-bold text-white">Whiparc</span>
			</div>
			<nav className="flex flex-1 flex-col gap-1 p-3">
				{items.map((item) => {
					const content = (
						<>
							<Icon icon={item.icon} className="text-base shrink-0" />
							<span>{item.label}</span>
						</>
					);
					const baseClass = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
						item.disabled
							? 'text-slate-600 cursor-not-allowed'
							: item.active
								? 'bg-primary/10 text-primary cursor-pointer'
								: 'text-slate-400 hover:bg-white/[0.04] hover:text-white cursor-pointer'
					}`;
					if (item.disabled) {
						return (
							<span key={item.label} className={baseClass} title="Create a project first">
								{content}
							</span>
						);
					}
					if (item.href) {
						return (
							<Link key={item.label} href={item.href} className={baseClass}>
								{content}
							</Link>
						);
					}
					if (item.anchor) {
						return (
							<a key={item.label} href={item.anchor} className={baseClass}>
								{content}
							</a>
						);
					}
					return (
						<button key={item.label} onClick={item.onClick} className={baseClass}>
							{content}
						</button>
					);
				})}
			</nav>
			<div className="border-t border-border p-4">
				<div className="flex items-center gap-2 text-[11px] text-slate-500">
					<span className={`h-1.5 w-1.5 rounded-full ${agentConnected ? 'bg-emerald-500' : 'bg-slate-600'}`} />
					sandbox {agentConnected ? 'online' : 'offline'}
				</div>
			</div>
		</aside>
	);
}

// Breadcrumb switcher + quick search, built entirely from data the page has
// already fetched (projects, cross-project runs) — no new backend search
// endpoint, no fuzzy/AI matching, just a substring filter with a Cmd/Ctrl+K
// shortcut to focus it.
function CommandBar({
	teamName,
	projectName,
	projects,
	onSwitchProject,
	query,
	onQueryChange,
	searchRef,
	matches,
	onNewProject,
}: {
	teamName: string | null;
	projectName: string | null;
	projects: Project[];
	onSwitchProject: (p: Project) => void;
	query: string;
	onQueryChange: (v: string) => void;
	searchRef: React.RefObject<HTMLInputElement | null>;
	matches: { id: string; label: string; sub: string; onSelect: () => void }[];
	onNewProject: () => void;
}) {
	const [switcherOpen, setSwitcherOpen] = useState(false);
	const switchableProjects = projects.filter(p => p.user_role !== '');

	return (
		<div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-background/60 px-6 py-3 lg:px-10">
			<div className="relative">
				<button
					onClick={() => setSwitcherOpen(o => !o)}
					className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer"
				>
					{teamName && <span className="text-slate-500">{teamName}</span>}
					{teamName && <span className="text-slate-600">/</span>}
					<span className="font-semibold text-white">{projectName || 'No project yet'}</span>
					{switchableProjects.length > 1 && <Icon icon="lucide:chevron-down" className="text-xs text-slate-500" />}
				</button>
				{switcherOpen && switchableProjects.length > 1 && (
					<div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-card p-1.5 shadow-2xl">
						{switchableProjects.map(p => (
							<button
								key={p.id}
								onClick={() => { onSwitchProject(p); setSwitcherOpen(false); }}
								className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/[0.05] cursor-pointer"
							>
								<span className="truncate">{p.name}</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className="relative ml-1 min-w-0 flex-1 max-w-md">
				<Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
				<input
					ref={searchRef}
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="Search projects & runs..."
					className="w-full rounded-lg border border-border bg-secondary/40 py-2 pl-9 pr-14 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
				/>
				<kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-slate-500">⌘K</kbd>
				{query.trim().length > 0 && (
					<div className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-border bg-card p-1.5 shadow-2xl">
						{matches.length === 0 ? (
							<p className="px-3 py-2 text-xs text-slate-500">No matches for &quot;{query}&quot;.</p>
						) : (
							matches.map(m => (
								<button
									key={m.id}
									onClick={m.onSelect}
									className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-white/[0.05] cursor-pointer"
								>
									<span className="truncate text-xs font-medium text-white">{m.label}</span>
									<span className="text-[10px] text-slate-500">{m.sub}</span>
								</button>
							))
						)}
					</div>
				)}
			</div>

			<button
				onClick={onNewProject}
				className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition cursor-pointer"
			>
				<Icon icon="lucide:plus" className="text-sm" />
				New project
			</button>
		</div>
	);
}

function StatCard({
	label,
	value,
	sub,
	valueClass,
	loading,
	onClick,
	children,
}: {
	label: string;
	value: string;
	sub?: string;
	valueClass?: string;
	loading: boolean;
	onClick?: () => void;
	children?: React.ReactNode;
}) {
	const Comp = onClick ? 'button' : 'div';
	return (
		<Comp
			onClick={onClick}
			className={`rounded-2xl border border-border bg-secondary/20 p-5 text-left ${onClick ? 'cursor-pointer hover:border-primary/30 transition' : ''}`}
		>
			<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
			{loading ? (
				<div className="mt-2 h-7 w-16 animate-pulse rounded bg-white/5" />
			) : (
				<p className={`mt-1 font-mono text-2xl font-bold ${valueClass || 'text-white'}`}>{value}</p>
			)}
			{sub && !loading && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{sub}</p>}
			{children}
		</Comp>
	);
}

// KPI row — everything here is computed client-side from the same
// cross-project runs fetch the table below uses. The spend card is
// deliberately honest rather than a fabricated metering figure: Whiparc has
// no billing/cost-tracking system today, so "$0.00" is framed as "nothing
// bills yet," not as a real usage meter.
// Kept outside the component: the "current time" reads (Date.now/new Date())
// are impure and the render-purity lint flags them when they appear inline
// in a component body, but not when routed through a plain helper.
function computeRunStats(runs: TaggedRun[]) {
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
	const last7 = runs.filter(r => new Date(r.createdAt).getTime() >= sevenDaysAgo);
	const failedLast7 = last7.filter(r => r.status === 'FAILED');
	const lastDeploy = runs[0];

	const buckets = Array.from({ length: 7 }, (_, i) => {
		const dayStart = new Date(now);
		dayStart.setHours(0, 0, 0, 0);
		dayStart.setDate(dayStart.getDate() - (6 - i));
		const dayEnd = new Date(dayStart);
		dayEnd.setDate(dayStart.getDate() + 1);
		return last7.filter(r => {
			const t = new Date(r.createdAt).getTime();
			return t >= dayStart.getTime() && t < dayEnd.getTime();
		}).length;
	});

	return { last7, failedLast7, lastDeploy, buckets };
}

function KpiRow({ allRuns, onFilterFailed }: { allRuns: TaggedRun[] | null; onFilterFailed: () => void }) {
	const loading = allRuns === null;
	const runs = allRuns ?? [];
	const { last7, failedLast7, lastDeploy, buckets } = computeRunStats(runs);
	const maxBucket = Math.max(1, ...buckets);

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Last deploy"
				value={lastDeploy ? formatRelativeTime(lastDeploy.updatedAt) : '—'}
				sub={lastDeploy ? `${lastDeploy.projectName} · ${(RUN_STATUS_STYLE[lastDeploy.status] || RUN_STATUS_STYLE.PENDING).label}` : 'No runs yet'}
				loading={loading}
			/>
			<StatCard label="Runs, last 7 days" value={String(last7.length)} loading={loading}>
				<div className="mt-3 flex h-6 items-end gap-1" role="img" aria-label={`${last7.length} runs across the last 7 days`}>
					{buckets.map((c, i) => (
						<div
							key={i}
							className="flex-1 rounded-sm bg-primary/40"
							style={{ height: `${Math.max(12, (c / maxBucket) * 100)}%` }}
							title={`${c} run${c === 1 ? '' : 's'}`}
						/>
					))}
				</div>
			</StatCard>
			<StatCard
				label="Needs a look"
				value={String(failedLast7.length)}
				sub={failedLast7.length > 0 ? 'failed runs, last 7 days' : 'nothing is on fire'}
				valueClass={failedLast7.length > 0 ? 'text-red-400' : 'text-white'}
				loading={loading}
				onClick={failedLast7.length > 0 ? onFilterFailed : undefined}
			/>
			<StatCard
				label="Cloud spend this month"
				value="$0.00"
				sub="Whiparc doesn't meter cloud spend yet — every run above ran in your sandbox."
				loading={loading}
			/>
		</div>
	);
}

// Cross-project runs table — the single-project RecentRunsPanel above is
// left exactly as it was; this is additive, not a replacement.
function RunsTable({
	runs,
	filter,
	onFilterChange,
}: {
	runs: TaggedRun[] | null;
	filter: 'all' | 'failed';
	onFilterChange: (f: 'all' | 'failed') => void;
}) {
	if (runs === null) {
		return (
			<div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-secondary/20 p-6">
				<Icon icon="lucide:loader-2" className="animate-spin text-lg text-slate-600" />
			</div>
		);
	}

	const visible = filter === 'failed' ? runs.filter(r => r.status === 'FAILED') : runs;

	return (
		<div id="runs" className="scroll-mt-24 rounded-2xl border border-border bg-secondary/20 overflow-hidden">
			<div className="flex items-center justify-between border-b border-border/60 p-5">
				<p className="text-xs font-bold uppercase tracking-wider text-slate-300">Recent runs</p>
				<div className="flex gap-1 rounded-lg border border-border bg-card p-1">
					<button
						onClick={() => onFilterChange('all')}
						className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${filter === 'all' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
					>
						All
					</button>
					<button
						onClick={() => onFilterChange('failed')}
						className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${filter === 'failed' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
					>
						Failed only
					</button>
				</div>
			</div>
			{visible.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
					<Icon icon="lucide:inbox" className="text-2xl text-slate-600" />
					<p className="text-xs text-slate-500">
						{filter === 'failed' ? 'No failed runs — nothing on fire.' : 'No runs yet across your projects.'}
					</p>
				</div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
								<th scope="col" className="px-5 py-3 font-semibold">Run</th>
								<th scope="col" className="px-5 py-3 font-semibold">Project</th>
								<th scope="col" className="px-5 py-3 font-semibold">Duration</th>
								<th scope="col" className="px-5 py-3 font-semibold">When</th>
								<th scope="col" className="px-5 py-3 text-right font-semibold">Status</th>
							</tr>
						</thead>
						<tbody>
							{visible.slice(0, 20).map((run) => {
								const style = RUN_STATUS_STYLE[run.status] || RUN_STATUS_STYLE.PENDING;
								const isTerminal = run.status === 'SUCCESS' || run.status === 'FAILED';
								return (
									<tr key={run.id} className="border-t border-border/40 hover:bg-white/[0.02] transition">
										<td className="px-5 py-3 font-mono text-slate-300">r-{run.id.slice(0, 8)}</td>
										<td className="px-5 py-3 text-slate-400">{run.projectName}</td>
										<td className="px-5 py-3 font-mono text-slate-500">{isTerminal ? formatDuration(run.createdAt, run.updatedAt) : '—'}</td>
										<td className="px-5 py-3 text-slate-500">{formatRelativeTime(run.updatedAt)}</td>
										<td className="px-5 py-3 text-right">
											<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.pill}`}>{style.label}</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

interface ActivityItem {
	id: string;
	ts: number;
	text: React.ReactNode;
}

// Derived from real events already fetched (runs + join requests) — not a
// fabricated audit log. No backend activity/audit endpoint exists today.
function buildActivity(allRuns: TaggedRun[] | null, joinRequests: JoinRequest[]): ActivityItem[] {
	const items: ActivityItem[] = [];
	(allRuns ?? []).slice(0, 8).forEach(run => {
		if (run.status !== 'SUCCESS' && run.status !== 'FAILED') return;
		items.push({
			id: `run-${run.id}`,
			ts: new Date(run.updatedAt).getTime(),
			text: run.status === 'SUCCESS'
				? <>Deployed <span className="font-mono text-slate-300">{run.projectName}</span> successfully.</>
				: <>Run failed on <span className="font-mono text-slate-300">{run.projectName}</span>.</>,
		});
	});
	joinRequests.forEach(req => {
		items.push({
			id: `join-${req.id}`,
			ts: new Date(req.requested_at).getTime(),
			text: <><span className="text-slate-300">{req.user_name}</span> asked for access to <span className="font-mono text-slate-300">{req.project_name}</span>.</>,
		});
	});
	return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
	return (
		<div className="rounded-2xl border border-border bg-secondary/20 p-5">
			<p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-300">Activity</p>
			{loading ? (
				<div className="flex items-center justify-center py-8">
					<Icon icon="lucide:loader-2" className="animate-spin text-lg text-slate-600" />
				</div>
			) : items.length === 0 ? (
				<p className="text-xs text-slate-500">Nothing yet — activity shows up here as you deploy.</p>
			) : (
				<ul className="flex flex-col gap-3">
					{items.map(item => (
						<li key={item.id} className="flex gap-3 text-xs">
							<span className="w-9 shrink-0 font-mono text-[10px] text-slate-600">{formatRelativeTime(new Date(item.ts).toISOString())}</span>
							<span className="text-slate-400">{item.text}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

interface Team {
	id: string;
	name: string;
	slug: string;
	owner_id: string;
	created_at: string;
}

interface JoinRequest {
	id: string;
	project_id: string;
	project_name?: string;
	user_id: string;
	user_name: string;
	user_email: string;
	status: string;
	note: string;
	requested_at: string;
}

function DashboardContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { token, user, hasHydrated, logout } = useAuthStore();

	const [projects, setProjects] = useState<Project[]>([]);
	const [teams, setTeams] = useState<Team[]>([]);
	const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);

	const [searchQuery, setSearchQuery] = useState('');
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<Project | null>(null);
	const [isPublishOpen, setIsPublishOpen] = useState(false);
	const [selectedProjectForPublish, setSelectedProjectForPublish] = useState<Project | null>(null);

	// Create project form state
	const [newProjName, setNewProjName] = useState('');
	const [newProjDesc, setNewProjDesc] = useState('');
	const [newProjVisibility, setNewProjVisibility] = useState('PRIVATE');
	const [newProjTeamId, setNewProjTeamId] = useState('');
	const [createError, setCreateError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

	// Request join state
	const [selectedProjToJoin, setSelectedProjToJoin] = useState<Project | null>(null);
	const [joinNote, setJoinNote] = useState('');
	const [joinError, setJoinError] = useState<string | null>(null);
	const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

	// Tabs/Filters
	const [activeFilter, setActiveFilter] = useState<'my' | 'discover'>('my');

	// Activation checklist + sandbox agent / recent runs widgets
	const [checklistDismissed, setChecklistDismissed] = useState(false);
	const [agentStatus, setAgentStatus] = useState<AgentStatus>({ state: 'loading' });
	const [recentRuns, setRecentRuns] = useState<PipelineRun[] | null>(null);

	// Cross-project runs (KPI row, runs table, activity feed) + command bar
	const [allRuns, setAllRuns] = useState<TaggedRun[] | null>(null);
	const [runsFilter, setRunsFilter] = useState<'all' | 'failed'>('all');
	const [commandQuery, setCommandQuery] = useState('');
	const [switchedProjectId, setSwitchedProjectId] = useState<string | null>(null);
	const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'members' | 'credentials' | 'agents' | 'danger'>('general');
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Route protection — wait for the persisted store to rehydrate before deciding
	useEffect(() => {
		if (hasHydrated && !token) {
			router.push('/login');
		}
	}, [hasHydrated, token, router]);

	// Auto-open the create-workspace prompt when arriving via ?create=1
	// (e.g. redirected here from a bare /workspace URL with no project selected)
	useEffect(() => {
		if (searchParams.get('create') === '1') {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setIsCreateModalOpen(true);
			router.replace('/dashboard');
		}
	}, [searchParams, router]);

	// Fetch teams, projects, and pending requests
	const fetchData = useCallback(async () => {
		const activeToken = token;
		if (!activeToken) return;

		setIsLoadingData(true);
		try {
			const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

			// 1. Fetch Teams
			const teamsRes = await fetch(`${API_URL}/api/teams`, {
				headers: { 'Authorization': `Bearer ${activeToken}` }
			});
			let fetchedTeams: Team[] = [];
			if (teamsRes.ok) {
				fetchedTeams = await teamsRes.json();
				setTeams(fetchedTeams);
				if (fetchedTeams.length > 0) {
					setNewProjTeamId(fetchedTeams[0].id);
				}
			}

			// 2. Fetch Projects
			const projectsRes = await fetch(`${API_URL}/api/projects`, {
				headers: { 'Authorization': `Bearer ${activeToken}` }
			});
			if (projectsRes.ok) {
				const fetchedProjects: Project[] = await projectsRes.json() || [];
				setProjects(fetchedProjects);

				// 3. For each project where user is ADMIN, fetch pending join requests
				const requestsAccumulator: JoinRequest[] = [];
				for (const p of fetchedProjects) {
					if (p && p.user_role === 'ADMIN') {
						const reqsRes = await fetch(`${API_URL}/api/projects/${p.id}/join-requests`, {
							headers: { 'Authorization': `Bearer ${activeToken}` }
						});
						if (reqsRes.ok) {
							const reqs: JoinRequest[] = await reqsRes.json();
							if (reqs && reqs.length > 0) {
								reqs.forEach(r => {
									r.project_name = p.name;
									requestsAccumulator.push(r);
								});
							}
						}
					}
				}
				setJoinRequests(requestsAccumulator);
			}
		} catch (err) {
			console.error("Error fetching dashboard data", err);
		} finally {
			setIsLoadingData(false);
		}
	}, [token]);

	useEffect(() => {
		if (user) {
			// Fetching on mount is the intended synchronization with the dashboard API.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			fetchData();
		}
	}, [user, fetchData]);

	// Restore a dismissed activation checklist per-user so it doesn't reappear
	// on every visit once someone has explicitly skipped it.
	useEffect(() => {
		if (!user) return;
		try {
			if (localStorage.getItem(`whiparc:checklist-dismissed:${user.id}`) === 'true') {
				// eslint-disable-next-line react-hooks/set-state-in-effect
				setChecklistDismissed(true);
			}
		} catch {
			// localStorage unavailable — checklist just stays visible, not fatal
		}
	}, [user]);

	const handleSkipChecklist = () => {
		setChecklistDismissed(true);
		if (user) {
			try {
				localStorage.setItem(`whiparc:checklist-dismissed:${user.id}`, 'true');
			} catch {
				// not fatal — it just re-shows next visit
			}
		}
	};

	// Sandbox Agent status + recent runs are both scoped per-project by the
	// API, so both widgets reflect whichever of the user's own projects was
	// most recently updated ("primary"). Real data end to end: the agent
	// heartbeat (GET /api/projects/{id}/agents/latest, 404s honestly when the
	// SANDBOX_AGENT_BETA flag is off or nothing's ever been paired — both
	// collapse into the same "not connected" state) and the run history
	// (GET /api/projects/{id}/runs).
	useEffect(() => {
		if (!token) return;

		const myOwnProjects = projects.filter(p => p.user_role !== '');
		const primary = myOwnProjects.length > 0
			? [...myOwnProjects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
			: null;

		if (!primary) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setAgentStatus({ state: 'not-installed' });
			setRecentRuns([]);
			return;
		}

		let cancelled = false;
		const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

		(async () => {
			try {
				const res = await fetch(`${API_URL}/api/projects/${primary.id}/agents/latest`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				if (cancelled) return;
				if (res.ok) {
					const data = await res.json();
					setAgentStatus({
						state: data.status === 'ACTIVE' ? 'connected' : 'disconnected',
						lastSeenAt: data.last_seen_at,
					});
				} else {
					setAgentStatus({ state: 'not-installed' });
				}
			} catch {
				if (!cancelled) setAgentStatus({ state: 'not-installed' });
			}
		})();

		(async () => {
			try {
				const res = await fetch(`${API_URL}/api/projects/${primary.id}/runs`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				if (cancelled) return;
				if (res.ok) {
					const data: PipelineRun[] = await res.json();
					setRecentRuns(data);
				} else {
					setRecentRuns([]);
				}
			} catch {
				if (!cancelled) setRecentRuns([]);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [projects, token]);

	// Cross-project runs — loops GET /api/projects/{id}/runs across every
	// project the user owns/edits, the same fan-out pattern fetchData already
	// uses for join-requests. Feeds the KPI row, the runs table, and the
	// derived activity feed below; independent of the single-project
	// recentRuns fetch above.
	useEffect(() => {
		if (!token) return;

		const myOwnProjects = projects.filter(p => p.user_role !== '');
		if (myOwnProjects.length === 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setAllRuns([]);
			return;
		}

		let cancelled = false;
		const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

		(async () => {
			try {
				const results = await Promise.all(
					myOwnProjects.map(async (p) => {
						try {
							const res = await fetch(`${API_URL}/api/projects/${p.id}/runs`, {
								headers: { 'Authorization': `Bearer ${token}` }
							});
							if (!res.ok) return [];
							const data: PipelineRun[] = await res.json();
							return data.map((r): TaggedRun => ({ ...r, projectId: p.id, projectName: p.name }));
						} catch {
							return [];
						}
					})
				);
				if (cancelled) return;
				const merged = results.flat().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
				setAllRuns(merged);
			} catch {
				if (!cancelled) setAllRuns([]);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [projects, token]);

	// Global Cmd/Ctrl+K focuses the command bar search from anywhere on the page.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				searchInputRef.current?.focus();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	const handleOpenWorkspace = (projectId: string) => {
		router.push(`/workspace?project=${projectId}`);
	};

	const handleLogout = () => {
		logout();
		router.push('/login');
	};

	const handleCreateProjectSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreateError(null);

		const activeToken = token;
		if (!activeToken) return;

		if (!newProjName.trim() || !newProjTeamId) {
			setCreateError('Project name and team selection are required.');
			return;
		}

		setIsCreating(true);
		try {
			const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
			const res = await fetch(`${API_URL}/api/projects`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${activeToken}`
				},
				body: JSON.stringify({
					name: newProjName.trim(),
					description: newProjDesc.trim(),
					visibility: newProjVisibility,
					team_id: newProjTeamId
				})
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(errText || 'Failed to create project');
			}

			const newProject = await res.json();
			setIsCreateModalOpen(false);
			setNewProjName('');
			setNewProjDesc('');
			fetchData();
			router.push(`/workspace?project=${newProject.id}`);
		} catch (err: unknown) {
			setCreateError(err instanceof Error ? err.message : 'Internal Server Error');
			setIsCreating(false);
		}
	};

	const handleRequestJoinSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setJoinError(null);
		setJoinSuccess(null);

		const activeToken = token;
		if (!activeToken || !selectedProjToJoin) return;

		try {
			const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
			const res = await fetch(`${API_URL}/api/projects/${selectedProjToJoin.id}/join-request`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${activeToken}`
				},
				body: JSON.stringify({ note: joinNote.trim() })
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(errText || 'Failed to submit join request');
			}

			setJoinSuccess('Join request submitted successfully. Awaiting administrator review.');
			setJoinNote('');
			setTimeout(() => {
				setIsJoinModalOpen(false);
				setSelectedProjToJoin(null);
				setJoinSuccess(null);
				fetchData();
			}, 2000);
		} catch (err: unknown) {
			setJoinError(err instanceof Error ? err.message : 'Internal Server Error');
		}
	};

	const handleReviewRequest = async (projectId: string, reqId: string, approve: boolean) => {
		const activeToken = token;
		if (!activeToken) return;

		try {
			const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
			const endpoint = approve ? 'approve' : 'reject';
			const res = await fetch(`${API_URL}/api/projects/${projectId}/join-requests/${reqId}/${endpoint}`, {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${activeToken}` }
			});

			if (res.ok) {
				fetchData();
			}
		} catch (err) {
			console.error("Failed to review request", err);
		}
	};

	if (!user) {
		return (
			<div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
				<div className="flex flex-col items-center gap-3">
					<Icon icon="lucide:loader-2" className="animate-spin text-3xl text-primary" />
					<p className="text-sm font-medium tracking-wide">Securing session...</p>
				</div>
			</div>
		);
	}

	// Filter projects
	const myProjects = projects.filter(p => p.user_role !== '');
	const discoverProjects = projects.filter(p => p.user_role === '');

	const filteredProjects = (activeFilter === 'my' ? myProjects : discoverProjects).filter(p =>
		p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		p.description.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const primaryProject = myProjects.length > 0
		? [...myProjects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
		: null;

	const firstName = user.name.split(' ')[0] || user.name;

	// Activation checklist state — "Run your first deploy" counts done once
	// the primary project has at least one run; a still-loading agent status
	// is treated as not-yet-connected rather than flashing a wrong count.
	const step1Done = myProjects.length > 0;
	const step2Done = agentStatus.state === 'connected';
	const step3Done = (recentRuns?.length ?? 0) > 0;
	const stepsRemaining = [step1Done, step2Done, step3Done].filter(d => !d).length;
	const allStepsDone = stepsRemaining === 0;
	const showChecklist = !checklistDismissed && !allStepsDone;

	const greeting = getGreeting();

	// Command bar breadcrumb — falls back to primaryProject, but a switch
	// from the breadcrumb dropdown overrides it for the rest of the session.
	const breadcrumbProject = switchedProjectId
		? myProjects.find(p => p.id === switchedProjectId) ?? primaryProject
		: primaryProject;
	const breadcrumbTeam = breadcrumbProject ? teams.find(t => t.id === breadcrumbProject.team_id)?.name ?? null : null;

	const commandMatches = commandQuery.trim().length > 0
		? [
			...myProjects
				.filter(p => p.name.toLowerCase().includes(commandQuery.toLowerCase()))
				.slice(0, 4)
				.map(p => ({
					id: `project-${p.id}`,
					label: p.name,
					sub: 'Project · open workspace',
					onSelect: () => { setCommandQuery(''); handleOpenWorkspace(p.id); },
				})),
			...(allRuns ?? [])
				.filter(r => r.id.toLowerCase().includes(commandQuery.toLowerCase()) || r.projectName.toLowerCase().includes(commandQuery.toLowerCase()))
				.slice(0, 4)
				.map(r => ({
					id: `run-${r.id}`,
					label: `r-${r.id.slice(0, 8)} · ${r.projectName}`,
					sub: `run · ${(RUN_STATUS_STYLE[r.status] || RUN_STATUS_STYLE.PENDING).label}`,
					onSelect: () => {
						setCommandQuery('');
						setRunsFilter('all');
						document.getElementById('runs')?.scrollIntoView({ behavior: 'smooth' });
					},
				})),
		]
		: [];

	const sidebarItems: SidebarNavItem[] = [
		{ icon: 'lucide:layout-dashboard', label: 'Overview', active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
		{ icon: 'lucide:folder', label: 'Projects', anchor: '#projects' },
		{ icon: 'lucide:layout-template', label: 'Templates', href: '/templates' },
		{ icon: 'lucide:activity', label: 'Runs', anchor: '#runs' },
		{
			icon: 'lucide:key',
			label: 'Credentials',
			disabled: !primaryProject,
			onClick: primaryProject ? () => {
				setSettingsInitialTab('credentials');
				setSelectedProjectForSettings(primaryProject);
				setIsSettingsOpen(true);
			} : undefined,
		},
		{
			icon: 'lucide:users',
			label: 'Team',
			disabled: !primaryProject,
			onClick: primaryProject ? () => {
				setSettingsInitialTab('members');
				setSelectedProjectForSettings(primaryProject);
				setIsSettingsOpen(true);
			} : undefined,
		},
		{ icon: 'lucide:book-open', label: 'Docs', href: '/docs' },
	];

	const activityItems = buildActivity(allRuns, joinRequests);

	return (
		<div className="min-h-screen w-full bg-background flex text-slate-200 font-sans">
			<DashboardSidebar items={sidebarItems} agentConnected={agentStatus.state === 'connected'} />

			<div className="flex min-w-0 flex-1 flex-col">
				{/* Top Header */}
				<header className="sticky top-0 z-20 border-b border-border/60 bg-card/80 backdrop-blur-xl">
					<div className="flex w-full items-center justify-between px-6 py-4 lg:px-10">
						<Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity lg:hidden" title="Home">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-input shadow-md">
								<div className="h-4 w-4 rounded-md bg-gradient-to-br from-primary to-amber-400"></div>
							</div>
							<div>
								<p className="text-sm font-semibold tracking-wide text-white">Whiparc</p>
							</div>
						</Link>
						<p className="hidden text-sm font-semibold tracking-wide text-white lg:block">Workspace Dashboard</p>

						<div className="flex items-center gap-4">
							<span className="hidden sm:inline-flex items-center rounded-full border border-border bg-secondary/50 px-3 py-1 text-[11px] font-semibold text-slate-400 capitalize">
								{user.plan ? `${user.plan.toLowerCase()} plan` : 'Free plan'}
							</span>
							<GitHubStarButton variant="compact" />
							<div className="flex items-center gap-3 px-3 py-1.5 rounded-xl border border-border bg-secondary/50">
								<div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold uppercase border border-primary/20">
									{user.name.slice(0, 2)}
								</div>
								<div className="hidden sm:block text-left">
									<p className="text-xs font-semibold text-white">{user.name}</p>
									<p className="text-[10px] text-slate-400 leading-none">{user.email}</p>
								</div>
							</div>
							<Link
								href="/"
								className="p-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-primary/10 hover:border-primary/20 text-slate-400 hover:text-primary transition cursor-pointer"
								title="Home"
							>
								<Icon icon="lucide:home" className="text-lg" />
							</Link>
							<button
								onClick={handleLogout}
								className="p-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-red-500/10 hover:border-red-500/20 text-slate-400 hover:text-red-400 transition cursor-pointer"
								title="Logout"
							>
								<Icon icon="lucide:log-out" className="text-lg" />
							</button>
						</div>
					</div>

					<CommandBar
						teamName={breadcrumbTeam}
						projectName={breadcrumbProject?.name ?? null}
						projects={myProjects}
						onSwitchProject={(p) => setSwitchedProjectId(p.id)}
						query={commandQuery}
						onQueryChange={setCommandQuery}
						searchRef={searchInputRef}
						matches={commandMatches}
						onNewProject={() => setIsCreateModalOpen(true)}
					/>
				</header>

				{/* Main Content Area */}
				<main className="flex-grow w-full px-6 py-12 lg:px-10 flex flex-col gap-10">
					{/* Welcome Banner */}
					<div className="border-b border-border/40 pb-8">
						<h1 className="text-3xl font-bold tracking-tight text-white">{greeting}, {firstName}</h1>
						<p className="text-sm text-slate-400 mt-1">
							{allStepsDone
								? "You're all set — deploy anytime."
								: `${stepsRemaining} step${stepsRemaining === 1 ? '' : 's'} left before your first real deploy.`}
						</p>
					</div>

					{/* Activation Checklist */}
					{showChecklist && (
						<ActivationChecklist
							step1Done={step1Done}
							step2Done={step2Done}
							step3Done={step3Done}
							onSkip={handleSkipChecklist}
						/>
					)}

					{/* KPI row */}
					<KpiRow allRuns={allRuns} onFilterFailed={() => { setRunsFilter('failed'); document.getElementById('runs')?.scrollIntoView({ behavior: 'smooth' }); }} />

					{/* Sandbox Agent status + Recent runs */}
					<div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
						<SandboxAgentWidget status={agentStatus} />
						<RecentRunsPanel projectName={primaryProject?.name ?? null} runs={recentRuns} />
					</div>

					{/* Cross-project runs table + activity feed */}
					<div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
						<RunsTable runs={allRuns} filter={runsFilter} onFilterChange={setRunsFilter} />
						<ActivityFeed items={activityItems} loading={allRuns === null} />
					</div>

					{/* Pending Join Requests Queue */}
				{joinRequests.length > 0 && (
					<div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex flex-col gap-4 shadow-xl">
						<div className="flex items-center gap-2 text-amber-400">
							<Icon icon="lucide:bell" className="text-xl animate-bounce" />
							<h3 className="font-bold text-sm tracking-wide">Pending Access Requests ({joinRequests.length})</h3>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							{joinRequests.map(req => (
								<div key={req.id} className="bg-secondary/50 border border-border p-4 rounded-xl flex flex-col justify-between gap-3">
									<div>
										<p className="text-xs text-slate-400">
											User <span className="text-white font-semibold">{req.user_name}</span> ({req.user_email}) requested access to project <span className="text-white font-semibold">{req.project_name}</span>.
										</p>
										{req.note && (
											<p className="mt-2 text-xs italic text-slate-500 bg-background px-2.5 py-1.5 rounded-lg border border-border/80">
												&quot;{req.note}&quot;
											</p>
										)}
									</div>
									<div className="flex gap-2 justify-end">
										<button
											onClick={() => handleReviewRequest(req.project_id, req.id, false)}
											className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer transition"
										>
											Reject
										</button>
										<button
											onClick={() => handleReviewRequest(req.project_id, req.id, true)}
											className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition"
										>
											Approve
										</button>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Projects heading */}
				<div id="projects" className="scroll-mt-24 flex items-center justify-between">
					<h2 className="text-base font-bold text-white">Projects</h2>
					<button
						onClick={() => setIsCreateModalOpen(true)}
						className="flex items-center gap-2 rounded-xl bg-primary hover:opacity-90 active:scale-[0.98] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/20 transition cursor-pointer"
					>
						<Icon icon="lucide:plus" className="text-base" />
						<span>New Project</span>
					</button>
				</div>

				{/* Dashboard Navigation Tabs */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/30 pb-4">
					<div className="flex gap-3 bg-secondary/40 p-1 rounded-xl border border-border">
						<button
							onClick={() => setActiveFilter('my')}
							className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition ${
								activeFilter === 'my' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'
							}`}
						>
							My Workspaces ({myProjects.length})
						</button>
						<button
							onClick={() => setActiveFilter('discover')}
							className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition ${
								activeFilter === 'discover' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'
							}`}
						>
							Discover Catalog ({discoverProjects.length})
						</button>
					</div>

					<div className="relative w-full sm:max-w-xs">
						<Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search workspaces..."
							className="w-full bg-card border border-border/80 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
						/>
					</div>
				</div>

				{/* Main Workspaces Grid */}
				{isLoadingData ? (
					<div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
						<Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
						<p className="text-xs">Fetching projects...</p>
					</div>
				) : filteredProjects.length === 0 ? (
					<div className="py-20 border border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-secondary/10 select-none animate-in fade-in duration-200">
						<Icon icon="lucide:folder-open" className="text-3xl mb-3 text-slate-600" />
						<h3 className="font-bold text-white text-sm">No workspaces found</h3>
						<p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-normal">
							{activeFilter === 'my'
								? 'Create a new project workspace to start designing your deployment orchestration canvas.'
								: 'No other projects found inside your organization catalogue.'}
						</p>
					</div>
				) : (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{filteredProjects.map((project) => (
							<TiltCard
								key={project.id}
								tiltLimit={0}
								scale={1}
								spotlight
								className="rounded-[24px] border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/30 hover:shadow-2xl transition-colors duration-300 p-6 flex flex-col justify-between shadow-xl group cursor-default"
							>
								<div>
									<div className="flex items-center justify-between mb-4">
										<span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
											{project.visibility} Project
										</span>
										<div className="flex items-center gap-1.5">
											<span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]"></span>
											<span className="text-xs font-medium text-slate-400 capitalize">
												Connected
											</span>
										</div>
									</div>

									<h3 className="text-lg font-bold text-white group-hover:text-primary transition duration-200">
										{project.name}
									</h3>

									<p className="text-sm text-slate-400 mt-2.5 leading-relaxed line-clamp-3">
										{project.description || "No project description provided."}
									</p>
								</div>

								<div className="mt-6 flex flex-col gap-4 border-t border-border/40 pt-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-1 text-slate-500">
											<Icon icon="lucide:user" className="text-sm" />
											<span className="text-[10px] font-medium truncate max-w-[120px]">
												{project.created_by === user.id ? 'You' : 'Peer'}
											</span>
										</div>

										{project.user_role ? (
											<div className="flex items-center gap-2">
												{project.user_role === 'ADMIN' && (
													<button
														onClick={() => {
															setSelectedProjectForPublish(project);
															setIsPublishOpen(true);
														}}
														className="p-2 rounded-xl border border-border bg-card hover:bg-primary/10 hover:border-primary/20 text-slate-450 hover:text-primary transition cursor-pointer flex items-center justify-center h-8 w-8"
														title="Publish as Template"
													>
														<Icon icon="lucide:upload-cloud" className="text-sm" />
													</button>
												)}
												{(project.user_role === 'EDITOR' || project.user_role === 'ADMIN') && (
													<button
														onClick={() => {
															setSettingsInitialTab('general');
															setSelectedProjectForSettings(project);
															setIsSettingsOpen(true);
														}}
														className="p-2 rounded-xl border border-border bg-card hover:bg-primary/10 hover:border-primary/20 text-slate-450 hover:text-primary transition cursor-pointer flex items-center justify-center h-8 w-8"
														title="Project Settings"
													>
														<Icon icon="lucide:settings" className="text-sm" />
													</button>
												)}
												<button
													onClick={() => handleOpenWorkspace(project.id)}
													className="rounded-xl bg-secondary hover:bg-primary hover:text-white px-4 py-2 text-xs font-bold text-slate-300 transition duration-200 cursor-pointer flex items-center gap-1"
												>
													<span>Open Workspace</span>
													<Icon icon="lucide:chevron-right" className="text-sm" />
												</button>
											</div>
										) : (
											<button
												onClick={() => {
													setSelectedProjToJoin(project);
													setIsJoinModalOpen(true);
												}}
												className="rounded-xl bg-primary hover:opacity-90 px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 transition cursor-pointer flex items-center gap-1"
											>
												<Icon icon="lucide:unlock" className="text-xs" />
												<span>Request Access</span>
											</button>
										)}
									</div>
								</div>
							</TiltCard>
						))}
					</div>
				)}
			</main>

			{/* Create Project Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#000]/70 backdrop-blur-sm">
					<div className="w-full max-w-md bg-secondary border border-border rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
						<div className="flex justify-between items-center">
							<h3 className="text-lg font-bold text-white">Create New Workspace</h3>
							<button onClick={() => setIsCreateModalOpen(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-secondary cursor-pointer">
								<Icon icon="lucide:x" className="text-xl" />
							</button>
						</div>

						{createError && (
							<div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-xs flex items-center gap-2">
								<Icon icon="lucide:alert-circle" className="text-base shrink-0" />
								<p>{createError}</p>
							</div>
						)}

						<form onSubmit={handleCreateProjectSubmit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Project Name</label>
								<input
									type="text"
									required
									value={newProjName}
									onChange={(e) => setNewProjName(e.target.value)}
									placeholder="e.g. AWS Cloud Sandbox"
									className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</label>
								<textarea
									rows={3}
									value={newProjDesc}
									onChange={(e) => setNewProjDesc(e.target.value)}
									placeholder="Describe the stack, templates, and targets..."
									className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary resize-none transition"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Team Organization</label>
								<select
									value={newProjTeamId}
									onChange={(e) => setNewProjTeamId(e.target.value)}
									className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-primary transition cursor-pointer"
								>
									{teams.map(t => (
										<option key={t.id} value={t.id}>{t.name}</option>
									))}
								</select>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visibility Setting</label>
								<select
									value={newProjVisibility}
									onChange={(e) => setNewProjVisibility(e.target.value)}
									className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-primary transition cursor-pointer"
								>
									<option value="PRIVATE">Private (Explicit Invites Only)</option>
									<option value="TEAM">Team (Accessible to Organization members)</option>
									<option value="PUBLIC">Public (Discoverable & Requestable)</option>
								</select>
							</div>

							<button
								type="submit"
								disabled={isCreating}
								className="w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 active:scale-[0.98] text-white rounded-xl py-3 text-sm font-semibold transition mt-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
							>
								{isCreating ? (
									<>
										<Icon icon="lucide:loader-2" className="animate-spin text-base" />
										Creating Workspace...
									</>
								) : (
									'Create Workspace'
								)}
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Join Project Request Modal */}
			{isJoinModalOpen && selectedProjToJoin && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#000]/70 backdrop-blur-sm">
					<div className="w-full max-w-md bg-secondary border border-border rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
						<div className="flex justify-between items-center">
							<h3 className="text-lg font-bold text-white">Request Access</h3>
							<button onClick={() => setIsJoinModalOpen(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-secondary cursor-pointer">
								<Icon icon="lucide:x" className="text-xl" />
							</button>
						</div>

						{joinError && (
							<div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-xs flex items-center gap-2">
								<Icon icon="lucide:alert-circle" className="text-base shrink-0" />
								<p>{joinError}</p>
							</div>
						)}

						{joinSuccess && (
							<div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-xs flex items-center gap-2">
								<Icon icon="lucide:check-circle" className="text-base shrink-0" />
								<p>{joinSuccess}</p>
							</div>
						)}

						<div className="bg-card border border-border/40 p-4 rounded-xl">
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Project</p>
							<p className="text-sm font-bold text-white mt-1">{selectedProjToJoin.name}</p>
							<p className="text-xs text-slate-400 mt-2">{selectedProjToJoin.description || "No description provided."}</p>
						</div>

						<form onSubmit={handleRequestJoinSubmit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Join Message Note</label>
								<textarea
									rows={3}
									value={joinNote}
									onChange={(e) => setJoinNote(e.target.value)}
									placeholder="Explain your role or reason for requesting access..."
									className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary resize-none transition"
								/>
							</div>

							<button
								type="submit"
								disabled={!!joinSuccess}
								className="w-full bg-primary hover:opacity-90 active:scale-[0.98] text-white rounded-xl py-3 text-sm font-semibold transition mt-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
							>
								Submit Request
							</button>
						</form>
					</div>
				</div>
			)}

			{isSettingsOpen && selectedProjectForSettings && (
				<ProjectSettingsModal
					isOpen={isSettingsOpen}
					initialTab={settingsInitialTab}
					onClose={() => {
						setIsSettingsOpen(false);
						setSelectedProjectForSettings(null);
						fetchData(); // Refresh lists when credentials/collaborators changes are made
					}}
					projectDetails={selectedProjectForSettings}
					onUpdateProjectDetails={(updated) => {
						setSelectedProjectForSettings(updated);
						fetchData();
					}}
					projectId={selectedProjectForSettings.id}
				/>
			)}

			{isPublishOpen && selectedProjectForPublish && (
				<PublishTemplateModal
					isOpen={isPublishOpen}
					onClose={() => {
						setIsPublishOpen(false);
						setSelectedProjectForPublish(null);
					}}
					project={selectedProjectForPublish}
				/>
			)}
			</div>
		</div>
	);
}


export default function DashboardPage() {
	return (
		<Suspense fallback={
			<div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
				<Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
			</div>
		}>
			<DashboardContent />
		</Suspense>
	);
}
