'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, signup, isLoading, error, clearError } = useAuthStore();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Sync mode with query parameter
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSignUp(true);
    } else {
      setIsSignUp(false);
    }
    clearError();
    setFormError(null);
  }, [searchParams, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const emailTrimmed = email.trim();
    const nameTrimmed = name.trim();

    if (!emailTrimmed || !password) {
      setFormError('Please fill in all fields.');
      return;
    }

    if (isSignUp && !nameTrimmed) {
      setFormError('Please enter your full name.');
      return;
    }

    let success = false;
    if (isSignUp) {
      success = await signup(nameTrimmed, emailTrimmed, password);
    } else {
      success = await login(emailTrimmed, password);
    }

    if (success) {
      router.push('/dashboard');
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-background flex items-center justify-center p-6 overflow-hidden text-foreground">
      {/* Dynamic Visual Background - Interactive Orchestration Links */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Pulsing Grid lines */}
          <defs>
            <radialGradient id="grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#07080B" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grad)" />

          {/* Animated linking nodes representation */}
          <g className="animate-[spin_120s_linear_infinite] origin-center" style={{ transformOrigin: '50% 50%' }}>
            {/* Outer rings */}
            <circle cx="50%" cy="50%" r="350" fill="none" stroke="#1E2233" strokeWidth="1" strokeDasharray="5,10" />
            <circle cx="50%" cy="50%" r="200" fill="none" stroke="#242838" strokeWidth="1.5" strokeDasharray="15,15" />

            {/* Visual node terminals */}
            <circle cx="50%" cy="10%" r="8" fill="#6366F1" className="animate-pulse" />
            <circle cx="90%" cy="50%" r="6" fill="#10B981" />
            <circle cx="50%" cy="90%" r="10" fill="#8B5CF6" />
            <circle cx="10%" cy="50%" r="7" fill="#F59E0B" />
            <circle cx="78%" cy="78%" r="6" fill="#F43F5E" />
            <circle cx="22%" cy="22%" r="8" fill="#EAB308" />

            {/* Connecting paths */}
            <path d="M 50% 10% L 90% 50% L 50% 90% L 10% 50% Z" fill="none" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 6" />
            <path d="M 22% 22% L 78% 78%" fill="none" stroke="#1E2233" strokeWidth="1" />
          </g>
        </svg>
      </div>

      {/* Main Glassmorphic Wrapper Card */}
      <div className="relative z-10 w-full max-w-md bg-card/80 backdrop-blur-xl border border-border/80 rounded-3xl p-8 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in duration-300">

        {/* Logo and Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <Link href="/" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-input shadow-lg hover:scale-105 transition duration-200">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 to-amber-500"></div>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {isSignUp 
                ? 'Join visual infrastructure orchestration teams' 
                : 'Sign in to access your workflow workspace'}
            </p>
          </div>
        </div>

        {/* Display System Errors */}
        {(error || formError) && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
            <Icon icon="lucide:alert-circle" className="text-lg flex-shrink-0 mt-0.5" />
            <p className="leading-snug">{error || formError}</p>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <Icon icon="lucide:user" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg" />
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-card border border-border/80 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                  placeholder="Enter full name"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <Icon icon="lucide:mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-card border border-border/80 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                placeholder="name@company.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Password
              </label>
              {!isSignUp && (
                <span className="text-xs text-primary hover:underline cursor-pointer">
                  Forgot password?
                </span>
              )}
            </div>
            <div className="relative">
              <Icon icon="lucide:lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-card border border-border/80 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:opacity-90 active:scale-[0.98] text-white rounded-xl py-3.5 text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {isLoading ? (
              <Icon icon="lucide:loader-2" className="animate-spin text-lg" />
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-border"></div>
          <span className="flex-shrink mx-4 text-xs font-medium text-slate-600 uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-border"></div>
        </div>

        {/* Social Sign-In (GitHub & Google) */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/auth/github/login`}
            className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-card py-3 text-sm font-medium text-slate-300 hover:bg-secondary hover:text-white transition duration-200 cursor-pointer"
          >
            <Icon icon="mdi:github" className="text-xl" />
            <span>GitHub</span>
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/auth/google/login`}
            className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-card py-3 text-sm font-medium text-slate-300 hover:bg-secondary hover:text-white transition duration-200 cursor-pointer"
          >
            <Icon icon="flat-color-icons:google" className="text-xl" />
            <span>Google</span>
          </a>
        </div>

        {/* Switch Sign In / Sign Up footer link */}
        <div className="text-center text-sm text-slate-400 mt-2">
          {isSignUp ? (
            <p>
              Already have an account?{' '}
              <button 
                type="button" 
                onClick={() => router.push('/login')}
                className="text-primary hover:underline font-semibold cursor-pointer"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              New to Whiparc?{' '}
              <button 
                type="button" 
                onClick={() => router.push('/login?mode=signup')}
                className="text-primary hover:underline font-semibold cursor-pointer"
              >
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-background flex items-center justify-center text-slate-400">
        <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
