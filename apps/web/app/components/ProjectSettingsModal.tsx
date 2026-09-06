import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import { CredentialManagerTab } from './CredentialManagerModal';
import type { Project } from '../lib/types';

interface Member {
  user_id: string;
  user_name: string;
  email: string;
  role: string;
}

interface SandboxAgent {
  agent_id: string;
  name: string;
  status: string;
  registered_at: string;
  last_seen_at?: string;
}

interface CredentialItem {
  id: string;
  project_id: string;
  provider: string;
  name: string;
  key_fingerprint: string;
  created_at: string;
}

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectDetails: Project;
  onUpdateProjectDetails: (updated: Project) => void;
  projectId: string;
  onCredentialsChange?: (credentials: CredentialItem[]) => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  onClose,
  projectDetails,
  onUpdateProjectDetails,
  projectId,
  onCredentialsChange
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'credentials' | 'agents' | 'danger'>('general');
  const [name, setName] = useState(projectDetails?.name || '');
  const [description, setDescription] = useState(projectDetails?.description || '');
  const [visibility, setVisibility] = useState(projectDetails?.visibility || 'PRIVATE');
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [agents, setAgents] = useState<SandboxAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsSupported, setAgentsSupported] = useState(true);
  const [revokingAgentId, setRevokingAgentId] = useState<string | null>(null);
  const router = useRouter();

  const { user, token } = useAuthStore();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const activeToken = token;
  const isAdmin = projectDetails?.user_role === 'ADMIN';

  // Sync state if project details loaded after mount
  useEffect(() => {
    if (projectDetails) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(projectDetails.name || '');
      setDescription(projectDetails.description || '');
      setVisibility(projectDetails.visibility || 'PRIVATE');
    }
  }, [projectDetails]);

  // Fetch project members on load or tab switch to members
  useEffect(() => {
    if (!isOpen || activeTab !== 'members' || !activeToken) return;

    const fetchMembers = async () => {
      setMembersLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMembers(data);
        }
      } catch (err) {
        console.error("Failed to fetch members", err);
      } finally {
        setMembersLoading(false);
      }
    };

    fetchMembers();
  }, [isOpen, activeTab, projectId, API_URL, activeToken]);

  // Fetch paired sandbox agents on load or tab switch to agents. A 404 means
  // the SANDBOX_AGENT_BETA feature flag is off on this deployment entirely —
  // treated as "hide this tab's content," not an error, the same way the
  // workspace header's connection badge already treats a 404.
  useEffect(() => {
    if (!isOpen || activeTab !== 'agents' || !activeToken) return;

    const fetchAgents = async () => {
      setAgentsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/agents`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (res.ok) {
          setAgentsSupported(true);
          setAgents(await res.json());
        } else if (res.status === 404) {
          setAgentsSupported(false);
        }
      } catch (err) {
        console.error("Failed to fetch paired agents", err);
      } finally {
        setAgentsLoading(false);
      }
    };

    fetchAgents();
  }, [isOpen, activeTab, projectId, API_URL, activeToken]);

  if (!isOpen) return null;

  const handleGeneralSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ name, description, visibility })
      });

      if (res.ok) {
        onUpdateProjectDetails({ ...projectDetails, name, description, visibility });
        onClose();
      } else {
        const errText = await res.text();
        alert("Failed to update project: " + errText);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving project settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !activeToken) return;

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });

      if (res.ok) {
        setInviteEmail('');
        // Re-fetch members list
        const mRes = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (mRes.ok) {
          const data = await mRes.json();
          setMembers(data);
        }
      } else {
        const errText = await res.text();
        alert("Failed to invite collaborator: " + errText);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!activeToken) return;

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members/${targetUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m));
      } else {
        const errText = await res.text();
        alert("Failed to update member role: " + errText);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeToken || !confirm("Are you sure you want to remove this collaborator?")) return;

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members/${targetUserId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.user_id !== targetUserId));
      } else {
        const errText = await res.text();
        alert("Failed to remove member: " + errText);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevokeAgent = async (agentId: string) => {
    if (!activeToken || !confirm("Revoke this agent? It will be disconnected immediately and its pairing token invalidated — the machine will need to re-run `infracanvas sandbox up` to pair again.")) return;

    setRevokingAgentId(agentId);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/agents/${agentId}/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        setAgents(prev => prev.map(a => a.agent_id === agentId ? { ...a, status: 'REVOKED' } : a));
      } else {
        const errText = await res.text();
        alert("Failed to revoke agent: " + errText);
      }
    } catch (err) {
      console.error(err);
      alert("Error revoking agent");
    } finally {
      setRevokingAgentId(null);
    }
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirm !== projectDetails?.name) {
      alert("Please type the project name exactly to confirm deletion.");
      return;
    }
    if (!activeToken) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        onClose();
        router.push('/dashboard');
      } else {
        const errText = await res.text();
        alert("Failed to delete project: " + errText);
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-secondary border border-border rounded-2xl shadow-2xl w-[600px] max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
          <div>
            <h3 className="text-lg font-heading font-bold text-white">Project Settings</h3>
            <p className="text-xs text-slate-400">Configure visibility, collaborators, and dashboard settings.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-secondary transition-all cursor-pointer"
          >
            <Icon icon="lucide:x" className="text-lg" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 border-b border-border flex gap-4 bg-card/10 text-sm">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 border-b-2 font-medium transition-all cursor-pointer ${
              activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            General Settings
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 border-b-2 font-medium transition-all cursor-pointer ${
              activeTab === 'members' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Collaborators
          </button>
          <button
            onClick={() => setActiveTab('credentials')}
            className={`py-3 border-b-2 font-medium transition-all cursor-pointer ${
              activeTab === 'credentials' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Cloud Credentials
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`py-3 border-b-2 font-medium transition-all cursor-pointer ${
              activeTab === 'agents' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Sandbox Agents
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('danger')}
              className={`py-3 border-b-2 font-medium transition-all cursor-pointer ${
                activeTab === 'danger' ? 'border-rose-500 text-rose-500' : 'border-transparent text-slate-400 hover:text-rose-500'
              }`}
            >
              Danger Zone
            </button>
          )}
        </div>

        {/* Body content */}
        <div className="flex-grow overflow-y-auto p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800">
          
          {/* CREDENTIALS TAB */}
          {activeTab === 'credentials' && (
            <CredentialManagerTab 
              projectId={projectId} 
              token={activeToken} 
              onCredentialsChange={onCredentialsChange} 
            />
          )}

          {/* GENERAL SETTINGS */}
          {activeTab === 'general' && (
            <form onSubmit={handleGeneralSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin}
                  required
                  className="w-full px-3 py-2 bg-background/40 border border-border rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all disabled:opacity-50"
                  placeholder="e.g. Production Cluster Setup"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                  rows={3}
                  className="w-full px-3 py-2 bg-background/40 border border-border rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all disabled:opacity-50 resize-none"
                  placeholder="Configure AWS infrastructure deploying EC2 instances..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Project Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 bg-background/40 border border-border rounded-lg text-white focus:outline-none focus:border-primary transition-all disabled:opacity-50 cursor-pointer"
                >
                  <option value="PRIVATE">Private (Only selected members)</option>
                  <option value="TEAM">Team (Accessible to team organization members)</option>
                  <option value="PUBLIC">Public Catalog (Discoverable by everyone)</option>
                </select>
              </div>

              {isAdmin ? (
                <div className="pt-4 flex justify-end gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm bg-secondary text-slate-200 hover:bg-input rounded-lg transition-all cursor-pointer font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-primary text-white hover:opacity-95 rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-1.5 disabled:opacity-55"
                  >
                    {loading && <Icon icon="lucide:loader-2" className="animate-spin text-sm" />}
                    Save Changes
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-medium flex items-center gap-2">
                  <Icon icon="lucide:lock" className="text-base shrink-0" />
                  Visibility and name modifications are limited to project administrators.
                </div>
              )}
            </form>
          )}

          {/* MEMBERS LIST */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              
              {/* Add Member form for Admin */}
              {isAdmin && (
                <form onSubmit={handleInvite} className="bg-card/30 p-4 border border-border/80 rounded-xl space-y-3">
                  <h4 className="text-sm font-semibold text-white">Add Collaborator</h4>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      placeholder="user@infracanvas.com"
                      className="flex-1 px-3 py-1.5 bg-background/50 border border-border rounded-lg text-white focus:outline-none focus:border-primary transition-all text-sm"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-3 py-1.5 bg-background/50 border border-border rounded-lg text-white focus:outline-none focus:border-primary transition-all text-sm cursor-pointer"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-primary text-white hover:opacity-95 rounded-lg transition-all cursor-pointer text-sm font-semibold flex items-center gap-1"
                    >
                      <Icon icon="lucide:plus" className="text-sm" /> Add
                    </button>
                  </div>
                </form>
              )}

              {/* Members listing */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Workspace Members</h4>
                {membersLoading ? (
                  <div className="py-6 flex justify-center text-slate-400">
                    <Icon icon="lucide:loader-2" className="animate-spin text-xl text-primary" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">No collaborators added.</div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-border rounded-xl overflow-hidden bg-background/10">
                    {members.map((m) => {
                      const initials = m.user_name ? m.user_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';
                      const isOwner = m.user_id === projectDetails?.created_by;
                      return (
                        <div key={m.user_id} className="p-3.5 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/30 to-amber-500/30 border border-primary/20 flex items-center justify-center font-heading font-bold text-primary text-xs shrink-0">
                              {initials}
                            </div>
                            <div>
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                {m.user_name}
                                {isOwner && (
                                  <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-bold uppercase rounded border border-amber-500/25">Owner</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">{m.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {isAdmin && !isOwner && m.user_id !== user?.id ? (
                              <>
                                <select
                                  value={m.role}
                                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                                  className="px-2 py-1 bg-secondary border border-border rounded text-xs text-white focus:outline-none cursor-pointer"
                                >
                                  <option value="VIEWER">Viewer</option>
                                  <option value="EDITOR">Editor</option>
                                  <option value="ADMIN">Admin</option>
                                </select>
                                <button
                                  onClick={() => handleRemoveMember(m.user_id)}
                                  className="p-1 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded transition-all cursor-pointer"
                                  title="Remove Member"
                                >
                                  <Icon icon="lucide:user-minus" className="text-sm" />
                                </button>
                              </>
                            ) : (
                              <span className="px-2 py-1 bg-secondary text-slate-400 text-xs font-semibold rounded uppercase tracking-wider border border-border">
                                {m.role}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SANDBOX AGENTS */}
          {activeTab === 'agents' && (
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paired Sandbox Agents</h4>
                <p className="text-xs text-slate-500 mt-1">Machines paired via `infracanvas sandbox up` that can run this project&apos;s deploys locally. Revoking disconnects an agent immediately and invalidates its pairing token.</p>
              </div>
              {agentsLoading ? (
                <div className="py-6 flex justify-center text-slate-400">
                  <Icon icon="lucide:loader-2" className="animate-spin text-xl text-primary" />
                </div>
              ) : !agentsSupported ? (
                <div className="py-6 text-center text-sm text-slate-400">Local Sandbox Agents aren&apos;t enabled on this deployment.</div>
              ) : agents.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">No sandbox agents have been paired to this project yet.</div>
              ) : (
                <div className="divide-y divide-slate-800 border border-border rounded-xl overflow-hidden bg-background/10">
                  {agents.map((a) => {
                    const statusStyle: Record<string, string> = {
                      ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      DISCONNECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                      REVOKED: 'bg-secondary text-slate-400 border-border',
                    };
                    const isRevoked = a.status === 'REVOKED';
                    return (
                      <div key={a.agent_id} className="p-3.5 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-semibold text-white flex items-center gap-2">
                            {a.name}
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${statusStyle[a.status] || statusStyle.REVOKED}`}>
                              {a.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{a.agent_id}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Paired {new Date(a.registered_at).toLocaleString()}
                            {a.last_seen_at && ` · Last seen ${new Date(a.last_seen_at).toLocaleString()}`}
                          </div>
                        </div>
                        {!isRevoked && (
                          <button
                            onClick={() => handleRevokeAgent(a.agent_id)}
                            disabled={revokingAgentId === a.agent_id}
                            className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                          >
                            {revokingAgentId === a.agent_id && <Icon icon="lucide:loader-2" className="animate-spin text-xs" />}
                            Revoke
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DANGER ZONE (DELETE PROJECT) */}
          {activeTab === 'danger' && isAdmin && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-xl space-y-2">
                <h4 className="font-bold flex items-center gap-1.5 text-sm uppercase tracking-wide">
                  <Icon icon="lucide:alert-triangle" className="text-lg text-rose-400" />
                  Warning: Irreversible action
                </h4>
                <p className="text-xs leading-relaxed text-rose-400/90">
                  Deleting this project will permanently remove the canvas configurations, parameter inputs, live deployment credentials, and execution histories from the workspace. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteProject} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Please type <strong className="text-white select-all">{projectDetails?.name}</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-[#20070A] border border-rose-500/35 rounded-lg text-rose-200 focus:outline-none focus:border-rose-500 transition-all"
                    placeholder="Project name"
                  />
                </div>

                <div className="pt-2 flex justify-end border-t border-border">
                  <button
                    type="submit"
                    disabled={loading || deleteConfirm !== projectDetails?.name}
                    className="px-4 py-2 text-sm bg-rose-600 text-white hover:bg-rose-500 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 disabled:opacity-55"
                  >
                    {loading && <Icon icon="lucide:loader-2" className="animate-spin text-sm" />}
                    Permanently Delete Project
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
