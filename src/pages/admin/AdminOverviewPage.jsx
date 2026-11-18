import React from 'react';
import { AdminDashboard } from '../AdminDashboard';

export function AdminOverviewPage({ onNavigate }) {
  return (
    <div className="flex flex-col gap-6 select-none">
      <div className="flex items-center justify-between flex-wrap gap-4 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div>
          <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Workforce Intelligence
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Administrator Command Center
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Live workforce overview, attendance exceptions, team activity, and organizational rhythm
          </p>
        </div>
      </div>

      <AdminDashboard onNavigate={onNavigate} />
    </div>
  );
}
