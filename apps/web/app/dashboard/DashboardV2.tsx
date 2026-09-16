'use client';

import React, { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import { ProjectSettingsModal } from '../components/ProjectSettingsModal';
import { PublishTemplateModal } from '../components/PublishTemplateModal';
import { BlueprintCorners } from '../components/ui/BlueprintCorners';
import { THEME_PALETTES, type Theme } from '../components/ui/theme-palette';
import { spaceGroteskFont, barlowFont, jetBrainsMonoFont } from '../fonts';
import { STATIC_RUNS, STATIC_ACTIVITY } from './staticData';
import { GridIcon, FolderIcon, LayoutIcon, ActivityIcon, LockIcon, UsersIcon, BookIcon, LogoMark } from './NavIcons';
import type { Project } from '../lib/types';
import '../components/ui/blueprint.css';
import './dashboard.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

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

const NAV_ITEMS: { key: string; label: string; href: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', href: '/dashboard', icon: <GridIcon /> },
  { key: 'projects', label: 'Projects', href: '#projects', icon: <FolderIcon /> },
  { key: 'templates', label: 'Templates', href: '/templates', icon: <LayoutIcon /> },
  { key: 'runs', label: 'Runs', href: '#', icon: <ActivityIcon /> },
  { key: 'credentials', label: 'Credentials', href: '#', icon: <LockIcon /> },
  { key: 'team', label: 'Team', href: '#', icon: <UsersIcon /> },
  { key: 'docs', label: 'Docs', href: '/docs', icon: <BookIcon /> },
];

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono-marketing)',
  fontSize: 9.5,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
};

