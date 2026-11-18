import React, { useState } from 'react';
import {
  Check,
  Search,
  X,
} from 'lucide-react';
import { useEmployee } from '../../context/EmployeeContext';
import { getInitials } from '../../utils/dateUtils';

export function AdminLeaveApprovalsPage() {
  const { leaveRequests, approveLeaveRequest, rejectLeaveRequest } = useEmployee();
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = leaveRequests.filter((req) => {
    if (filter !== 'all' && req.status !== filter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        req.reason.toLowerCase().includes(q) ||
        req.leaveType.toLowerCase().includes(q) ||
        req.startDate.includes(q)
      );
    }
    return true;
  });

  const pendingCount = leaveRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Employee Leave Approvals
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Review time-off requests submitted by employees. Approving a request automatically deducts from employee leave allowance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
            {pendingCount} Awaiting Review
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              filter === 'all'
                ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All Requests ({leaveRequests.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
              filter === 'pending'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              filter === 'approved'
                ? 'bg-[#9D8F82] text-[#F3E8D6] shadow-sm'
                : 'bg-[#9D8F82]/15 text-[var(--text-primary)] hover:bg-[#9D8F82]/25'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              filter === 'rejected'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            Rejected
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search reasons or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] w-48 sm:w-56"
          />
        </div>
      </div>

      {/* Table */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider bg-[var(--bg-surface-hover)] rounded-xl">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Leave Type</th>
                <th className="py-3 px-4">Requested Dates</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((req) => (
                <tr key={req.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[10px]">
                      {getInitials(req.employeeName || req.employee?.name || 'Employee')}
                    </div>
                    <div>
                      <div>{req.employeeName || req.employee?.name || 'Employee'}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] font-normal">
                        {req.employee?.email || (req.employeeId ? `EMP-${req.employeeId.slice(0, 6).toUpperCase()}` : '—')}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[11px]">
                      {req.leaveType}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-medium">
                    {req.startDate} {req.startDate !== req.endDate ? `to ${req.endDate}` : ''}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">
                    {req.workingDays} {req.workingDays === 1 ? 'day' : 'days'}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] max-w-xs truncate" title={req.reason}>
                    {req.reason}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                        req.status === 'approved'
                          ? 'bg-[#9D8F82]/15 text-[var(--text-primary)] border-[#9D8F82]/30'
                          : req.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : req.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          req.status === 'approved'
                            ? 'bg-[#9D8F82]'
                            : req.status === 'pending'
                            ? 'bg-amber-500'
                            : req.status === 'rejected'
                            ? 'bg-rose-500'
                            : 'bg-stone-400'
                        }`}
                      />
                      {req.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {req.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => approveLeaveRequest(req.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#9D8F82] hover:bg-[#8B7E72] text-[#F3E8D6] font-semibold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
                          title="Approve Leave Application"
                        >
                          <Check size={13} /> Approve
                        </button>
                        <button
                          onClick={() => rejectLeaveRequest(req.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 font-semibold text-xs flex items-center gap-1 transition active:scale-95"
                          title="Reject Leave Application"
                        >
                          <X size={13} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {req.reviewedBy || 'Reviewed'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                    No leave requests found matching the current filter.
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
