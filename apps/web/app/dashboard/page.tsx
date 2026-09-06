'use client';

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import { ProjectSettingsModal } from '../components/ProjectSettingsModal';
import { TiltCard } from '../components/landing/TiltCard';
import type { Project } from '../lib/types';

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

	return (
		<div className="min-h-screen w-full bg-background flex flex-col text-slate-200 font-sans">
			{/* Top Header */}
			<header className="sticky top-0 z-20 border-b border-border/60 bg-card/80 backdrop-blur-xl">
				<div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
					<Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" title="Home">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-input shadow-md">
							<div className="h-4 w-4 rounded-md bg-gradient-to-br from-primary to-amber-400"></div>
						</div>
						<div>
							<p className="text-sm font-semibold tracking-wide text-white">Whiparc</p>
							<p className="text-xs text-slate-400">Workspace Dashboard</p>
						</div>
					</Link>

					<div className="flex items-center gap-4">
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
			</header>

			{/* Main Content Area */}
			<main className="flex-grow mx-auto w-full max-w-7xl px-6 py-12 lg:px-10 flex flex-col gap-10">
				{/* Welcome Banner */}
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-8">
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-white">Welcome back, {user.name}!</h1>
						<p className="text-sm text-slate-400 mt-1">Select a workspace to design and deploy, or request access to other teams&apos; projects.</p>
					</div>
					<button
						onClick={() => setIsCreateModalOpen(true)}
						className="flex items-center gap-2 rounded-xl bg-primary hover:opacity-90 active:scale-[0.98] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition cursor-pointer"
					>
						<Icon icon="lucide:plus" className="text-lg" />
						<span>Create Project</span>
					</button>
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
						<div className="text-3xl mb-3">📁</div>
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
												{(project.user_role === 'EDITOR' || project.user_role === 'ADMIN') && (
													<button
														onClick={() => {
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