function greeting(hour: number) {
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user, hasHydrated, logout } = useAuthStore();

  const [theme, setTheme] = useState<Theme>('dark');
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'mine' | 'discover'>('mine');
  const [runFilter, setRunFilter] = useState<'all' | 'failed'>('all');
  const [firstRunDismissed, setFirstRunDismissed] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<Project | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [selectedProjectForPublish, setSelectedProjectForPublish] = useState<Project | null>(null);

  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjVisibility, setNewProjVisibility] = useState('PRIVATE');
  const [newProjTeamId, setNewProjTeamId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedProjToJoin, setSelectedProjToJoin] = useState<Project | null>(null);
  const [joinNote, setJoinNote] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  // Route protection — wait for the persisted store to rehydrate before deciding
  useEffect(() => {
    if (hasHydrated && !token) {
      router.push('/login');
    }
  }, [hasHydrated, token, router]);

  // Auto-open the create-workspace prompt when arriving via ?create=1
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCreateModalOpen(true);
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  const fetchData = useCallback(async () => {
    const activeToken = token;
    if (!activeToken) return;

    setIsLoadingData(true);
    try {
      const teamsRes = await fetch(`${API_URL}/api/teams`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (teamsRes.ok) {
        const fetchedTeams: Team[] = await teamsRes.json();
        setTeams(fetchedTeams);
        if (fetchedTeams.length > 0) setNewProjTeamId(fetchedTeams[0].id);
      }

      const projectsRes = await fetch(`${API_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (projectsRes.ok) {
        const fetchedProjects: Project[] = (await projectsRes.json()) || [];
        setProjects(fetchedProjects);

        const requestsAccumulator: JoinRequest[] = [];
        for (const p of fetchedProjects) {
          if (p && p.user_role === 'ADMIN') {
            const reqsRes = await fetch(`${API_URL}/api/projects/${p.id}/join-requests`, {
              headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (reqsRes.ok) {
              const reqs: JoinRequest[] = await reqsRes.json();
              if (reqs && reqs.length > 0) {
                reqs.forEach((r) => {
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
      console.error('Error fetching dashboard data', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData();
    }
  }, [user, fetchData]);

  const handleOpenWorkspace = (projectId: string) => router.push(`/workspace?project=${projectId}`);
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
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          name: newProjName.trim(),
          description: newProjDesc.trim(),
          visibility: newProjVisibility,
          team_id: newProjTeamId,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Failed to create project');
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
      const res = await fetch(`${API_URL}/api/projects/${selectedProjToJoin.id}/join-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ note: joinNote.trim() }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Failed to submit join request');
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
      const endpoint = approve ? 'approve' : 'reject';
      const res = await fetch(`${API_URL}/api/projects/${projectId}/join-requests/${reqId}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to review request', err);
    }
  };

  const palette = THEME_PALETTES[theme];
  const rootVars = useMemo(
    () =>
      ({
        ...palette,
        background: palette['--ground'],
        color: palette['--ink'],
      }) as CSSProperties,
    [palette]
  );

  const now = useState(() => new Date())[0];
  const dateLabel = useMemo(
    () =>
      now
        .toLocaleString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
        .replace(',', ' ·'),
    [now]
  );

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07080B', color: '#94A3B8' }}>
        <Icon icon="lucide:loader-2" className="animate-spin" width={28} />
      </div>
    );
  }

  const myProjects = projects.filter((p) => p.user_role !== '');
  const discoverProjects = projects.filter((p) => p.user_role === '');
  const visibleProjects = (view === 'mine' ? myProjects : discoverProjects).filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const runs = runFilter === 'failed' ? STATIC_RUNS.filter((r) => r.status === 'failed') : STATIC_RUNS;
  const isFirstRun = !firstRunDismissed && myProjects.length <= 1;
  const primaryTeam = teams[0];
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`${spaceGroteskFont.variable} ${barlowFont.variable} ${jetBrainsMonoFont.variable}`}
      style={{ ...rootVars, display: 'flex', alignItems: 'stretch', minHeight: '100vh', fontSize: 15, lineHeight: 1.55, transition: 'background .3s ease, color .3s ease', fontFamily: 'var(--font-body-marketing), system-ui, sans-serif' }}
    >
      <aside style={{ width: 216, flex: 'none', borderRight: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh' }}>
        <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 24, height: 24, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LogoMark size={24} />
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>whiparc</span>
        </div>

        <nav style={{ padding: '14px 10px', display: 'grid', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === 'overview';
            const content = (
              <>
                {item.icon}
                {item.label}
              </>
            );
            const style: CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              fontSize: 14.5,
              color: active ? '#fff' : 'var(--ink2)',
              background: active ? 'var(--accent)' : 'transparent',
            };
            return item.href.startsWith('/') ? (
              <Link key={item.key} href={item.href} className={active ? undefined : 'wp-dash-navlink'} style={style}>
                {content}
              </Link>
            ) : (
              <a key={item.key} href={item.href} className={active ? undefined : 'wp-dash-navlink'} style={style}>
                {content}
              </a>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <span style={{ width: 7, height: 7, flexShrink: 0, background: 'var(--accent-ink)', animation: 'wpBeat 2.2s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 10.5, color: 'var(--accent-ink)' }}>sandbox online</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
            <span style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-hover)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12 }}>
              {initials || 'U'}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>{user.name}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.plan || 'Member'}
                {primaryTeam ? ` · ${primaryTeam.name}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="wp-dash-iconbtn"
              style={{ marginLeft: 'auto', width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink2)', cursor: 'pointer' }}
            >
              <Icon icon="lucide:log-out" width={13} />
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,2.5vw,28px)', borderBottom: '1px solid var(--line)', background: 'var(--ground)', position: 'sticky', top: 0, zIndex: 20 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', fontSize: 14, border: '1px solid var(--line)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
            {primaryTeam?.name || 'personal'}
          </span>
          <div style={{ flex: 1, maxWidth: 340, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 32, border: '1px solid var(--line)', background: 'transparent' }}>
            <Icon icon="lucide:search" width={14} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects"
              className="wp-dash-input"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--font-body-marketing), sans-serif' }}
            />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              title="Toggle theme"
              className="wp-dash-iconbtn"
              style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink2)', cursor: 'pointer' }}
            >
              <Icon icon={theme === 'light' ? 'lucide:moon' : 'lucide:sun'} width={15} />
            </button>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="wp-dash-submit"
              style={{ position: 'relative', height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', fontSize: 13.5, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}
            >
              New project
            </button>
          </div>
        </header>

        <div style={{ padding: 'clamp(20px,3vw,32px) clamp(16px,2.5vw,28px) 48px', display: 'grid', gap: 'clamp(20px,2.5vw,28px)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'clamp(26px,3vw,34px)', lineHeight: 1.1, color: 'var(--ink)' }}>
                {greeting(now.getHours())}, {user.name.split(' ')[0]}
              </h1>
              <p style={{ margin: '5px 0 0', fontSize: 14.5, color: 'var(--ink2)' }}>Here&apos;s what&apos;s happening across your workspaces.</p>
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-mono-marketing)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{dateLabel}</p>
          </div>

          {isFirstRun && (
            <div className="wp-blueprint" style={{ position: 'relative', background: 'var(--panel)', padding: '22px 24px' }}>
              <BlueprintCorners />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>Three steps to your first free deploy</h2>
                <button type="button" onClick={() => setFirstRunDismissed(true)} style={{ height: 28, padding: '0 8px', fontSize: 13, color: 'var(--ink2)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                  Dismiss
                </button>
              </div>
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 18 }}>
                <div style={{ display: 'flex', gap: 11 }}>
                  <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: myProjects.length > 0 ? 'var(--accent)' : 'transparent', border: myProjects.length > 0 ? undefined : '1px solid var(--accent-ink)', color: myProjects.length > 0 ? '#fff' : 'var(--accent-ink)', fontFamily: 'var(--font-mono-marketing)', fontSize: 11 }}>
                    {myProjects.length > 0 ? '✓' : '1'}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>Create a project</p>
                    <p style={{ margin: '1px 0 0', fontSize: 13.5, color: 'var(--ink2)' }}>{myProjects.length > 0 ? `Done — ${myProjects[0].name} is below.` : 'Blank canvas, a template, or import HCL.'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 11 }}>
                  <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-ink)', color: 'var(--accent-ink)', fontFamily: 'var(--font-mono-marketing)', fontSize: 11 }}>2</span>
                  <div>
                    <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>Start the sandbox</p>
                    <p style={{ margin: '1px 0 0', fontFamily: 'var(--font-mono-marketing)', fontSize: 12, color: 'var(--ink2)' }}>whiparc sandbox up</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 11 }}>
                  <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', color: 'var(--ink2)', fontFamily: 'var(--font-mono-marketing)', fontSize: 11 }}>3</span>
                  <div>
                    <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>Deploy it</p>
                    <p style={{ margin: '1px 0 0', fontSize: 13.5, color: 'var(--ink2)' }}>Local target. Costs nothing.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
            <div style={{ border: '1px solid var(--line)', padding: '14px 16px' }}>
              <p style={labelStyle}>Last deploy</p>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1, color: 'var(--ink)' }}>2h ago</p>
              <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink2)' }}>platform-infra · success</p>
            </div>
            <div style={{ border: '1px solid var(--line)', padding: '14px 16px' }}>
              <p style={labelStyle}>Runs, last 7 days</p>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1, color: 'var(--ink)' }}>23</p>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
                {[70, 100, 45, 85, 60, 95, 75].map((h, i) => (
                  <span key={i} style={{ flex: 1, height: `${h}%`, background: i === 2 ? 'var(--line)' : i === 6 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)' }} />
                ))}
              </div>
            </div>
            <div style={{ border: '1px solid var(--line)', padding: '14px 16px' }}>
              <p style={labelStyle}>Needs a look</p>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1, color: 'var(--danger)' }}>2 failed</p>
              <p style={{ margin: '5px 0 0', fontSize: 13 }}>
                <a href="#" className="wp-dash-link" style={{ color: 'var(--accent-ink)' }}>
                  edge-cache, both on apply
                </a>
              </p>
            </div>
            <div style={{ border: '1px solid var(--line)', padding: '14px 16px' }}>
              <p style={labelStyle}>Cloud spend this month</p>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1, color: 'var(--ink)' }}>$0.00</p>
              <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink2)' }}>19 of 23 runs were local</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(250px,1fr)', gap: 'clamp(18px,2vw,24px)', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 'clamp(18px,2vw,24px)', minWidth: 0 }}>
              <section id="projects">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>{view === 'mine' ? 'Your projects' : 'Discover projects'}</h2>
                  <button
                    type="button"
                    onClick={() => setView((v) => (v === 'mine' ? 'discover' : 'mine'))}
                    className="wp-dash-link"
                    style={{ fontSize: 13.5, color: 'var(--accent-ink)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                  >
                    {view === 'mine' ? `Discover public projects (${discoverProjects.length}) →` : '← Your projects'}
                  </button>
                </div>

                {isLoadingData ? (
                  <div style={{ padding: '32px 0', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink2)' }}>
                    <Icon icon="lucide:loader-2" className="animate-spin" width={18} />
                    <span style={{ fontSize: 13.5 }}>Loading projects…</span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                    {visibleProjects.map((project) => (
                      <div key={project.id} className="wp-blueprint wp-dash-project-card" style={{ position: 'relative', background: 'var(--panel)', padding: 16, color: 'var(--ink)' }}>
                        <BlueprintCorners />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => (project.user_role ? handleOpenWorkspace(project.id) : undefined)}
                            style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, background: 'none', border: 0, padding: 0, color: 'inherit', cursor: project.user_role ? 'pointer' : 'default', textAlign: 'left' }}
                          >
                            {project.name}
                          </button>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono-marketing)',
                              fontSize: 10,
                              letterSpacing: '.08em',
                              textTransform: 'uppercase',
                              padding: '2px 7px',
                              color: project.visibility === 'PUBLIC' ? 'var(--ink2)' : 'var(--accent-ink)',
                              background: project.visibility === 'PUBLIC' ? 'var(--chip)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
                            }}
                          >
                            {project.visibility.toLowerCase()}
                          </span>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {project.description || 'No description provided.'}
                        </p>
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
                          <span style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 11 }}>{project.user_role ? project.user_role.toLowerCase() : 'not a member'}</span>
                          {project.user_role ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {project.user_role === 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectForPublish(project);
                                    setIsPublishOpen(true);
                                  }}
                                  title="Publish as template"
                                  className="wp-dash-iconbtn"
                                  style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink2)', cursor: 'pointer' }}
                                >
                                  <Icon icon="lucide:upload-cloud" width={13} />
                                </button>
                              )}
                              {(project.user_role === 'EDITOR' || project.user_role === 'ADMIN') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectForSettings(project);
                                    setIsSettingsOpen(true);
                                  }}
                                  title="Project settings"
                                  className="wp-dash-iconbtn"
                                  style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink2)', cursor: 'pointer' }}
                                >
                                  <Icon icon="lucide:settings" width={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenWorkspace(project.id)}
                                className="wp-dash-submit"
                                style={{ height: 26, padding: '0 10px', fontSize: 12.5, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}
                              >
                                Open
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjToJoin(project);
                                setIsJoinModalOpen(true);
                              }}
                              className="wp-dash-submit"
                              style={{ height: 26, padding: '0 10px', fontSize: 12.5, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}
                            >
                              Request access
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {view === 'mine' && (
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(true)}
                        className="wp-dash-new-project"
                        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, border: '1px dashed var(--line)', padding: 16, color: 'var(--ink2)', minHeight: 118, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>+ New project</span>
                        <span style={{ fontSize: 12.5 }}>Blank canvas, a template, or import existing HCL.</span>
                      </button>
                    )}
                    {visibleProjects.length === 0 && view === 'discover' && (
                      <p style={{ fontSize: 13.5, color: 'var(--ink2)' }}>No discoverable projects match your search.</p>
                    )}
                  </div>
                )}
              </section>

              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>Recent runs</h2>
                  <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)' }}>
                    <button
                      type="button"
                      onClick={() => setRunFilter('all')}
                      style={{ padding: '5px 12px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', border: 0, background: runFilter === 'all' ? 'var(--accent)' : 'transparent', color: runFilter === 'all' ? '#fff' : 'var(--ink2)' }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRunFilter('failed')}
                      style={{ padding: '5px 12px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', border: 0, borderLeft: '1px solid var(--line)', background: runFilter === 'failed' ? 'var(--accent)' : 'transparent', color: runFilter === 'failed' ? '#fff' : 'var(--ink2)' }}
                    >
                      Failed only
                    </button>
                  </div>
                </div>
                <div style={{ border: '1px solid var(--line)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr>
                        {['Run', 'Project', 'Target', 'Duration', 'When', 'Status'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink3)', padding: '9px 12px', borderBottom: '1px solid var(--line)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className="wp-dash-navlink">
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-mono-marketing)', fontSize: 12, color: 'var(--ink)' }}>{run.id}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', color: 'var(--ink)' }}>{run.project}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-mono-marketing)', fontSize: 12, color: 'var(--ink2)' }}>{run.target}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-mono-marketing)', fontSize: 12, color: 'var(--ink2)' }}>{run.dur}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', color: 'var(--ink2)' }}>{run.when}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink)' }}>
                              <span style={{ width: 6, height: 6, background: run.status === 'failed' ? 'var(--danger)' : 'var(--accent-ink)' }} />
                              {run.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div style={{ display: 'grid', gap: 'clamp(18px,2vw,24px)', minWidth: 0 }}>
              <section className="wp-blueprint" style={{ position: 'relative', background: 'var(--panel)', padding: 16 }}>
                <BlueprintCorners />
                <p style={labelStyle}>Local sandbox agent</p>
                <p style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--ink)' }}>
                  <span style={{ width: 8, height: 8, background: 'var(--accent-ink)', animation: 'wpBeat 2.2s ease-in-out infinite' }} />
                  Connected
                </p>
                <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono-marketing)', fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
                  heartbeat 22s ago · cli 1.0.0
                  <br />
                  localstack + 3 ssh targets up
                </p>
                <p style={{ margin: '12px 0 0', fontSize: 13.5, color: 'var(--ink2)' }}>
                  Deploys aimed at <span style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 12, color: 'var(--ink)' }}>local_agent</span> will run here.
                </p>
                <a href="#" className="wp-dash-ghost" style={{ marginTop: 12, width: '100%', height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  Open sandbox logs
                </a>
              </section>

              {joinRequests.length > 0 && (
                <section style={{ border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 9%, transparent)', padding: 16 }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-mono-marketing)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>Waiting on you</p>
                  <p style={{ margin: '9px 0 0', fontSize: 14.5, color: 'var(--ink)' }}>
                    <strong style={{ fontWeight: 700 }}>{joinRequests[0].user_name}</strong> asked for access to{' '}
                    <span style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 12.5 }}>{joinRequests[0].project_name}</span>.
                  </p>
                  {joinRequests[0].note && <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink2)' }}>&quot;{joinRequests[0].note}&quot;</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => handleReviewRequest(joinRequests[0].project_id, joinRequests[0].id, true)}
                      className="wp-dash-submit"
                      style={{ height: 32, padding: '0 14px', fontSize: 13.5, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewRequest(joinRequests[0].project_id, joinRequests[0].id, false)}
                      style={{ height: 32, padding: '0 14px', fontSize: 13.5, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--accent)', cursor: 'pointer' }}
                    >
                      Decline
                    </button>
                  </div>
                  {joinRequests.length > 1 && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink2)' }}>+{joinRequests.length - 1} more waiting</p>}
                </section>
              )}

              <section style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <p style={labelStyle}>Activity</p>
                <div style={{ marginTop: 10, display: 'grid', gap: 10, fontSize: 13.5, color: 'var(--ink)' }}>
                  {STATIC_ACTIVITY.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9 }}>
                      <span style={{ fontFamily: 'var(--font-mono-marketing)', fontSize: 11, color: 'var(--ink3)', width: 34, flexShrink: 0 }}>{a.when}</span>
                      <p style={{ margin: 0 }}>{a.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}>
          <div className="wp-blueprint" style={{ position: 'relative', width: '100%', maxWidth: 420, background: 'var(--panel)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <BlueprintCorners />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>New project</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 0, color: 'var(--ink2)', cursor: 'pointer' }}>
                <Icon icon="lucide:x" width={18} />
              </button>
            </div>

            {createError && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 14%, transparent)', fontSize: 12.5, color: 'var(--ink)' }}>
                <Icon icon="lucide:alert-circle" width={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--danger)' }} />
                <p style={{ margin: 0 }}>{createError}</p>
              </div>
            )}

            <form onSubmit={handleCreateProjectSubmit} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Project name</span>
                <input
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g. platform-infra"
                  className="wp-dash-input"
                  style={{ height: 40, padding: '0 12px', border: '1px solid var(--line)', background: 'var(--elevated)', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Description</span>
                <textarea
                  rows={3}
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Describe the stack, templates, and targets…"
                  className="wp-dash-input"
                  style={{ padding: 12, border: '1px solid var(--line)', background: 'var(--elevated)', color: 'var(--ink)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body-marketing), sans-serif' }}
                />
              </label>
              {teams.length > 0 && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={labelStyle}>Team</span>
                  <select
                    value={newProjTeamId}
                    onChange={(e) => setNewProjTeamId(e.target.value)}
                    className="wp-dash-input"
                    style={{ height: 40, padding: '0 12px', border: '1px solid var(--line)', background: 'var(--elevated)', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Visibility</span>
                <select
                  value={newProjVisibility}
                  onChange={(e) => setNewProjVisibility(e.target.value)}
                  className="wp-dash-input"
                  style={{ height: 40, padding: '0 12px', border: '1px solid var(--line)', background: 'var(--elevated)', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
                >
                  <option value="PRIVATE">Private — explicit invites only</option>
                  <option value="TEAM">Team — visible to your organization</option>
                  <option value="PUBLIC">Public — discoverable &amp; requestable</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={isCreating}
                className="wp-blueprint wp-dash-submit"
                style={{ position: 'relative', height: 42, background: 'var(--accent)', color: '#fff', border: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, cursor: isCreating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isCreating ? 0.7 : 1 }}
              >
                <BlueprintCorners />
                {isCreating ? <Icon icon="lucide:loader-2" className="animate-spin" width={16} /> : 'Create project'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isJoinModalOpen && selectedProjToJoin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}>
          <div className="wp-blueprint" style={{ position: 'relative', width: '100%', maxWidth: 420, background: 'var(--panel)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <BlueprintCorners />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>Request access</h3>
              <button
                type="button"
                onClick={() => {
                  setIsJoinModalOpen(false);
                  setSelectedProjToJoin(null);
                }}
                style={{ background: 'none', border: 0, color: 'var(--ink2)', cursor: 'pointer' }}
              >
                <Icon icon="lucide:x" width={18} />
              </button>
            </div>

            {joinError && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 14%, transparent)', fontSize: 12.5, color: 'var(--ink)' }}>
                <Icon icon="lucide:alert-circle" width={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--danger)' }} />
                <p style={{ margin: 0 }}>{joinError}</p>
              </div>
            )}
            {joinSuccess && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', border: '1px solid var(--success)', background: 'color-mix(in srgb, var(--success) 14%, transparent)', fontSize: 12.5, color: 'var(--ink)' }}>
                <Icon icon="lucide:check-circle" width={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--success)' }} />
                <p style={{ margin: 0 }}>{joinSuccess}</p>
              </div>
            )}

            <div style={{ border: '1px solid var(--line)', padding: 12, background: 'var(--elevated)' }}>
              <p style={labelStyle}>Project</p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{selectedProjToJoin.name}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink2)' }}>{selectedProjToJoin.description || 'No description provided.'}</p>
            </div>

            <form onSubmit={handleRequestJoinSubmit} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={labelStyle}>Note</span>
                <textarea
                  rows={3}
                  value={joinNote}
                  onChange={(e) => setJoinNote(e.target.value)}
                  placeholder="Explain your role or reason for requesting access…"
                  className="wp-dash-input"
                  style={{ padding: 12, border: '1px solid var(--line)', background: 'var(--elevated)', color: 'var(--ink)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body-marketing), sans-serif' }}
                />
              </label>
              <button
                type="submit"
                disabled={!!joinSuccess}
                className="wp-dash-submit"
                style={{ height: 42, background: 'var(--accent)', color: '#fff', border: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, cursor: joinSuccess ? 'default' : 'pointer', opacity: joinSuccess ? 0.6 : 1 }}
              >
                Submit request
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
            fetchData();
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
  );
}

export function DashboardV2() {
  return <DashboardContent />;
}
