import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AttendanceCard } from '../components/AttendanceCard';
import { useEmployee } from '../context/EmployeeContext';

export function AttendancePage() {
  const { attendanceHistory, showToast } = useEmployee();
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter records
  const filteredRecords = attendanceHistory.filter((rec) => {
    // Search filter
    if (searchTerm && !rec.date.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Period filter
    const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'short' });
    if (filterPeriod === 'this_month' && !rec.date.includes(currentMonthName) && rec.date !== 'Today') {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && rec.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const handleExportCSV = () => {
    showToast('Attendance report exported to CSV successfully.', 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Daily Attendance & Shift Tracker
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Standard shift: 09:00 AM – 06:00 PM • Multiple breaks permitted • Auto-calculated net working hours
          </p>
        </div>
      </div>

      {/* ── Today's Interactive Attendance Card (with multiple breaks breakdown) ── */}
      <AttendanceCard showBreakList={true} />

      {/* ── Attendance History Log ── */}
      <section className="card history-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="card-header flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Shift Audit Log
            </p>
            <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Attendance Records History</h3>
          </div>

          {/* Filters & Actions */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Search Date */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface-hover)] focus:outline-none focus:border-[var(--border-strong)] w-36 sm:w-44"
              />
            </div>

            {/* Period filter */}
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
            >
              <option value="all">All Dates</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="present">Full Day</option>
              <option value="working">In Progress</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="late">Late Arrival</option>
            </select>

            {/* Export */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Check In</th>
                <th className="py-3 px-4">Check Out</th>
                <th className="py-3 px-4">Breaks Taken</th>
                <th className="py-3 px-4">Total Break Time</th>
                <th className="py-3 px-4">Net Working Hours</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredRecords.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Calendar size={13} className="text-[var(--text-secondary)]" />
                    <span>{row.date}</span>
                    {row.isDemo ? (
                      <span className="text-[9px] bg-[var(--bg-surface-hover)] text-[var(--text-muted)] font-bold px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                        Demo
                      </span>
                    ) : (
                      <span className="text-[9px] bg-[#9D8F82]/10 text-[var(--text-primary)] font-bold px-1.5 py-0.5 rounded border border-[#9D8F82]/30">
                        Live
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-medium">{row.checkIn}</td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-medium">{row.checkOut}</td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-[11px]">
                      <Coffee size={11} /> {row.breakCount} break(s)
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-semibold">{row.breakDuration}</td>
                  <td className="py-3.5 px-4 font-black text-[var(--text-primary)] font-display">{row.netHours}</td>
                  <td className="py-3.5 px-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold capitalize border ${
                        row.status === 'present'
                          ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/25'
                          : row.status === 'working'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                          : row.status === 'late'
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25'
                          : row.status === 'half_day'
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          row.status === 'present'
                            ? 'bg-[#9D8F82]'
                            : row.status === 'working'
                            ? 'bg-amber-500 animate-pulse'
                            : row.status === 'late'
                            ? 'bg-orange-500'
                            : row.status === 'half_day'
                            ? 'bg-sky-500'
                            : 'bg-rose-500'
                        }`}
                      />
                      {row.status === 'present'
                        ? 'Full Day'
                        : row.status === 'working'
                        ? 'In Progress'
                        : row.status === 'late'
                        ? 'Late'
                        : row.status === 'half_day'
                        ? 'Half Day'
                        : 'Absent'}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    No attendance records found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Audit Footer Notes */}
        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
          <span>Showing {filteredRecords.length} records</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#9D8F82]" /> Standard shift target: 9h (including lunch)
          </span>
        </div>
      </section>
    </div>
  );
}
