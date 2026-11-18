import React, { useState, useEffect } from 'react';
import { Coffee, LogIn, LogOut, Play, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';
import { formatTimeInTz, getTimezoneMeta } from '../utils/dateUtils';
import { CheckOutConfirmModal } from './CheckOutConfirmModal';

export function AttendanceCard({ showBreakList = false }) {
  const {
    attendance,
    checkIn,
    checkOut,
    breaks,
    currentBreak,
    breakMinutes,
    workedHours,
    handleCheckIn,
    handleStartBreak,
    handleEndBreak,
    handleCheckOut,
    profile,
  } = useEmployee();

  const [feedback, setFeedback] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [elapsedBreakSeconds, setElapsedBreakSeconds] = useState(0);

  // Live timer for active break
  useEffect(() => {
    if (!currentBreak?.startTime) {
      setElapsedBreakSeconds(0);
      return;
    }
    const update = () => {
      const start = new Date(currentBreak.startTime).getTime();
      setElapsedBreakSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [currentBreak]);

  const formatElapsed = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const tzMeta = getTimezoneMeta(profile?.timezone || 'Asia/Kolkata');

  const working = attendance === 'working';
  const onBreak = attendance === 'break';
  const checkedOut = attendance === 'checked_out';
  const notStarted = attendance === 'not_started';

  // 3 simple statuses
  const statusLabel = working ? 'Online' : onBreak ? 'Break' : 'Offline';
  const statusColor = working ? '#9D8F82' : onBreak ? '#F59E0B' : '#566167';

  const onCheckInClick = async () => {
    const res = await handleCheckIn();
    if (!res.success) setFeedback(res.message);
    else setFeedback(null);
  };

  const onStartBreakClick = async () => {
    const res = await handleStartBreak();
    if (!res.success) setFeedback(res.message);
    else setFeedback(null);
  };

  const onEndBreakClick = async () => {
    const res = await handleEndBreak();
    if (!res.success) setFeedback(res.message);
    else setFeedback(null);
  };

  const onCheckOutRequest = () => {
    setFeedback(null);
    setConfirmModalOpen(true);
  };

  const onConfirmCheckOut = async () => {
    setConfirmModalOpen(false);
    const res = await handleCheckOut();
    if (!res.success) setFeedback(res.message);
    else setFeedback(null);
  };

  return (
    <>
      <section className="card attendance-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] relative overflow-hidden">
        {/* Header */}
        <div className="card-header flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] tracking-wider uppercase">
                Today's Attendance Session
              </span>
              <span className="text-[10px] bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-semibold px-2 py-0.5 rounded-full border border-[var(--border-subtle)] flex items-center gap-1">
                <Clock size={10} className="text-[#9D8F82]" />
                <span>{tzMeta.code} ({tzMeta.offset})</span>
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)] font-display">
              {checkedOut
                ? 'Workday Completed'
                : onBreak
                ? "You're on Break"
                : working
                ? "You're Currently Working"
                : 'Ready to Start Your Shift?'}
            </h3>
          </div>

          {/* Status Pill: Online / Break / Offline */}
          <span
            className="status-pill px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border"
            style={{
              borderColor: `${statusColor}40`,
              backgroundColor: `${statusColor}15`,
              color: statusColor,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: statusColor,
                animation: working ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
              }}
            />
            {statusLabel}
          </span>
        </div>

        {/* Attendance Times Row */}
        <div className="attendance-times my-5 flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Check In
            </span>
            <strong className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              {formatTimeInTz(checkIn, profile?.timezone)}
            </strong>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[var(--border-strong)]">
            <div className="w-10 h-[1px] bg-[var(--border-strong)]" />
            <Clock size={14} className="text-[var(--text-muted)]" />
            <div className="w-10 h-[1px] bg-[var(--border-strong)]" />
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Check Out
            </span>
            <strong className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              {formatTimeInTz(checkOut, profile?.timezone)}
            </strong>
          </div>

          <div className="attendance-hours flex flex-col text-right ml-auto">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Net Working Hours
            </span>
            <strong className="text-2xl font-black text-[var(--text-primary)] tracking-tight font-display">
              {workedHours.toFixed(1)}h
            </strong>
          </div>
        </div>

        {/* Active Break Banner with Live Timer */}
        {onBreak && currentBreak && (
          <div className="my-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Coffee size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Active Break in Progress
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Started at {formatTimeInTz(currentBreak.startTime, 'Asia/Kolkata')} • Live Elapsed:{' '}
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatElapsed(elapsedBreakSeconds)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onEndBreakClick}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Play size={14} /> End Break
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="attendance-controls flex items-center gap-3 flex-wrap">
          {notStarted && (
            <button
              className="primary-btn px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition active:scale-95"
              onClick={onCheckInClick}
            >
              <LogIn size={16} /> Check In Now
            </button>
          )}

          {working && (
            <>
              <button
                className="soft-btn px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition active:scale-95"
                onClick={onStartBreakClick}
              >
                <Coffee size={16} className="text-amber-500" /> Start Break
              </button>
              <button
                className="danger-btn px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition active:scale-95"
                onClick={onCheckOutRequest}
              >
                <LogOut size={16} /> Check Out
              </button>
            </>
          )}

          {onBreak && (
            <>
              <button
                className="primary-btn px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition active:scale-95"
                onClick={onEndBreakClick}
              >
                <Play size={16} className="text-[#9D8F82]" /> End Break & Resume Work
              </button>
              <button
                className="danger-btn px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition active:scale-95"
                onClick={onCheckOutRequest}
              >
                <LogOut size={16} /> Check Out (Auto-ends Break)
              </button>
            </>
          )}

          {checkedOut && (
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] px-3.5 py-2.5 rounded-xl">
              <CheckCircle size={15} className="text-[#9D8F82]" />
              <span>Shift complete for today. Thank you for your hard work!</span>
            </div>
          )}
        </div>

        {/* Validation feedback message */}
        {feedback && (
          <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle size={15} className="shrink-0 text-rose-500" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Break Summary Section */}
        <div className="break-summary mt-5 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Coffee size={15} className="text-[var(--text-primary)]" />
            <span className="font-semibold text-[var(--text-primary)]">Total Breaks Taken:</span>
            <span className="font-bold text-[var(--text-primary)]">
              {breaks.length + (currentBreak ? 1 : 0)} break(s) •{' '}
              {Math.floor(breakMinutes / 60)}h {breakMinutes % 60}m
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <div className="w-24 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full bg-[#9D8F82] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (breakMinutes / 90) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Max: 1h 30m</span>
          </div>
        </div>

        {/* Detailed Multiple Breaks Breakdown */}
        {showBreakList && (
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
            <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Today's Individual Break Logs
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {breaks.map((b, idx) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[var(--bg-surface)] text-[var(--text-primary)] text-[10px] font-bold flex items-center justify-center border border-[var(--border-subtle)]">
                      #{idx + 1}
                    </span>
                    <span>
                      {formatTimeInTz(b.startTime, profile?.timezone)} –{' '}
                      {b.endTime ? formatTimeInTz(b.endTime, profile?.timezone) : 'Now'}
                    </span>
                  </div>
                  <span className="font-bold text-[var(--text-primary)]">{b.durationMinutes}m</span>
                </div>
              ))}

              {currentBreak && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                      #{breaks.length + 1}
                    </span>
                    <span>
                      {formatTimeInTz(currentBreak.startTime, profile?.timezone)}{' '}
                      – Active Break
                    </span>
                  </div>
                  <span className="font-bold">In Progress</span>
                </div>
              )}

              {breaks.length === 0 && !currentBreak && (
                <div className="text-xs text-[var(--text-muted)] italic py-1">
                  No breaks taken yet today.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Confirmation Modal */}
      <CheckOutConfirmModal
        isOpen={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={onConfirmCheckOut}
      />
    </>
  );
}
