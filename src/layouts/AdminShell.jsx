import React from 'react';
import { Bell, Menu, Shield } from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * AdminTopbar
 * Clean, compact, minimal admin top navigation bar.
 * Position: sticky top-0, z-30.
 * Aligned with the main dashboard container (max-w-7xl).
 */
export function AdminTopbar({ currentPage, onToggleMobile, onNavigate }) {
  const { leaveRequests } = useEmployee();
  const pendingCount = leaveRequests.filter((r) => r.status === 'pending').length;

  const pageTitle =
    currentPage === 'Overview'
      ? 'Admin Overview'
      : currentPage === 'Team'
      ? 'People & Directory'
      : currentPage === 'Leave Approvals'
      ? 'Leave Approvals'
      : currentPage === 'Daily Updates'
      ? 'Employee Daily Work Updates'
      : currentPage === 'Attendance Audit'
      ? 'Attendance Audit Log'
      : currentPage === 'Analytics & Reports'
      ? 'Workforce Reports'
      : currentPage === 'Announcements Broadcast'
      ? 'Broadcast Announcements'
      : currentPage === 'Organization Settings'
      ? 'System Settings'
      : currentPage;

  return (
    <header className="topbar">
      <div className="topbar-container">
        {/* Left: Mobile hamburger menu + Page title + Admin badge */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="mobile-menu md:hidden p-1.5 -ml-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition"
            onClick={onToggleMobile}
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>

          <span className="text-xs md:text-sm font-bold text-[var(--text-primary)] font-display tracking-tight truncate">
            {pageTitle}
          </span>

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] shrink-0">
            <Shield size={11} className="text-[var(--text-secondary)]" />
            <span>Admin</span>
          </span>
        </div>

        {/* Right: Pending Approvals badge + Theme Toggle + Notifications */}
        <div className="top-actions flex items-center gap-2 sm:gap-3 shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={() => onNavigate('Leave Approvals')}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/20 transition"
              title={`${pendingCount} pending leave applications`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              <span>{pendingCount} Pending</span>
            </button>
          )}

          <ThemeToggle />

          <button
            onClick={() => onNavigate('Announcements Broadcast')}
            className="icon-btn notification relative"
            aria-label="Broadcasts"
            title="Announcements broadcast"
          >
            <Bell size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
