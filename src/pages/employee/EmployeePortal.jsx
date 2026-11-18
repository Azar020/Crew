import React, { useState } from 'react';
import { Sidebar } from '../../layouts/Sidebar';
import { Topbar } from '../../layouts/AppShell';
import { ToastContainer } from '../../components/ToastContainer';

import { EmployeeDashboard } from '../EmployeeDashboard';
import { AttendancePage } from '../AttendancePage';
import { TasksPage } from '../TasksPage';
import { LeavePage } from '../LeavePage';
import { ReportsPage } from '../ReportsPage';
import { AnnouncementsPage } from '../AnnouncementsPage';
import { SettingsPage } from '../SettingsPage';
import { TeamPage } from '../TeamPage';

export function EmployeePortal() {
  const [currentPage, setCurrentPage] = useState('Dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen flex" style={{ background: 'var(--bg-main)' }}>
      {/* Single Main Sidebar */}
      <Sidebar
        currentPage={currentPage}
        mobileOpen={mobileNav}
        profileOpen={profileOpen}
        onNavigate={setCurrentPage}
        onToggleProfile={() => setProfileOpen((o) => !o)}
        onCloseProfile={() => setProfileOpen(false)}
        onCloseMobile={() => setMobileNav(false)}
      />

      {/* Main Content Area */}
      <main className="main-content flex-1 min-w-0 flex flex-col">
        <Topbar
          currentPage={currentPage}
          onToggleMobile={() => setMobileNav((o) => !o)}
          onNavigate={setCurrentPage}
        />

        <div className="page-content flex-1 w-full">
          {currentPage === 'Dashboard' && <EmployeeDashboard onNavigate={setCurrentPage} />}
          {currentPage === 'Attendance' && <AttendancePage />}
          {currentPage === 'Request Leave' && <LeavePage />}
          {currentPage === 'My Tasks' && <TasksPage />}
          {currentPage === 'Reports' && <ReportsPage />}
          {currentPage === 'Announcements' && <AnnouncementsPage />}
          {currentPage === 'Settings' && <SettingsPage />}
          {currentPage === 'Team' && <TeamPage />}
        </div>
      </main>

      {/* Mobile Drawer Backdrop */}
      {mobileNav && (
        <button
          className="mobile-scrim fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* Interactive Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
