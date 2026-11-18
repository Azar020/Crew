import React, { useState, useRef, useEffect } from 'react';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coffee,
  Home,
  LogIn,
  LogOut,
  Play,
  Settings,
} from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';
import { useAuth } from '../context/AuthContext';
import { TransactyLogo } from '../components/TransactyLogo';
import { UserAvatar } from '../components/UserAvatar';
import { CheckOutConfirmModal } from '../components/CheckOutConfirmModal';

export function Sidebar({
  currentPage,
  mobileOpen,
  profileOpen,
  onNavigate,
  onToggleProfile,
  onCloseProfile,
  onCloseMobile,
}) {
  const {
    profile,
    unreadAnnouncementsCount,
    attendance,
    handleCheckIn,
    handleStartBreak,
    handleEndBreak,
    handleCheckOut,
    showToast,
  } = useEmployee();
  const { user, logout } = useAuth();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
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

  // Dynamic user data from logged-in session (fallback to profile)
  const displayName = user?.name || profile?.name || 'Employee';
  const displayAvatar = user?.avatarUrl || profile?.avatarUrl || null;
  const displayPosition = user?.position || profile?.position || 'Employee';
  const displayEmpId = user?.employeeId || profile?.employeeId || 'EMP-001';

  // Derive simple 3-tier status: Online / Break / Offline
  const statusLabel =
    attendance === 'working' ? 'ONLINE' : attendance === 'break' ? 'BREAK' : 'OFFLINE';

  const statusColor =
    attendance === 'working' ? '#9D8F82' : attendance === 'break' ? '#F59E0B' : '#566167';

  const navItems = [
    { id: 'Dashboard', title: 'Dashboard', icon: Home },
    { id: 'Attendance', title: 'Attendance', icon: Clock3 },
    { id: 'Request Leave', title: 'Request Leave', icon: CalendarDays },
    { id: 'My Tasks', title: 'My Tasks – Daily Updates', icon: BriefcaseBusiness },
    { id: 'Reports', title: 'Reports & Analysis', icon: BarChart3 },
    {
      id: 'Announcements',
      title: 'Announcements & Events',
      icon: Bell,
      badge: unreadAnnouncementsCount > 0 ? unreadAnnouncementsCount : undefined,
    },
    { id: 'Settings', title: 'Profile & Settings', icon: Settings },
  ];

  // Logout application session
  const handleLogout = () => {
    showToast('Signing out of Crew...', 'info');
    logout('You have been safely logged out.');
  };

  // Break action in dropdown
  const handleBreakAction = () => {
    if (attendance === 'working') {
      const res = handleStartBreak();
      if (res.success) showToast('Break started.', 'info');
      else showToast(res.message, 'error');
    } else if (attendance === 'break') {
      const res = handleEndBreak();
      if (res.success) showToast('Break ended. Welcome back to work!', 'success');
      else showToast(res.message, 'error');
    }
    if (onCloseProfile) onCloseProfile();
    else onToggleProfile();
  };

  // Check Out click triggers confirmation modal
  const handleCheckOutClick = () => {
    if (attendance === 'break') {
      showToast('Cannot check out while on break. Please click "End Break" first.', 'error');
      return;
    }
    if (onCloseProfile) onCloseProfile();
    else onToggleProfile();
    setConfirmModalOpen(true);
  };

  // Confirmed check-out
  const handleConfirmCheckOut = () => {
    setConfirmModalOpen(false);
    const res = handleCheckOut();
    if (res.success) {
      showToast('Attendance recorded: checked out for today. Great work!', 'success');
    } else {
      showToast(res.message, 'error');
    }
  };

  return (
    <>
      <aside className={`menu-panel ${mobileOpen ? 'menu-open' : ''} select-none`}>
        {/* Sidebar Header: Clean Transacty Logo & Single Crew Badge */}
        <div className="mb-6 px-1">
          <TransactyLogo variant="auto" height={26} />
        </div>

        {/* Profile Selector Card with Clickable Dropdown */}
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
              status={attendance}
              size="md"
            />

            <div className="profile-copy">
              <strong>{displayName}</strong>
              <span className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: statusColor }}
                >
                  {statusLabel}
                </span>
                <span className="text-[var(--text-secondary)]/40">•</span>
                <span className="capitalize text-[var(--text-secondary)] text-[10px] truncate max-w-[85px]">
                  {displayPosition}
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
              {/* Header: avatar + name + emp id + status pill */}
              <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center gap-3">
                <UserAvatar
                  name={displayName}
                  avatarUrl={displayAvatar}
                  status={attendance}
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
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: statusColor }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status & Attendance Action Items */}
              <div className="py-1">
                {attendance === 'not_started' && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = handleCheckIn();
                      if (res.success) showToast('Checked in successfully! Have a great day.', 'success');
                      else showToast(res.message, 'error');
                      if (onCloseProfile) onCloseProfile();
                    }}
                    className="hover:bg-[var(--bg-surface-hover)]"
                  >
                    <LogIn size={15} style={{ color: '#9D8F82' }} />
                    <span>Check In</span>
                  </button>
                )}

                {(attendance === 'working' || attendance === 'break') && (
                  <button
                    type="button"
                    onClick={handleBreakAction}
                    className="hover:bg-[var(--bg-surface-hover)]"
                  >
                    {attendance === 'break' ? (
                      <>
                        <Play size={15} style={{ color: '#9D8F82' }} />
                        <span>End Break</span>
                      </>
                    ) : (
                      <>
                        <Coffee size={15} className="text-[#D97706]" />
                        <span>Start Break</span>
                      </>
                    )}
                  </button>
                )}

                {attendance === 'working' && (
                  <button
                    type="button"
                    onClick={handleCheckOutClick}
                    className="hover:bg-[var(--bg-surface-hover)]"
                  >
                    <LogOut size={15} className="text-[var(--text-secondary)]" />
                    <span>Check Out</span>
                  </button>
                )}

                {attendance === 'break' && (
                  <button
                    type="button"
                    onClick={handleCheckOutClick}
                    className="opacity-50 text-[var(--text-muted)] cursor-not-allowed"
                    title="End break first before checking out"
                  >
                    <LogOut size={15} />
                    <span>Check Out</span>
                  </button>
                )}

                {attendance === 'checked_out' && (
                  <div className="px-4 py-2.5 text-xs text-[var(--text-muted)] italic">
                    Shift completed for today
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Section */}
        <div className="menu-label text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-1">
          Navigation
        </div>

        <nav className="main-nav flex flex-col gap-1">
          {navItems.map(({ id, title, icon: Icon, badge }) => {
            const isSelected = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id);
                  onCloseMobile?.();
                }}
                className={`nav-item ${isSelected ? 'selected' : ''}`}
              >
                <Icon
                  size={16}
                  className={isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
                />
                <span>{title}</span>
                {badge !== undefined && <span className="nav-badge">{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="menu-divider mt-auto" />

        {/* Separate Logout at the bottom */}
        <div className="menu-bottom">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Check Out Confirmation Dialog */}
      <CheckOutConfirmModal
        isOpen={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmCheckOut}
      />
    </>
  );
}
