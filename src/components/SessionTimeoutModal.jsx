import React from 'react';
import { AlertTriangle, Clock, LogOut, RefreshCw } from 'lucide-react';

export function SessionTimeoutModal({ remainingSeconds, onContinue, onLogout }) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-strong)] shadow-2xl max-w-md w-full p-6 sm:p-7 relative text-center">
        {/* Warning Icon */}
        <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 shadow-sm">
          <AlertTriangle size={24} />
        </div>

        <p className="text-[10px] font-bold text-[#9D8F82] uppercase tracking-wider mb-1">
          Security Alert
        </p>
        <h3 className="font-display text-xl font-bold text-[var(--text-primary)] tracking-tight">
          Session Expiring Soon
        </h3>

        <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
          You have been idle. For your security, your Crew session will automatically terminate in:
        </p>

        {/* Countdown badge */}
        <div className="my-5 py-3 px-6 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] inline-flex items-center gap-2.5">
          <Clock size={18} className="text-[#9D8F82] animate-pulse" />
          <span className="font-mono text-2xl font-bold text-[var(--text-primary)] tracking-wider">
            {formattedTime}
          </span>
        </div>

        <p className="text-[11px] text-[var(--text-muted)] mb-6">
          Click <strong>Continue Session</strong> to stay signed in, or sign out now.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onLogout}
            className="w-full sm:w-auto flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <LogOut size={15} /> Sign Out Now
          </button>
          <button
            onClick={onContinue}
            className="w-full sm:w-auto flex-1 py-2.5 px-4 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <RefreshCw size={15} /> Continue Session
          </button>
        </div>
      </div>
    </div>
  );
}
