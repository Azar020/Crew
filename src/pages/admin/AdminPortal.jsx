import React, { useState } from 'react';
import { AdminSidebar } from '../../layouts/AdminSidebar';
import { AdminTopbar } from '../../layouts/AdminShell';
import { ToastContainer } from '../../components/ToastContainer';

import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminLeaveApprovalsPage } from './AdminLeaveApprovalsPage';
import { AdminAttendancePage } from './AdminAttendancePage';
import { AdminDailyUpdatesPage } from './AdminDailyUpdatesPage';
import { AdminAnnouncementsPage } from './AdminAnnouncementsPage';
import { AdminSettingsPage } from './AdminSettingsPage';
import { TeamPage } from '../TeamPage';
import { ReportsPage } from '../ReportsPage';

export function AdminPortal() {
  const [currentPage, setCurrentPage] = useState('Overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen flex" style={{ background: 'var(--bg-main)' }}>
      {/* Single Admin Sidebar (Narrow rail removed) */}
      <AdminSidebar
        currentPage={currentPage}
        mobileOpen={mobileNav}
        profileOpen={profileOpen}
        onNavigate={setCurrentPage}
        onToggleProfile={() => setProfileOpen((o) => !o)}
        onCloseProfile={() => setProfileOpen(false)}
        onCloseMobile={() => setMobileNav(false)}
      />

      {/* Main Admin Content Area */}
      <main className="main-content flex-1 min-w-0 flex flex-col">
        <AdminTopbar
          currentPage={currentPage}
          onToggleMobile={() => setMobileNav((o) => !o)}
          onNavigate={setCurrentPage}
        />

        <div className="page-content flex-1 w-full">
          {currentPage === 'Overview' && <AdminOverviewPage onNavigate={setCurrentPage} />}
          {currentPage === 'Team' && <TeamPage />}
          {currentPage === 'Leave Approvals' && <AdminLeaveApprovalsPage />}
          {currentPage === 'Daily Updates' && <AdminDailyUpdatesPage />}
          {currentPage === 'Attendance Audit' && <AdminAttendancePage />}
          {currentPage === 'Analytics & Reports' && <ReportsPage />}
          {currentPage === 'Announcements Broadcast' && <AdminAnnouncementsPage />}
          {currentPage === 'Organization Settings' && <AdminSettingsPage />}
        </div>
      </main>

      {/* Mobile Backdrop */}
      {mobileNav && (
        <button
          className="mobile-scrim fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          aria-label="Close admin menu"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* Interactive Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
