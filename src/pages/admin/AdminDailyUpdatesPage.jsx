import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import api from '../../services/api';
import { fetchEmployees } from '../../services/employeeService';
import { UserAvatar } from '../../components/UserAvatar';
import { useEmployee } from '../../context/EmployeeContext';
import { formatTimeInTz } from '../../utils/dateUtils';

export function AdminDailyUpdatesPage() {
  const { showToast } = useEmployee();

  // Selected date defaults to today in Asia/Kolkata
  const todayIso = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'submitted' | 'missing'

  // Data states
  const [employees, setEmployees] = useState([]);
  const [dailyUpdates, setDailyUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // View modal for full update text
  const [viewingUpdate, setViewingUpdate] = useState(null);

  // Load all employees and daily updates from PostgreSQL
  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [empRes, updatesRes] = await Promise.all([
        fetchEmployees(),
        api.get('/daily-updates?scope=all&limit=100'),
      ]);

      if (empRes?.data) {
        setEmployees(empRes.data);
      }

      const updates = updatesRes.data?.dailyUpdates || [];
      setDailyUpdates(updates);

      if (isManualRefresh) {
        showToast('Daily updates synchronized from PostgreSQL.', 'success');
      }
    } catch (err) {
      console.warn('Failed to load daily updates data:', err);
      if (isManualRefresh) {
        showToast('Failed to refresh data from server.', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Departments list from employees
  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [employees]);

  // Combined employee update status for selectedDate
  const employeeUpdateList = useMemo(() => {
    return employees.map((emp) => {
      // Find matching update for this employee on selectedDate
      const empUuid = emp.id || emp.employeeId;
      const update = dailyUpdates.find(
        (u) =>
          (u.employeeId === empUuid || u.employeeId === emp.id) &&
          u.workDate === selectedDate
      );

      return {
        employee: emp,
        hasSubmitted: Boolean(update),
        update: update || null,
      };
    });
  }, [employees, dailyUpdates, selectedDate]);

  // Filtered employee update list
  const filteredList = useMemo(() => {
    return employeeUpdateList.filter(({ employee, hasSubmitted, update }) => {
      // Search by employee name or ID
      if (searchTerm) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = (employee.name || '').toLowerCase().includes(q);
        const matchesId = (employee.employeeId || '').toLowerCase().includes(q);
        const matchesContent = (update?.content || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesContent) return false;
      }

      // Department filter
      if (selectedDept !== 'All' && employee.department !== selectedDept) {
        return false;
      }

      // Status filter
      if (statusFilter === 'submitted' && !hasSubmitted) return false;
      if (statusFilter === 'missing' && hasSubmitted) return false;

      return true;
    });
  }, [employeeUpdateList, searchTerm, selectedDept, statusFilter]);

  // Statistics for selected date
  const submittedCount = employeeUpdateList.filter((item) => item.hasSubmitted).length;
  const missingCount = Math.max(0, employees.length - submittedCount);
  const submissionRate = employees.length > 0 ? Math.round((submittedCount / employees.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 select-none animate-fadeIn">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Employee Daily Work Updates
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Real-time daily standup logs, project updates, and activity submissions from PostgreSQL
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#9D8F82]' : ''} />
          <span>Refresh Updates</span>
        </button>
      </div>

      {/* ── Key Metrics Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Total Staff
            </span>
            <Users size={16} className="text-[#9D8F82]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1 font-display">
            {employees.length}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">Provisioned employees</span>
        </div>

        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Updates Submitted
            </span>
            <CheckCircle2 size={16} className="text-[#9D8F82]" />
          </div>
          <div className="text-2xl font-bold text-[#9D8F82] mt-1 font-display">
            {submittedCount}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">
            {submissionRate}% submission rate for date
          </span>
        </div>

        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Pending / Not Submitted
            </span>
            <AlertCircle size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-500 mt-1 font-display">
            {missingCount}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">Awaiting daily report</span>
        </div>

        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Selected Work Date
            </span>
            <Calendar size={16} className="text-[#9D8F82]" />
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)] mt-2 font-mono">
            {selectedDate === todayIso ? 'Today • ' : ''}
            {selectedDate}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-medium">IST (Asia/Kolkata)</span>
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all', label: `All Staff (${employees.length})` },
            { key: 'submitted', label: `Submitted (${submittedCount})` },
            { key: 'missing', label: `Not Submitted (${missingCount})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl font-bold transition ${
                statusFilter === key
                  ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                  : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date Selector + Search + Department Filter */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Date Shortcuts */}
          <button
            onClick={() => setSelectedDate(todayIso)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
              selectedDate === todayIso
                ? 'bg-[#9D8F82]/15 text-[var(--text-primary)] border-[#9D8F82]/30'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
            }`}
          >
            Today
          </button>

          {/* Date Input */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <Calendar size={13} className="text-[#9D8F82]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] font-mono focus:outline-none"
            />
          </div>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--border-strong)]"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept === 'All' ? 'All Departments' : dept}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Search name, ID or update..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] w-44 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* ── Table: Employee Daily Updates ── */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider rounded-xl">
                <th className="py-3 px-4 min-w-[200px]">Employee</th>
                <th className="py-3 px-4 min-w-[110px]">Employee ID</th>
                <th className="py-3 px-4 min-w-[130px]">Department</th>
                <th className="py-3 px-4 min-w-[140px]">Designation</th>
                <th className="py-3 px-4 min-w-[260px]">Daily Work Update</th>
                <th className="py-3 px-4 min-w-[120px]">Submission Time</th>
                <th className="py-3 px-4 min-w-[120px]">Status</th>
                <th className="py-3 px-4 min-w-[90px] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredList.map(({ employee, hasSubmitted, update }) => (
                <tr key={employee.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  {/* 1. Employee Name & Avatar */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={employee.name}
                        avatarUrl={employee.avatarUrl}
                        size="sm"
                        showStatusDot={false}
                      />
                      <div className="min-w-0">
                        <strong className="block text-xs text-[var(--text-primary)] font-bold truncate">
                          {employee.name}
                        </strong>
                        <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                          {employee.email}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 2. Employee ID */}
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs font-bold text-[var(--text-primary)] px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
                      {employee.employeeId}
                    </span>
                  </td>

                  {/* 3. Department */}
                  <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)]">
                    {employee.department || '—'}
                  </td>

                  {/* 4. Designation */}
                  <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                    {employee.position || '—'}
                  </td>

                  {/* 5. Daily Work Update Preview */}
                  <td className="py-3.5 px-4">
                    {hasSubmitted && update?.content ? (
                      <p
                        className="text-xs text-[var(--text-primary)] line-clamp-2 max-w-sm m-0 leading-relaxed"
                        title={update.content}
                      >
                        {update.content}
                      </p>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)] italic">
                        No update submitted for this date
                      </span>
                    )}
                  </td>

                  {/* 6. Submission Time */}
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--text-secondary)]">
                    {hasSubmitted && update?.createdAt ? (
                      formatTimeInTz(update.createdAt, 'Asia/Kolkata')
                    ) : (
                      '—'
                    )}
                  </td>

                  {/* 7. Status Badge */}
                  <td className="py-3.5 px-4">
                    {hasSubmitted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#9D8F82]/15 text-[var(--text-primary)] border border-[#9D8F82]/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#9D8F82]" />
                        <span>Submitted</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span>Not Submitted</span>
                      </span>
                    )}
                  </td>

                  {/* 8. Action: View Full Update Modal */}
                  <td className="py-3.5 px-4 text-right">
                    {hasSubmitted && update ? (
                      <button
                        onClick={() =>
                          setViewingUpdate({
                            employee,
                            update,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-[11px] inline-flex items-center gap-1 transition"
                        title="View full daily standup update"
                      >
                        <Eye size={12} /> View
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] italic">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    <FileText size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-[var(--text-primary)]">No records found</p>
                    <p className="mt-1">No employees match the selected filters for {selectedDate}.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
          <span>
            Showing <strong className="text-[var(--text-primary)]">{filteredList.length}</strong> of{' '}
            <strong className="text-[var(--text-primary)]">{employees.length}</strong> employees
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#9D8F82]" />
            <span>Timezone: IST (UTC+5:30) • Asia/Kolkata</span>
          </span>
        </div>
      </section>

      {/* ── View Full Daily Update Modal ── */}
      {viewingUpdate && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-lg w-full">
            <button
              onClick={() => setViewingUpdate(null)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <UserAvatar
                name={viewingUpdate.employee.name}
                avatarUrl={viewingUpdate.employee.avatarUrl}
                size="md"
                showStatusDot={false}
              />
              <div>
                <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                  {viewingUpdate.employee.name}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {viewingUpdate.employee.employeeId} • {viewingUpdate.employee.position} •{' '}
                  {viewingUpdate.employee.department}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] mb-4 text-xs space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>
                  Work Date: <strong className="text-[var(--text-primary)]">{viewingUpdate.update.workDate}</strong>
                </span>
                <span>
                  Submitted:{' '}
                  <strong className="text-[var(--text-primary)] font-mono">
                    {formatTimeInTz(viewingUpdate.update.createdAt, 'Asia/Kolkata')}
                  </strong>
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Daily Work Update Content
              </span>
              <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                {viewingUpdate.update.content}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex justify-end">
              <button
                type="button"
                onClick={() => setViewingUpdate(null)}
                className="px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs transition active:scale-95 shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
