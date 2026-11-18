import React, { useRef, useEffect } from 'react';
import {
  BarChart3,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEmployee } from '../context/EmployeeContext';
import { TransactyLogo } from '../components/TransactyLogo';
import { UserAvatar } from '../components/UserAvatar';

export function AdminSidebar({
  currentPage,
  mobileOpen,
  profileOpen,
  onNavigate,
  onToggleProfile,
  onCloseProfile,
  onCloseMobile,
}) {
  const { user, logout } = useAuth();
  const { leaveRequests, profile } = useEmployee();

  const pendingApprovalsCount = leaveRequests.filter((r) => r.status === 'pending').length;
  const profileRef = useRef(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        if (onCloseProfile) onCloseProfile();
        else onToggleProfile();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onCloseProfile) onCloseProfile();
        else onToggleProfile();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen, onToggleProfile, onCloseProfile]);

  // Dynamic Administrator identity from session
  const displayName = user?.name || 'Administrator';
  const displayAvatar = user?.avatarUrl || null;
  const displayPosition = user?.position || 'System Administrator';
  const displayEmpId = user?.employeeId || 'ADM-001';

  const adminNavItems = [
    { id: 'Overview', title: 'Admin Overview', icon: Home },
    { id: 'Team', title: 'People & Directory', icon: Users },
    {
      id: 'Leave Approvals',
      title: 'Leave Approvals',
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeDanger: true,
    },
    { id: 'Daily Updates', title: 'Daily Work Updates', icon: FileText },
    { id: 'Analytics & Reports', title: 'Workforce Reports', icon: BarChart3 },
    { id: 'Announcements Broadcast', title: 'Broadcasts & Events', icon: Bell },
    { id: 'Organization Settings', title: 'System Settings', icon: Settings },
  ];

  const handleLogout = () => {
    logout('You have been logged out of the Administrator Portal.');
  };

  return (
    <aside className={`menu-panel ${mobileOpen ? 'menu-open' : ''} select-none`}>
      {/* Brand Header: Clean Transacty Logo & Single Crew Badge */}
      <div className="mb-6 px-1">
        <TransactyLogo variant="auto" height={26} />
      </div>

      {/* Administrator Profile Card */}
      <div className="relative mb-5" ref={profileRef}>
        <div
          className="profile-select"
          onClick={onToggleProfile}
          role="button"
          tabIndex={0}
          aria-expanded={profileOpen}
        >
          <UserAvatar
            name={displayName}
            avatarUrl={displayAvatar}
            status="online"
            size="md"
          />

          <div className="profile-copy">
            <strong>{displayName}</strong>
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#9D8F82]">
                ONLINE
              </span>
              <span className="text-[var(--text-secondary)]/40">•</span>
              <span className="capitalize text-[var(--text-secondary)] text-[10px] truncate max-w-[85px]">
                Admin
              </span>
            </span>
          </div>

          {profileOpen ? (
            <ChevronUp size={16} className="text-[var(--text-primary)]" />
          ) : (
            <ChevronDown size={16} className="text-[var(--text-secondary)]" />
          )}
        </div>

        {/* Profile Dropdown Menu - rendered dynamically only when open */}
        {profileOpen && (
          <div className="profile-menu">
            <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center gap-3">
              <UserAvatar
                name={displayName}
                avatarUrl={displayAvatar}
                status="online"
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[var(--text-primary)] text-sm truncate">
                  {displayName}
                </div>
                <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                  ID: {displayEmpId}
                </div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9D8F82]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    ONLINE
                  </span>
                </div>
              </div>
            </div>

            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onNavigate('Organization Settings');
                  if (onCloseProfile) onCloseProfile();
                  else onToggleProfile();
                }}
                className="hover:bg-[var(--bg-surface-hover)]"
              >
                <ShieldCheck size={15} className="text-[#9D8F82]" />
                <span>Security Settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigate('Attendance Audit');
                  if (onCloseProfile) onCloseProfile();
                  else onToggleProfile();
                }}
                className="hover:bg-[var(--bg-surface-hover)]"
              >
                <Clock3 size={15} className="text-[#9D8F82]" />
                <span>Attendance Audit Log</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Label */}
      <div className="menu-label text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-1">
        Admin Controls
      </div>

      <nav className="main-nav flex flex-col gap-1">
        {adminNavItems.map(({ id, title, icon: Icon, badge, badgeDanger }) => {
          const isSelected = currentPage === id;
          return (
            <button
              key={id}
              className={`nav-item ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                onNavigate(id);
                onCloseMobile?.();
              }}
            >
              <Icon
                size={16}
                className={isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
              />
              <span className="truncate">{title}</span>
              {badge !== undefined && (
                <b
                  className={`nav-badge ${
                    badgeDanger
                      ? 'bg-rose-500 text-white'
                      : 'bg-[var(--border-strong)] text-[var(--text-primary)]'
                  }`}
                >
                  {badge}
                </b>
              )}
            </button>
          );
        })}
      </nav>

      <div className="menu-divider mt-auto" />

      {/* Sign Out at bottom */}
      <div className="menu-bottom">
        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
