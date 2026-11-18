import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { AttendanceCard } from '../components/AttendanceCard';
import { StatCard } from '../components/StatCard';
import { useEmployee } from '../context/EmployeeContext';
import { useAuth } from '../context/AuthContext';
import { formatTimeInTz } from '../utils/dateUtils';

// Helper for dynamic time-based greeting
function getGreeting(currentDate) {
  const hour = currentDate.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

export function EmployeeDashboard({ onNavigate }) {
  const {
    profile,
    attendance,
    workedHours,
    leaveBalances,
    leaveRequests,
    attendanceHistory,
    holidays,
    tasks,
    announcements,
    meetings,
    showToast,
  } = useEmployee();
  const { user } = useAuth();

  // Live clock ticking every second in user's selected timezone
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const greeting = useMemo(() => getGreeting(now), [now]);
  const activeName = user?.name || profile?.name || 'Employee';
  const firstName = activeName.split(' ')[0];

  // 3 simple statuses: Online / Break / Offline
  const statusLabel =
    attendance === 'working' ? 'Online' : attendance === 'break' ? 'Break' : 'Offline';

  const statusColor =
    attendance === 'working' ? '#9D8F82' : attendance === 'break' ? '#F59E0B' : '#9D8F82';

  const localTimeString = formatTimeInTz(now, profile?.timezone, { showSeconds: true });

  const formattedDateString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Leave calculations
  const totalLeaveTaken =
    leaveBalances.annual.used + leaveBalances.sick.used + leaveBalances.casual.used;
  const totalLeaveRemaining =
    leaveBalances.annual.remaining +
    leaveBalances.sick.remaining +
    leaveBalances.casual.remaining;
  const totalLeaveAllowance = totalLeaveTaken + totalLeaveRemaining;

  // ── Dynamic monthly stats ────────────────────────────────────────────────────
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Count attendance records for current month
    const presentDays = attendanceHistory.filter((r) => {
      if (!r.isoDate) return false;
      const d = new Date(r.isoDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    // Count approved leave days this month
    const leaveDaysThisMonth = leaveRequests.filter((req) => {
      if (req.status !== 'approved') return false;
      const start = new Date(req.startDate);
      return (
        start.getFullYear() === currentYear && start.getMonth() === currentMonth
      );
    }).reduce((acc, req) => acc + (req.workingDays || 1), 0);

    // Business days in current month (Mon–Fri only)
    const businessDaysInMonth = (() => {
      const year = currentYear;
      const month = currentMonth;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(year, month, d).getDay();
        if (day !== 0 && day !== 6) count++;
      }
      return count;
    })();

    // Average daily hours from completed sessions this month
    const completedThisMonth = attendanceHistory.filter((r) => {
      if (!r.isoDate) return false;
      const d = new Date(r.isoDate);
      return (
        d.getFullYear() === currentYear &&
        d.getMonth() === currentMonth &&
        typeof r.netHoursNumeric === 'number' &&
        r.netHoursNumeric > 0
      );
    });
    const avgHoursRaw =
      completedThisMonth.length > 0
        ? completedThisMonth.reduce((s, r) => s + (r.netHoursNumeric || 0), 0) /
          completedThisMonth.length
        : 0;

    const totalHours = Math.floor(avgHoursRaw);
    const totalMins = Math.round((avgHoursRaw - totalHours) * 60);
    const avgLabel =
      completedThisMonth.length > 0 ? `${totalHours}h ${totalMins}m` : '—';

    const attendancePct =
      businessDaysInMonth > 0 ? Math.round((presentDays / businessDaysInMonth) * 100) : 0;

    // Count holidays in the current month
    const holidaysThisMonth = (holidays || []).filter((h) => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    return {
      presentDays,
      leaveDaysThisMonth,
      businessDaysInMonth,
      holidaysThisMonth,
      avgLabel,
      attendancePct,
      avgVsTarget:
        completedThisMonth.length > 0
          ? `${avgHoursRaw >= 8 ? '+' : ''}${(avgHoursRaw - 8).toFixed(1)}h vs target`
          : 'No data yet',
    };
  }, [attendanceHistory, leaveRequests, holidays]);

  // Daily updates grouped by date, latest first
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const dailyUpdateGroups = useMemo(() => {
    const grouped = {};
    tasks.forEach((t) => {
      const key = t.date || todayStr;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 3);
  }, [tasks, todayStr]);

  const formatGroupDate = (iso) => {
    if (iso === todayStr) return 'Today';
    if (iso === yesterdayStr) return 'Yesterday';
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Greeting Banner ── */}
      <div className="relative rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 md:p-8 shadow-sm overflow-hidden select-none">
        {/* Subtle fintech grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div className="max-w-2xl">
            {/* Live Date, Time & Status Pill */}
            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {formattedDateString}
              </span>
              <span className="text-[var(--text-secondary)]/40">•</span>
              <span className="text-xs font-mono font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <Clock size={12} className="text-[var(--text-secondary)]" />
                <span>{localTimeString}</span>
              </span>
              <span className="text-[var(--text-secondary)]/40">•</span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                style={{
                  color: statusColor,
                  background: `${statusColor}18`,
                  borderColor: `${statusColor}35`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: statusColor,
                    animation: attendance === 'working' ? 'pulse 2s infinite' : 'none',
                  }}
                />
                {statusLabel}
              </span>
            </div>

            {/* Time-Based Greeting using Employee Name */}
            <h1 className="text-2xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight leading-tight font-display">
              {greeting}, {firstName}!
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)] font-medium">
              Welcome to your Crew workspace.
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Dashboard Content Grid ── */}
      <div className="dashboard-grid">
        {/* Left Column */}
        <div className="main-column flex flex-col gap-6">
          {/* 1. Today's Attendance Interactive Card */}
          <AttendanceCard showBreakList={false} />

          {/* 2. Key Metrics Stats Grid */}
          <div className="stats-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Working days this month"
              value={`${monthlyStats.presentDays} / ${monthlyStats.businessDaysInMonth}`}
              trend={`${monthlyStats.attendancePct}% attendance rate`}
              icon={CalendarDays}
            />
            <StatCard
              label="Leave balance"
              value={`${totalLeaveRemaining} days`}
              trend={`${totalLeaveTaken} taken of ${totalLeaveAllowance}`}
              icon={FileText}
            />
            <StatCard
              label="Avg. daily working hours"
              value={monthlyStats.avgLabel}
              trend={monthlyStats.avgVsTarget}
              icon={Activity}
            />
          </div>

          {/* 3. Daily Updates Section (replaces Priority Action Items) */}
          <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
                  Work Log
                </p>
                <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">
                  Daily Updates
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition active:scale-95"
                  onClick={() => onNavigate('My Tasks')}
                >
                  <Plus size={13} />
                  <span>Add Daily Update</span>
                </button>
                <button
                  className="text-xs font-semibold text-[var(--text-primary)] hover:underline flex items-center gap-1 opacity-70 hover:opacity-100 transition"
                  onClick={() => onNavigate('My Tasks')}
                >
                  View all <ArrowUpRight size={13} />
                </button>
              </div>
            </div>

            {dailyUpdateGroups.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                <p>No daily updates recorded yet.</p>
                <button
                  onClick={() => onNavigate('My Tasks')}
                  className="mt-2 text-xs font-semibold text-[var(--text-primary)] hover:underline"
                >
                  Add your first daily update →
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {dailyUpdateGroups.map(([date, dayTasks]) => (
                  <div key={date}>
                    {/* Date Header */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        {formatGroupDate(date)}
                      </span>
                      <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {dayTasks.length} update{dayTasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Work Update Items */}
                    <div className="flex flex-col gap-2">
                      {dayTasks.slice(0, 4).map((task) => {
                        const isDone = task.status === 'completed';
                        return (
                          <div
                            key={task.id}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--bg-surface-hover)] transition group"
                          >
                            {/* Status indicator dot */}
                            <span
                              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                isDone
                                  ? 'bg-[#9D8F82]'
                                  : task.status === 'in_progress'
                                  ? 'bg-amber-500'
                                  : 'bg-[var(--text-muted)]'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div
                                className={`text-xs font-semibold ${
                                  isDone
                                    ? 'line-through text-[var(--text-muted)]'
                                    : 'text-[var(--text-primary)]'
                                }`}
                              >
                                {task.title}
                              </div>
                              {task.description && (
                                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                                  {task.description}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                                  #{task.project}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    task.priority === 'High'
                                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      : task.priority === 'Medium'
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                  }`}
                                >
                                  {task.priority}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-semibold shrink-0 capitalize px-2 py-0.5 rounded-full border ${
                                isDone
                                  ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/30'
                                  : task.status === 'in_progress'
                                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                  : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                              }`}
                            >
                              {isDone ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4. Recent Attendance History Table */}
          <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
            <div className="card-header flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Past Days Log
                </p>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">
                    Recent Attendance History
                  </h3>
                </div>
              </div>
              <button
                className="text-xs font-semibold text-[var(--text-primary)] hover:underline flex items-center gap-1 opacity-70 hover:opacity-100 transition"
                onClick={() => onNavigate('Attendance')}
              >
                Full records <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Check In</th>
                    <th className="py-2.5 px-3">Check Out</th>
                    <th className="py-2.5 px-3">Breaks</th>
                    <th className="py-2.5 px-3">Net Hours</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {attendanceHistory.slice(0, 5).map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                      <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">{row.date}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">{row.checkIn}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">{row.checkOut}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">
                        {row.breakCount} ({row.breakDuration})
                      </td>
                      <td className="py-3 px-3 font-bold text-[var(--text-primary)] font-display">{row.netHours}</td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${row.status === 'present'
                            ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border border-[#9D8F82]/30'
                            : row.status === 'late'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : row.status === 'half_day'
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${row.status === 'present'
                              ? 'bg-[#9D8F82]'
                              : row.status === 'late'
                                ? 'bg-amber-500'
                                : row.status === 'half_day'
                                  ? 'bg-sky-500'
                                  : 'bg-rose-500'
                              }`}
                          />
                          {row.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Side Column */}
        <div className="side-column flex flex-col gap-6">
          {/* Monthly Attendance Card */}
          <div className="card mini-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
            <div className="card-header flex items-center justify-between mb-4">
              <div>
                <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
                  Monthly Rhythm
                </p>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Attendance Ratio
                </h3>
              </div>
              <button
                onClick={() => onNavigate('Reports')}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                title="View Analytics"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>

            <div className="donut-wrap flex items-center justify-around my-2">
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center bg-[var(--bg-surface-hover)] border-4 border-[var(--border-strong)]">
                <div className="flex flex-col items-center justify-center">
                  <strong className="text-xl font-bold text-[var(--text-primary)] font-display">
                    {monthlyStats.attendancePct}%
                  </strong>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase">
                    {monthlyStats.attendancePct >= 75 ? 'On Track' : 'In Progress'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#9D8F82]" />
                  <span>Present</span>
                  <b className="ml-auto text-[var(--text-primary)]">{monthlyStats.presentDays} days</b>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Leaves</span>
                  <b className="ml-auto text-[var(--text-primary)]">{monthlyStats.leaveDaysThisMonth} days</b>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)]" />
                  <span>Holidays</span>
                  <b className="ml-auto text-[var(--text-primary)]">{monthlyStats.holidaysThisMonth} days</b>
                </div>
              </div>
            </div>
          </div>

          {/* Latest Announcements */}
          <div className="card announcement-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
            <div className="card-header flex items-center justify-between mb-3">
              <div>
                <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
                  Company Broadcasts
                </p>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Announcements
                </h3>
              </div>
              <button
                className="text-xs font-semibold text-[var(--text-primary)] hover:underline opacity-70 hover:opacity-100 transition flex items-center gap-1"
                onClick={() => onNavigate('Announcements')}
              >
                All <ArrowUpRight size={13} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {announcements.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate('Announcements')}
                  className="p-3 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${item.priority === 'Urgent'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                    >
                      {item.priority}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{item.publishedDate}</span>
                  </div>
                  <strong className="text-xs font-bold text-[var(--text-primary)] block truncate">
                    {item.title}
                  </strong>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Meetings */}
          <div className="card meeting-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
            <div className="card-header flex items-center justify-between mb-3">
              <div>
                <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
                  Scheduled
                </p>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Upcoming Meetings
                </h3>
              </div>
              <CalendarDays size={16} className="text-[var(--text-secondary)]" />
            </div>

            {meetings.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="flex items-baseline gap-1">
                      <strong className="text-xl font-bold text-[var(--text-primary)] font-display">
                        {meetings[0].time}
                      </strong>
                      <span className="text-xs text-[var(--text-secondary)] font-semibold">
                        {meetings[0].date}
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#9D8F82]/10 text-[var(--text-primary)] font-bold px-2 py-0.5 rounded-full border border-[#9D8F82]/30">
                      Soon
                    </span>
                  </div>

                  <div className="text-xs font-bold text-[var(--text-primary)]">{meetings[0].title}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1.5">
                    <span>{meetings[0].platform}</span>
                    <span>•</span>
                    <span>{meetings[0].duration}</span>
                  </div>

                  <button
                    onClick={() => {
                      const m = meetings[0];
                      const raw = m?.meetingLink || m?.link;
                      let validUrl = null;
                      if (raw) {
                        try {
                          const candidate = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
                          const parsed = new URL(candidate);
                          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                            validUrl = parsed.href;
                          }
                        } catch {
                          validUrl = null;
                        }
                      }
                      if (!validUrl) {
                        showToast(`Unable to join "${m?.title}": Meeting link is missing or invalid.`, 'error');
                        return;
                      }
                      window.open(validUrl, '_blank', 'noopener,noreferrer');
                      showToast(`Opening "${m?.title}" in a new tab...`, 'success');
                    }}
                    className="mt-3 w-full py-2 px-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <span>Join Meeting</span>
                    <ExternalLink size={12} />
                  </button>
                </div>

                {meetings[1] && (
                  <div className="p-3 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]">
                        {meetings[1].title}
                      </div>
                      <div className="text-[10px]">
                        {meetings[1].date} • {meetings[1].time}
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate('Announcements')}
                      className="text-[var(--text-primary)] hover:underline text-[11px] font-semibold shrink-0"
                    >
                      View
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
