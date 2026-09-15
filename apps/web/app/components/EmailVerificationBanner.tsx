'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useAuthStore } from '../store/useAuthStore';

export default function EmailVerificationBanner() {
  const { user, resendVerification } = useAuthStore();
  const [isSending, setIsSending] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!user || user.email_verified) {
    return null;
  }

  const handleResend = async () => {
    if (cooldown > 0 || isSending) return;
    setIsSending(true);
    setSentNotice(null);
    setErrorNotice(null);

    const result = await resendVerification();
    setIsSending(false);

    if (result.success) {
      setSentNotice('Verification link sent! Check your email (or server logs in dev mode).');
      setCooldown(60);
    } else {
      setErrorNotice(result.error || 'Failed to send verification email.');
    }
  };

  return (
    <div className="bg-amber-950/40 border-b border-amber-600/30 text-amber-200 px-4 py-2.5 text-xs md:text-sm flex flex-wrap items-center justify-between gap-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:alert-circle" className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong className="font-semibold text-amber-300">Verify your email:</strong> We sent a verification link to{' '}
          <span className="underline decoration-amber-500/50">{user.email}</span>. Please verify your account to unlock all features.
        </span>
      </div>

      <div className="flex items-center gap-3">
        {sentNotice && (
          <span className="text-emerald-400 flex items-center gap-1 font-medium text-xs">
            <Icon icon="lucide:check" className="w-3.5 h-3.5" />
            {sentNotice}
          </span>
        )}
        {errorNotice && (
          <span className="text-rose-400 flex items-center gap-1 font-medium text-xs">
            <Icon icon="lucide:x" className="w-3.5 h-3.5" />
            {errorNotice}
          </span>
        )}
        <button
          onClick={handleResend}
          disabled={isSending || cooldown > 0}
          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs flex items-center gap-1"
        >
          {isSending ? (
            <>
              <Icon icon="lucide:loader-2" className="w-3 h-3 animate-spin" />
              Sending...
            </>
          ) : cooldown > 0 ? (
            `Resend in ${cooldown}s`
          ) : (
            'Resend Link'
          )}
        </button>
      </div>
    </div>
  );
}
