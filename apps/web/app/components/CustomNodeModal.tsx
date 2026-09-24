'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';
import useCanvasStore from '../store/useCanvasStore';
import type { CustomLibraryNode } from '../store/useCanvasStore';
import { BlueprintCorners } from './ui/BlueprintCorners';
import './ui/blueprint.css';
import './CustomNodeModal.css';

interface CustomNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

interface ValidationError {
  line: number;
  column: number;
  message: string;
}

export default function CustomNodeModal({ isOpen, onClose, projectId }: CustomNodeModalProps) {
  const { user, token, upgradePlan } = useAuthStore();
  const { addCustomLibraryNode, addNode } = useCanvasStore();

  const [tech, setTech] = useState<'Terraform' | 'Ansible' | 'Kubernetes'>('Terraform');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [rawCode, setRawCode] = useState('');
  
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [extractedParams, setExtractedParams] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const isPremium = user?.plan === 'PRO' || user?.plan === 'ENTERPRISE';

  // Sync default code template when tech changes.
  // Resetting the editor's template + validation state to match the
  // selected tech is the intended effect here.
  useEffect(() => {
    if (tech === 'Terraform') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRawCode(`resource "aws_redis_cluster" "redis" {
  cluster_id           = "infra-cache"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = var.node_count
  parameter_group_name = "default.redis7"
  port                 = 6379
}

variable "node_count" {
  type    = number
  default = 1
}`);
    } else if (tech === 'Ansible') {
      setRawCode(`- name: Ensure nginx container is running
  community.docker.docker_container:
    name: nginx-server
    image: "{{ nginx_version }}"
    state: started
    ports:
      - "80:80"`);
    } else if (tech === 'Kubernetes') {
      setRawCode(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: cache-deployment
  labels:
    app: redis-cache
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis-cache
  template:
    metadata:
      labels:
        app: redis-cache
    spec:
      containers:
      - name: redis
        image: redis:7.0-alpine
        ports:
        - containerPort: 6379`);
    }
    setIsValid(false);
    setValidationErrors([]);
    setExtractedParams([]);
  }, [tech]);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    const success = await upgradePlan('PRO');
    setUpgradeLoading(false);
    if (!success) {
      alert("Failed to activate premium sandbox upgrade.");
    }
  };

  const handleValidate = async () => {
    if (!rawCode.trim()) return;
    setIsValidating(true);
    setValidationErrors([]);
    setIsValid(false);

    try {
      const res = await fetch(`${API_URL}/api/custom-nodes/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tech,
          code_type: tech === 'Terraform' ? 'tf' : 'yml',
          raw_code: rawCode
        })
      });

      if (res.ok) {
        const data = await res.json();
        setIsValid(data.valid);
        if (!data.valid) {
          setValidationErrors(data.errors || []);
        } else {
          setExtractedParams(data.extracted_params || []);
        }
      } else {
        const errText = await res.text();
        setValidationErrors([{ line: 1, column: 1, message: "Server validation failed: " + errText }]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setValidationErrors([{ line: 1, column: 1, message: "Failed to connect to syntax engine: " + message }]);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !title.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const metaObj = {
        parameters: extractedParams.reduce((acc, p) => ({ ...acc, [p]: "" }), {})
      };

      const res = await fetch(`${API_URL}/api/projects/${projectId}/custom-nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          tech,
          category: category.trim() || 'Custom Blocks',
          description: description.trim() || `Custom ${tech} Automation Block`,
          code_type: tech === 'Terraform' ? 'tf' : 'yml',
          raw_code: rawCode,
          parsed_meta_json: JSON.stringify(metaObj)
        })
      });

      if (res.ok) {
        const result = await res.json();
        const customBlock: CustomLibraryNode = {
          id: result.id,
          project_id: projectId,
          title,
          tech,
          category: category.trim() || 'Custom Blocks',
          description: description.trim() || `Custom ${tech} Automation Block`,
          code_type: tech === 'Terraform' ? 'tf' : 'yml',
          raw_code: rawCode,
          parsed_meta_json: JSON.stringify(metaObj)
        };

        // Add to local state libraries
        addCustomLibraryNode(customBlock);

        // Instantly drop on canvas at random location close to center
        const posX = 250 + Math.random() * 100;
        const posY = 200 + Math.random() * 100;

        const newNode = {
          id: `custom_${result.id}_${Date.now()}`,
          type: 'customNode',
          position: { x: posX, y: posY },
          data: {
            label: title,
            tech,
            icon: tech === 'Terraform' ? 'devicon:terraform' : tech === 'Ansible' ? 'devicon:ansible' : 'devicon:kubernetes',
            categoryLabel: category.trim() || 'Custom Blocks',
            description: description.trim() || `Custom ${tech} Automation Block`,
            status: 'Validated' as const,
            statusText: 'Custom Block',
            isCustom: true,
            rawCode,
            codeType: tech === 'Terraform' ? 'tf' : 'yml',
            parameters: metaObj.parameters
          }
        };

        addNode(newNode);
        onClose();
      } else {
        const errText = await res.text();
        alert("Failed to save custom block template: " + errText);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Error saving custom template: " + message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      
      {/* PAYWALL UPGRADE STATE */}
      {!isPremium ? (
        <div
          className="wp-blueprint"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wp-cnm-paywall-title"
          style={{ position: 'relative', width: 480, maxWidth: '100%', background: 'var(--panel)', padding: 24 }}
        >
          <BlueprintCorners />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
                border: '1px solid var(--amber)',
                color: 'var(--amber)',
                fontFamily: 'var(--font-mono-marketing, ui-monospace, monospace)',
                fontSize: 9.5,
                letterSpacing: '.08em',
              }}
            >
              <Icon icon="lucide:lock" width={9} />
              PRO
            </span>
            <button
              type="button"
              onClick={onClose}
              className="wp-cnm-close"
              aria-label="Close"
              style={{ background: 'none', border: 0, padding: 4, margin: -4, color: 'var(--ink2)', cursor: 'pointer', display: 'flex' }}
            >
              <Icon icon="lucide:x" width={16} />
            </button>
          </div>

          <h3
            id="wp-cnm-paywall-title"
            style={{ margin: '14px 0 0', fontFamily: 'var(--font-display, inherit)', fontWeight: 600, fontSize: 22, letterSpacing: '-.01em', color: 'var(--ink)' }}
          >
            Upgrade to Premium
          </h3>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink2)' }}>
            Unlock custom visual blocks to upload, syntax validate, and drop your own infrastructure-as-code scripts.
          </p>

          <p
            style={{
              margin: '20px 0 8px',
              fontFamily: 'var(--font-mono-marketing, ui-monospace, monospace)',
              fontSize: 9.5,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--ink3)',
            }}
          >
            Included
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', border: '1px solid var(--line)' }}>
            {[
              'Upload Custom Terraform HCL & Kubernetes Manifests',
              'Author Reusable Ansible Service & Playbook Tasks',
              'Extract Variables Dynamically into the Inspector Panel',
            ].map((feature, i) => (
              <li
                key={feature}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderTop: i === 0 ? 0 : '1px solid var(--line)',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              >
                <Icon icon="lucide:check" width={14} style={{ flexShrink: 0, color: 'var(--accent-ink)' }} />
                {feature}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={upgradeLoading}
              className="wp-blueprint wp-cnm-primary"
              style={{
                height: 42,
                border: 0,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                fontFamily: 'var(--font-display, inherit)',
                fontWeight: 600,
                fontSize: 14,
                cursor: upgradeLoading ? 'default' : 'pointer',
                opacity: upgradeLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <BlueprintCorners />
              {upgradeLoading ? <Icon icon="lucide:loader-2" width={15} className="animate-spin" /> : <Icon icon="lucide:zap" width={15} />}
              Upgrade to Pro (Instant Sandbox)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="wp-cnm-secondary"
              style={{
                height: 40,
                border: '1px solid var(--line)',
                background: 'transparent',
                color: 'var(--ink)',
                fontFamily: 'var(--font-display, inherit)',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
          </div>
        </div>
      ) : (

        /* CODE EDITOR & CREATION DIALOG */
        <div className="bg-card border border-border rounded-xl shadow-2xl w-[800px] h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="text-base font-heading font-bold text-foreground">Create Custom Automation Block</h3>
              <p className="text-[11px] text-muted-foreground">Synthesize your own configuration manifests into draggable visual objects.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all cursor-pointer"
            >
              <Icon icon="lucide:x" className="text-base" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleCreate} className="flex-1 flex overflow-hidden">
            
            {/* Left side inputs */}
            <div className="w-[300px] border-r border-border p-5 space-y-4 overflow-y-auto scrollbar-thin">
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Block Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. AWS Redshift Cluster"
                  className="w-full px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Technology Type</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTechDropdownOpen(!isTechDropdownOpen)}
                    className="w-full px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-all flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>
                      {tech === 'Terraform' && 'Terraform Resource / Module'}
                      {tech === 'Ansible' && 'Ansible Task / Block'}
                      {tech === 'Kubernetes' && 'Kubernetes Resource'}
                    </span>
                    <Icon icon="lucide:chevron-down" className="text-muted-foreground text-xs" />
                  </button>
                  {isTechDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsTechDropdownOpen(false)}></div>
                      <div className="absolute top-full left-0 w-full mt-1 bg-[#161D30] border border-border rounded-lg shadow-xl z-20 overflow-hidden p-1">
                        <button
                          type="button"
                          onClick={() => { setTech('Terraform'); setIsTechDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-primary/20 flex items-center justify-between transition-colors cursor-pointer ${tech === 'Terraform' ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                        >
                          <span>Terraform Resource / Module</span>
                          {tech === 'Terraform' && <Icon icon="lucide:check" className="text-xs" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTech('Ansible'); setIsTechDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-primary/20 flex items-center justify-between transition-colors cursor-pointer ${tech === 'Ansible' ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                        >
                          <span>Ansible Task / Block</span>
                          {tech === 'Ansible' && <Icon icon="lucide:check" className="text-xs" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTech('Kubernetes'); setIsTechDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-primary/20 flex items-center justify-between transition-colors cursor-pointer ${tech === 'Kubernetes' ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                        >
                          <span>Kubernetes Resource</span>
                          {tech === 'Kubernetes' && <Icon icon="lucide:check" className="text-xs" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Category Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Database, Custom Blocks"
                  className="w-full px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="e.g. Deploys custom cache nodes inside production VPCs..."
                  className="w-full px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-all resize-none"
                />
              </div>

              {isValid && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[11px] leading-relaxed">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-xs">
                    <Icon icon="lucide:check-circle-2" className="text-base" /> Validated Successfully
                  </div>
                  {extractedParams.length > 0 ? (
                    <div>
                      Extracted Parameters:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 font-mono text-[10px] text-emerald-400/90 pl-1">
                        {extractedParams.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <span>Code block syntax is clean. No parameters detected.</span>
                  )}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[11px] leading-relaxed max-h-[180px] overflow-y-auto">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-xs">
                    <Icon icon="lucide:alert-circle" className="text-base" /> Syntax Validation Error
                  </div>
                  <div className="space-y-1 font-mono text-[10px] text-rose-400/90">
                    {validationErrors.map((err, i) => (
                      <div key={i}>
                        Line {err.line}:{err.column} - {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right side editor */}
            <div className="flex-1 flex flex-col bg-background">
              {/* Tab options */}
              <div className="h-10 px-4 border-b border-border bg-card flex items-center justify-between text-xs select-none">
                <span className="font-mono text-slate-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Icon icon="lucide:code-2" className="text-primary text-sm" />
                  {tech === 'Terraform' ? 'custom.tf' : 'custom_tasks.yml'}
                </span>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating}
                  className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-bold rounded flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isValidating && <Icon icon="lucide:loader-2" className="animate-spin" />}
                  Validate Script
                </button>
              </div>

              {/* Code TextArea */}
              <div className="flex-1 p-3 relative font-mono text-xs">
                <textarea
                  value={rawCode}
                  onChange={(e) => {
                    setRawCode(e.target.value);
                    setIsValid(false);
                  }}
                  required
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-slate-200 border-none outline-none focus:ring-0 resize-none font-mono text-xs leading-relaxed select-text"
                  placeholder="Paste your IaC automation block here..."
                />
              </div>

              {/* Action Footer */}
              <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-muted text-foreground hover:bg-muted/80 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isValid || !title.trim() || isSaving}
                  className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 disabled:bg-primary/50 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving && <Icon icon="lucide:loader-2" className="animate-spin text-sm" />}
                  Add Visual Node to Canvas
                </button>
              </div>
            </div>
          </form>

        </div>
      )}
    </div>
  );
}
