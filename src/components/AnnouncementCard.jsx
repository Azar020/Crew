import React from 'react';
import { ArrowUpRight, Bell, MoreHorizontal } from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';

export function AnnouncementCard({ onNavigate }) {
  const { announcements } = useEmployee();
  const latest = announcements[0];

  return (
    <div className="card announcement-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
      <div className="card-header flex items-center justify-between mb-4">
        <div>
          <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            From Leadership
          </p>
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Company Announcements
          </h3>
        </div>
        <Bell size={16} className="text-[#9D8F82]" />
      </div>

      {latest ? (
        <div className="announcement-item flex items-start gap-3 p-3.5 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
          <div className="w-8 h-8 rounded-lg bg-[#9D8F82]/20 text-[var(--text-primary)] flex items-center justify-center shrink-0">
            <Bell size={15} />
          </div>
          <div>
            <strong className="block text-xs font-bold text-[var(--text-primary)]">{latest.title}</strong>
            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{latest.body}</p>
            <small className="text-[10px] text-[var(--text-muted)] mt-1 block font-medium">
              {latest.publishedDate || 'Published'}
            </small>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-[var(--text-muted)] italic">
          No announcements published yet.
        </div>
      )}

      {onNavigate && (
        <button
          onClick={() => onNavigate('Announcements')}
          className="link-btn text-xs font-semibold text-[var(--text-primary)] hover:underline flex items-center gap-1 mt-4"
        >
          See all announcements <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
