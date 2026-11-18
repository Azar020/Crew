import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Send,
  Trash2,
  Info,
} from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';

export function LeavePage() {
  const {
    leaveBalances,
    leaveRequests,
    pendingLeaveDays,
    addLeaveRequest,
    cancelLeaveRequest,
    getDateLeaveStatus,
    showToast,
  } = useEmployee();

  // Current calendar view (Dynamic current month and year)
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  // Form State with dynamic default dates
  const defaultStart = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const defaultEnd = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];
  const [selectedLeaveType, setSelectedLeaveType] = useState('Annual');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [reason, setReason] = useState('');

  // Calendar calculations
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Calculate working days between startDate and endDate
  const calculatedWorkingDays = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) return 0;

    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Exclude Sunday (0) and Saturday (6)
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  }, [startDate, endDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Calendar Day Click Handler: Supports Single-day & Multi-day selection
  const handleDayClick = (day) => {
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const clickedDateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;

    if (!startDate || (startDate && endDate && startDate !== endDate)) {
      setStartDate(clickedDateStr);
      setEndDate(clickedDateStr);
    } else if (startDate && (!endDate || startDate === endDate)) {
      if (clickedDateStr < startDate) {
        setStartDate(clickedDateStr);
        setEndDate(clickedDateStr);
      } else {
        setEndDate(clickedDateStr);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast('Please enter a brief reason for your leave request.', 'error');
      return;
    }

    const res = addLeaveRequest({
      leaveType: selectedLeaveType,
      startDate,
      endDate,
      workingDays: calculatedWorkingDays,
      reason,
    });

    if (res.success) {
      setReason('');
    }
  };

  // Total leave summaries
  const totalTaken =
    leaveBalances.annual.used + leaveBalances.sick.used + leaveBalances.casual.used;
  const totalRemaining =
    leaveBalances.annual.remaining +
    leaveBalances.sick.remaining +
    leaveBalances.casual.remaining;
  const totalAllowance = totalTaken + totalRemaining;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top Header ── */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
          Leave Management & Time Off
        </h2>
        <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
          Calendar-based application • Color-coded status preview • Instant balance updates
        </p>
      </div>

      {/* ── Balance Cards Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Annual Leave */}
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
            <span>Annual Leave</span>
            <span className="p-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              <CalendarIcon size={14} />
            </span>
          </div>
          <div className="my-3">
            <strong className="text-3xl font-bold text-[var(--text-primary)] tracking-tight font-display">
              {leaveBalances.annual.remaining}
            </strong>
            <span className="text-xs text-[var(--text-secondary)] font-medium ml-1.5">
              days left of {leaveBalances.annual.total}
            </span>
          </div>
          <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[var(--text-primary)] h-full rounded-full"
              style={{
                width: `${(leaveBalances.annual.remaining / leaveBalances.annual.total) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Sick Leave */}
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
            <span>Sick Leave</span>
            <span className="p-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              <Clock size={14} />
            </span>
          </div>
          <div className="my-3">
            <strong className="text-3xl font-bold text-[var(--text-primary)] tracking-tight font-display">
              {leaveBalances.sick.remaining}
            </strong>
            <span className="text-xs text-[var(--text-secondary)] font-medium ml-1.5">
              days left of {leaveBalances.sick.total}
            </span>
          </div>
          <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full rounded-full"
              style={{
                width: `${(leaveBalances.sick.remaining / leaveBalances.sick.total) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Casual Leave */}
        <div className="card p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
            <span>Casual Leave</span>
            <span className="p-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              <FileText size={14} />
            </span>
          </div>
          <div className="my-3">
            <strong className="text-3xl font-bold text-[var(--text-primary)] tracking-tight font-display">
              {leaveBalances.casual.remaining}
            </strong>
            <span className="text-xs text-[var(--text-secondary)] font-medium ml-1.5">
              days left of {leaveBalances.casual.total}
            </span>
          </div>
          <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-sky-600 h-full rounded-full"
              style={{
                width: `${(leaveBalances.casual.remaining / leaveBalances.casual.total) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Total Leave Taken */}
        <div className="card p-5 rounded-2xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold opacity-80">
            <span>Total Used This Year</span>
            <span className="p-1 rounded-lg bg-white/10">
              <CheckCircle2 size={14} />
            </span>
          </div>
          <div className="my-3">
            <strong className="text-3xl font-bold tracking-tight font-display">
              {totalTaken}
            </strong>
            <span className="text-xs opacity-75 font-medium ml-1.5">
              days taken ({totalRemaining} remaining)
            </span>
          </div>
          <div className="text-[11px] opacity-75 font-medium">
            Allowance: {totalAllowance} days • Pending: {pendingLeaveDays} days
          </div>
        </div>
      </div>

      {/* ── Calendar & Request Form Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Monthly Calendar (7 cols) */}
        <div className="lg:col-span-7 card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Interactive Date Picker
              </p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">
                {monthNames[currentMonth]} {currentYear}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] transition"
                aria-label="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] transition"
                aria-label="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1.5 flex-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12 rounded-xl" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const formattedMonth = String(currentMonth + 1).padStart(2, '0');
              const formattedDay = String(day).padStart(2, '0');
              const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;

              const leaveStatus = getDateLeaveStatus(dateStr);
              const isSelected = dateStr >= startDate && dateStr <= endDate;

              let statusBg = 'hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]';

              if (leaveStatus === 'pending') {
                statusBg = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40 font-bold';
              } else if (leaveStatus === 'approved-upcoming') {
                statusBg = 'bg-[#9D8F82]/15 text-[var(--text-primary)] border border-[#9D8F82]/40 font-bold';
              } else if (leaveStatus === 'approved-past') {
                statusBg = 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/40 font-bold';
              }

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(day)}
                  className={`h-12 rounded-xl flex flex-col items-center justify-center text-xs transition relative active:scale-95 ${statusBg} ${
                    isSelected ? 'ring-2 ring-[var(--border-focus)] ring-offset-1' : ''
                  }`}
                  title={`${dateStr} ${leaveStatus ? `(${leaveStatus})` : ''}`}
                >
                  <span className="font-semibold">{day}</span>
                  {leaveStatus === 'pending' && (
                    <span className="text-[8px] font-bold text-amber-600 leading-none">Pending</span>
                  )}
                  {leaveStatus === 'approved-upcoming' && (
                    <span className="text-[8px] font-bold text-[#9D8F82] leading-none">Approved</span>
                  )}
                  {leaveStatus === 'approved-past' && (
                    <span className="text-[8px] font-bold text-rose-600 leading-none">Past</span>
                  )}
                  {isSelected && !leaveStatus && (
                    <span className="text-[8px] font-bold text-[var(--text-secondary)] leading-none">Selected</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Color Legend */}
          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-around flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-500/20 border border-amber-500/40" />
              <span className="text-[var(--text-secondary)] font-medium">Pending Leave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-[#9D8F82]/20 border border-[#9D8F82]/40" />
              <span className="text-[var(--text-secondary)] font-medium">Approved Upcoming</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500/20 border border-rose-500/40" />
              <span className="text-[var(--text-secondary)] font-medium">Past Leave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md border-2 border-[var(--border-focus)] bg-[var(--bg-surface)]" />
              <span className="text-[var(--text-secondary)] font-medium">Selected Range</span>
            </div>
          </div>
        </div>

        {/* Right: Submit Leave Request Form (5 cols) */}
        <div className="lg:col-span-5 card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Time Off Application
              </p>
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Request Leave</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Click on the calendar to pick single or multiple consecutive dates.
              </p>
            </div>

            {/* Leave Type Select */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Leave Category</label>
              <select
                value={selectedLeaveType}
                onChange={(e) => setSelectedLeaveType(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] font-medium focus:outline-none focus:border-[var(--border-strong)]"
              >
                <option value="Annual">Annual Vacation Leave ({leaveBalances.annual.remaining} left)</option>
                <option value="Sick">Sick / Medical Leave ({leaveBalances.sick.remaining} left)</option>
                <option value="Casual">Casual Personal Leave ({leaveBalances.casual.remaining} left)</option>
              </select>
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                  required
                />
              </div>
            </div>

            {/* Calculated duration summary */}
            <div className="p-3 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">Calculated Duration:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {calculatedWorkingDays} Working {calculatedWorkingDays === 1 ? 'Day' : 'Days'}
              </span>
            </div>

            {/* Reason Field */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">
                Reason for Leave <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly describe the reason for your time-off request..."
                rows={3}
                className="w-full p-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Send size={15} /> Submit Leave Request
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
            <Info size={14} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
            <span>
              Approvals are reviewed by your administrator. You will receive an alert
              upon status change.
            </span>
          </div>
        </div>
      </div>

      {/* ── Leave Request History Table with Cancellation Support ── */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="card-header flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Audit & Track
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Leave Request History</h3>
            </div>
          </div>
          <span className="text-xs bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-bold px-3 py-1 rounded-full border border-[var(--border-subtle)]">
            {leaveRequests.length} total applications
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3 px-4">Leave Type</th>
                <th className="py-3 px-4">Dates</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {leaveRequests.map((req) => (
                <tr key={req.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11px]">
                      {req.leaveType}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] font-medium">
                    {req.startDate} {req.startDate !== req.endDate ? `to ${req.endDate}` : ''}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)]">
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
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                          : req.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
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
                      <button
                        onClick={() => cancelLeaveRequest(req.id)}
                        className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-500/10 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 ml-auto transition"
                        title="Cancel this pending leave request"
                      >
                        <Trash2 size={13} /> Cancel
                      </button>
                    ) : (
                      <span className="text-[var(--text-muted)] text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
