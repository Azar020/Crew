import React from 'react';
import { Bell, Menu } from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * Topbar
 * Clean, compact, minimal top navigation bar.
 * Position: sticky top-0, z-30.
 * Aligned with the main dashboard container (max-w-7xl).
 */
export function Topbar({ currentPage, onToggleMobile, onNavigate }) {
  const { unreadAnnouncementsCount } = useEmployee();

  // Page title mapping for header display
  const pageTitle =
    currentPage === 'Dashboard'
      ? 'Employee Dashboard'
      : currentPage === 'Attendance'
      ? 'Attendance Tracker'
      : currentPage === 'Request Leave'
      ? 'Leave Management'
      : currentPage === 'My Tasks'
      ? 'Daily Updates & Tasks'
      : currentPage === 'Reports'
      ? 'Reports & Analytics'
      : currentPage === 'Announcements'
      ? 'Announcements & Events'
      : currentPage === 'Settings'
      ? 'Profile & Settings'
      : currentPage === 'Team'
      ? 'Team Directory'
      : currentPage;

  return (
    <header className="topbar">
      <div className="topbar-container">
        {/* Left: Mobile hamburger menu + Page title */}
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
        </div>

        {/* Right: Theme Toggle & Notifications */}
        <div className="top-actions flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />

          <button
            onClick={() => onNavigate('Announcements')}
            className="icon-btn notification relative"
            aria-label="Notifications"
            title={`${unreadAnnouncementsCount} unread announcements`}
          >
            <Bell size={17} />
            {unreadAnnouncementsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[var(--bg-surface)]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
