import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Check, Coffee, Clock3, Users, CheckCircle2 } from 'lucide-react';
import { AnnouncementCard } from '../components/AnnouncementCard';
import { MeetingCard } from '../components/MeetingCard';
import { StatCard } from '../components/StatCard';
import { useEmployee } from '../context/EmployeeContext';
import { fetchEmployees } from '../services/employeeService';

export function AdminDashboard({ onNavigate }) {
  const { attendanceHistory, leaveRequests } = useEmployee();
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees().then((res) => {
      if (res?.data) {
        setEmployeeCount(res.data.length);
      }
      setLoading(false);
    });
  }, []);

  const todayIso = new Date().toISOString().split('T')[0];
  const presentToday = attendanceHistory.filter(
    (r) => r.date === 'Today' || r.workDate === todayIso
  ).length;

  const pendingLeaves = leaveRequests.filter((r) => r.status === 'pending').length;
  const notCheckedIn = Math.max(0, employeeCount - presentToday);

  return (
    <div className="dashboard-grid">
      <div className="main-column flex flex-col gap-6">
        <div className="stats-grid admin-stats grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total employees"
            value={loading ? '...' : String(employeeCount)}
            trend={employeeCount > 0 ? `${employeeCount} provisioned in DB` : 'No employees provisioned'}
            icon={Users}
          />
          <StatCard
            label="Present today"
            value={String(presentToday)}
            trend={employeeCount > 0 ? `${Math.round((presentToday / employeeCount) * 100)}% active shift` : '0%'}
            icon={Check}
          />
          <StatCard
            label="Pending Leave Requests"
            value={String(pendingLeaves)}
            trend={pendingLeaves > 0 ? 'Requires admin review' : 'All reviews clear'}
            icon={Coffee}
          />
          <StatCard
            label="Not checked in"
            value={String(notCheckedIn)}
            trend="Today's shift"
            icon={Clock3}
          />
        </div>

        <section className="card team-status-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="card-header flex items-center justify-between mb-4">
            <div>
              <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Live Overview
              </p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">
                Today's Team Status
              </h3>
            </div>
            <button className="soft-btn text-xs font-semibold px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] flex items-center gap-1.5" onClick={() => onNavigate('Team')}>
              <Users size={14} /> View Directory
            </button>
          </div>
          <div className="team-status-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
              <div className="status-block-head flex items-center justify-between text-xs mb-2">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#9D8F82]" /> Working
                </span>
                <strong className="text-base text-[var(--text-primary)] font-display">{presentToday}</strong>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden my-2">
                <div
                  className="h-full bg-[#9D8F82] rounded-full transition-all"
                  style={{ width: `${employeeCount > 0 ? Math.min(100, (presentToday / employeeCount) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] m-0">Synchronized from PostgreSQL</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
              <div className="status-block-head flex items-center justify-between text-xs mb-2">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending Leaves
                </span>
                <strong className="text-base text-[var(--text-primary)] font-display">{pendingLeaves}</strong>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden my-2">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${pendingLeaves > 0 ? 50 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] m-0">Awaiting approval</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
              <div className="status-block-head flex items-center justify-between text-xs mb-2">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" /> Not Checked In
                </span>
                <strong className="text-base text-[var(--text-primary)] font-display">{notCheckedIn}</strong>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden my-2">
                <div
                  className="h-full bg-[var(--text-muted)] rounded-full transition-all"
                  style={{ width: `${employeeCount > 0 ? Math.min(100, (notCheckedIn / employeeCount) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] m-0">Pending today's check-in</p>
            </div>
          </div>
        </section>

        <section className="card tasks-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="card-header flex items-center justify-between mb-4">
            <div>
              <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Shift Exceptions
              </p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 font-display">
                <span>Attendance Alerts</span>
                {notCheckedIn > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400">
                    {notCheckedIn}
                  </span>
                )}
              </h3>
            </div>
            <button
              className="link-btn text-xs font-semibold text-[var(--text-primary)] hover:underline flex items-center gap-1"
              onClick={() => onNavigate('Attendance Audit')}
            >
              View audit log <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="alert-list divide-y divide-[var(--border-subtle)]">
            {notCheckedIn === 0 && (
              <div className="py-6 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                <CheckCircle2 size={16} className="text-[#9D8F82]" />
                <span>All active employees are on schedule. No attendance alerts today.</span>
              </div>
            )}
            {notCheckedIn > 0 && (
              <div className="py-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--text-secondary)]">
                  {notCheckedIn} employee{notCheckedIn > 1 ? 's have' : ' has'} not checked in for today's shift yet.
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Pending Check-in
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="side-column flex flex-col gap-6">
        <AnnouncementCard />
        <MeetingCard />
      </div>
    </div>
  );
}
