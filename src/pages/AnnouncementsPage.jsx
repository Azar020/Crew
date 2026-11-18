import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Filter,
  Info,
  Link,
  MessageSquare,
  Sparkles,
  Video,
} from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';

// Helper to validate and normalize video conference URLs (Google Meet, Zoom, MS Teams, etc.)
function getValidMeetingUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // If already starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  // If provided as a domain/path without protocol (e.g. meet.google.com/xyz)
  try {
    const withProtocol = `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function AnnouncementsPage() {
  const {
    announcements,
    unreadAnnouncementsCount,
    toggleAnnouncementRead,
    markAllAnnouncementsRead,
    meetings,
    showToast,
  } = useEmployee();

  const [activeTab, setActiveTab] = useState('announcements');
  const [filter, setFilter] = useState('all');

  const filteredAnnouncements = announcements.filter((a) => {
    if (filter === 'unread') return !a.read;
    if (filter === 'urgent') return a.priority === 'Urgent' || a.priority === 'Important';
    return true;
  });

  const handleJoinMeeting = (meeting) => {
    const title = meeting?.title || 'Meeting';
    const rawLink = meeting?.meetingLink || meeting?.link;
    const validUrl = getValidMeetingUrl(rawLink);

    if (!validUrl) {
      showToast(
        `Unable to join "${title}": Meeting video conference URL is missing or invalid.`,
        'error'
      );
      return;
    }

    try {
      const newTab = window.open(validUrl, '_blank', 'noopener,noreferrer');
      if (newTab) {
        showToast(`Redirecting to ${meeting?.platform || 'video conference'} for "${title}" in a new tab...`, 'success');
      } else {
        // Fallback if popup blocker intercepted new tab
        window.location.href = validUrl;
      }
    } catch {
      window.location.href = validUrl;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Announcements & Scheduled Events
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Company-wide broadcasts from Admin leadership and scheduled team video conferences
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-xl bg-[var(--bg-surface-hover)] p-1 border border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'announcements'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bell size={14} /> Announcements ({announcements.length})
            {unreadAnnouncementsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadAnnouncementsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('meetings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'meetings'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Calendar size={14} /> Meetings & Events ({meetings.length})
          </button>
        </div>
      </div>

      {/* ── TAB 1: Admin Announcements ── */}
      {activeTab === 'announcements' && (
        <div className="flex flex-col gap-4">
          {/* Controls Bar */}
          <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  filter === 'all'
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                    : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                All Announcements
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                  filter === 'unread'
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                    : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>Unread</span>
                {unreadAnnouncementsCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadAnnouncementsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilter('urgent')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  filter === 'urgent'
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                    : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Urgent & Important
              </button>
            </div>

            {unreadAnnouncementsCount > 0 && (
              <button
                onClick={markAllAnnouncementsRead}
                className="text-xs text-[var(--text-primary)] hover:underline font-bold flex items-center gap-1.5"
              >
                <CheckCircle size={14} /> Mark all as read
              </button>
            )}
          </div>

          {/* List of Announcements */}
          <div className="flex flex-col gap-3">
            {filteredAnnouncements.map((item) => (
              <div
                key={item.id}
                className={`card p-6 rounded-2xl bg-[var(--bg-surface)] border transition-all ${
                  item.read ? 'border-[var(--border-subtle)] opacity-85' : 'border-[var(--border-strong)] shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        item.priority === 'Urgent'
                          ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                          : item.priority === 'Important'
                          ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                          : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      <Bell size={18} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            item.priority === 'Urgent'
                              ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                              : item.priority === 'Important'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                              : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {item.priority}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">
                          {item.publishedDate}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">• {item.category}</span>
                      </div>

                      <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug font-display">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-3xl">
                        {item.body}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleAnnouncementRead(item.id)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                      item.read
                        ? 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                        : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)]'
                    }`}
                  >
                    {item.read ? 'Mark Unread' : 'Mark as Read'}
                  </button>
                </div>
              </div>
            ))}

            {filteredAnnouncements.length === 0 && (
              <div className="card p-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center text-[var(--text-muted)] text-sm">
                No announcements match the selected filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: Scheduled Meetings & Events ── */}
      {activeTab === 'meetings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {meetings.map((meet) => (
            <div
              key={meet.id}
              className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#9D8F82]/15 text-[var(--text-primary)] border border-[#9D8F82]/30">
                    {meet.platform}
                  </span>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{meet.duration}</span>
                </div>

                <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug font-display">
                  {meet.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  {meet.description}
                </p>

                <div className="mt-4 flex items-center gap-3 text-xs text-[var(--text-secondary)] font-medium">
                  <span className="flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                    <Clock size={13} className="text-[var(--text-secondary)]" /> {meet.time}
                  </span>
                  <span>•</span>
                  <span>{meet.date}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleJoinMeeting(meet)}
                  className="w-full py-2.5 px-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
                  title={meet.link ? `Join ${meet.platform}: ${meet.link}` : 'No meeting link provided'}
                >
                  <Video size={14} /> Join Video Conference
                </button>
                <div className="text-[10px] text-[var(--text-muted)] text-center truncate" title={meet.link || 'No meeting link provided'}>
                  {meet.link || 'No video conference link provided'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast Info Notice */}
      <div className="p-3 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Info size={15} className="text-[var(--text-secondary)] shrink-0" />
        <span>
          Announcements and company events are published and managed by your organization's administrators.
        </span>
      </div>
    </div>
  );
}
