import React from 'react';
import { ArrowUpRight, CalendarDays, Video } from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';

export function MeetingCard({ onNavigate }) {
  const { meetings } = useEmployee();
  const nextMeeting = meetings[0];

  return (
    <div className="card meeting-card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
      <div className="card-header flex items-center justify-between mb-4">
        <div>
          <p className="section-kicker text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Next Up
          </p>
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Upcoming Meeting
          </h3>
        </div>
        <CalendarDays size={18} className="text-[#9D8F82]" />
      </div>

      {nextMeeting ? (
        <>
          <div className="meeting-time my-3 flex items-baseline gap-2">
            <strong className="text-2xl font-bold font-display text-[var(--text-primary)]">
              {nextMeeting.time}
            </strong>
            <span className="text-xs text-[var(--text-secondary)] font-medium">
              {nextMeeting.date}
            </span>
          </div>

          <div className="meeting-details p-3 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] mb-4">
            <strong className="block text-xs font-bold text-[var(--text-primary)]">
              {nextMeeting.title}
            </strong>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5 block">
              {nextMeeting.platform} • {nextMeeting.duration}
            </span>
          </div>

          {nextMeeting.link ? (
            <a
              href={nextMeeting.link}
              target="_blank"
              rel="noreferrer"
              className="soft-btn full w-full py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              Join Meeting <ArrowUpRight size={14} />
            </a>
          ) : (
            <button
              onClick={() => onNavigate && onNavigate('Announcements')}
              className="soft-btn full w-full py-2.5 rounded-xl bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-semibold text-xs flex items-center justify-center gap-1.5 transition"
            >
              View Schedule <ArrowUpRight size={14} />
            </button>
          )}
        </>
      ) : (
        <div className="py-6 text-center text-xs text-[var(--text-muted)] italic">
          No upcoming meetings scheduled.
        </div>
      )}
    </div>
  );
}
