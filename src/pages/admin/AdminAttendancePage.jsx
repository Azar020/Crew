import React, { useState } from 'react';
import {
  Coffee,
  Download,
  Search,
} from 'lucide-react';
import { useEmployee } from '../../context/EmployeeContext';

export function AdminAttendancePage() {
  const { attendanceHistory, showToast } = useEmployee();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = attendanceHistory.filter((rec) => {
    if (statusFilter !== 'all' && rec.status !== statusFilter) return false;
    if (
      searchTerm &&
      !rec.date.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !String(rec.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const presentCount   = attendanceHistory.filter((r) => r.status === 'present').length;
  const inProgressCount = attendanceHistory.filter((r) => r.status === 'working').length;
  const halfDayCount   = attendanceHistory.filter((r) => r.status === 'half_day').length;

  const handleExport = () => {
    showToast('Company-wide attendance log exported to CSV.', 'success');
  };

  // Status badge helper
  const statusBadge = (status) => {
    const cfg = {
      present:  { label: 'Full Day',    dot: 'bg-[#9D8F82]',                 pill: 'bg-[#9D8F82]/15 text-[var(--text-primary)] border-[#9D8F82]/30' },
      working:  { label: 'In Progress', dot: 'bg-amber-500 animate-pulse',    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
      late:     { label: 'Late',        dot: 'bg-orange-500',                 pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30' },
      half_day: { label: 'Half Day',    dot: 'bg-sky-500',                    pill: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
      absent:   { label: 'Absent',      dot: 'bg-rose-500',                   pill: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' },
    };
    const s = cfg[status] ?? cfg.absent;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${s.pill}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Organization Shift &amp; Attendance Audit
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Full shift audit trail across engineering, product, and operations teams from PostgreSQL
          </p>
        </div>

        <button
          onClick={handleExport}
          className="px-3.5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
        >
          <Download size={14} /> Export Audit Log
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Total Logs Recorded
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1 font-display">
            {attendanceHistory.length}
          </div>
          <span className="text-[10px] text-[#9D8F82] font-semibold">PostgreSQL records</span>
        </div>
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            In Progress
          </span>
          <div className="text-2xl font-bold text-amber-500 mt-1 font-display">
            {inProgressCount}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">Currently online</span>
        </div>
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Full Day Completed
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1 font-display">
            {presentCount}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">≥ threshold net worked</span>
        </div>
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Half Day
          </span>
          <div className="text-2xl font-bold text-sky-500 mt-1 font-display">
            {halfDayCount}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">Between thresholds</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',      label: `All (${attendanceHistory.length})` },
            { key: 'present',  label: 'Full Day' },
            { key: 'working',  label: 'In Progress' },
            { key: 'half_day', label: 'Half Day' },
            { key: 'absent',   label: 'Absent' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl font-bold capitalize transition ${
                statusFilter === key
                  ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                  : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search date or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] w-48 sm:w-56"
          />
        </div>
      </div>

      {/* Log Table */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider bg-[var(--bg-surface-hover)] rounded-xl">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Employee ID</th>
                <th className="py-3 px-4">Check In (IST)</th>
                <th className="py-3 px-4">Check Out (IST)</th>
                <th className="py-3 px-4">Breaks</th>
                <th className="py-3 px-4">Break Time</th>
                <th className="py-3 px-4">Net Working Hrs</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">{row.date}</td>
                  <td className="py-3.5 px-4 font-mono text-[var(--text-secondary)] text-[11px]">
                    {row.employeeId
                      ? `EMP-${String(row.employeeId).slice(0, 6).toUpperCase()}`
                      : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-mono">{row.checkIn}</td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-mono">{row.checkOut}</td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-[11px]">
                      <Coffee size={11} /> {row.breakCount ?? 0}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-semibold">
                    {row.breakDuration || '—'}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)] font-display">
                    {row.netHours}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {statusBadge(row.status)}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                    No attendance logs recorded in the database yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
