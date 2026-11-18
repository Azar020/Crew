import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Eye,
  Plus,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useEmployee } from '../../context/EmployeeContext';

export function AdminAnnouncementsPage() {
  const {
    announcements,
    meetings,
    createAnnouncement,
    deleteAnnouncement,
    createMeeting,
    deleteMeeting,
    showToast,
  } = useEmployee();

  // Announcement compose modal state
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('Important');
  const [publishing, setPublishing] = useState(false);

  // Meeting schedule modal state
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [platform, setPlatform] = useState('Google Meet');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [audience, setAudience] = useState('All Teams');
  const [scheduling, setScheduling] = useState(false);

  // View details modal state
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  // Deletion confirmation modal states
  const [confirmDeleteAnnouncement, setConfirmDeleteAnnouncement] = useState(null);
  const [confirmDeleteMeeting, setConfirmDeleteMeeting] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAnnouncement = async () => {
    if (!confirmDeleteAnnouncement) return;
    setDeleting(true);
    const res = await deleteAnnouncement(confirmDeleteAnnouncement.id);
    setDeleting(false);
    if (res?.success) {
      setConfirmDeleteAnnouncement(null);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!confirmDeleteMeeting) return;
    setDeleting(true);
    const res = await deleteMeeting(confirmDeleteMeeting.id);
    setDeleting(false);
    if (res?.success) {
      setConfirmDeleteMeeting(null);
    }
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast('Please provide both title and announcement content.', 'error');
      return;
    }

    setPublishing(true);
    const res = await createAnnouncement({ title: title.trim(), content: content.trim() });
    setPublishing(false);

    if (res?.success) {
      setShowComposeModal(false);
      setTitle('');
      setContent('');
    }
  };

  const handleScheduleMeeting = async (e) => {
    e.preventDefault();
    if (!meetingTitle.trim() || !meetingDate || !startTime || !endTime) {
      showToast('Please fill in title, date, start time and end time.', 'error');
      return;
    }
    if (endTime <= startTime) {
      showToast('End time must be later than start time.', 'error');
      return;
    }

    setScheduling(true);
    const res = await createMeeting({
      title: meetingTitle.trim(),
      description: meetingAgenda.trim() || undefined,
      meetingDate,
      startTime,
      endTime,
      meetingLink: meetingUrl.trim() || undefined,
      location: platform,
    });
    setScheduling(false);

    if (res?.success) {
      setShowMeetingModal(false);
      setMeetingTitle('');
      setMeetingAgenda('');
      setMeetingUrl('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            Company Broadcasts & Scheduled Events
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Publish organization announcements, schedule company meetings, and synchronize employee calendars
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowComposeModal(true)}
            className="px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Plus size={16} /> Broadcast Announcement
          </button>
          <button
            onClick={() => setShowMeetingModal(true)}
            className="px-4 py-2 rounded-xl bg-[#9D8F82] hover:bg-[#8B7E72] text-[#F3E8D6] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Calendar size={16} /> Schedule Meeting
          </button>
        </div>
      </div>

      {/* ── Section 1: Announcements (Simplified Clean List Layout) ── */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] font-display flex items-center gap-2">
              <Bell size={18} className="text-[#9D8F82]" />
              <span>Published Announcements ({announcements.length})</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Real-time broadcasts distributed to all active employee portals
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider bg-[var(--bg-surface-hover)] rounded-xl">
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Published Date</th>
                <th className="py-3 px-4">Audience</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {announcements.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        item.priority === 'Urgent'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {item.priority || 'Important'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-[var(--text-primary)] max-w-[200px] truncate">
                    {item.title}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)] max-w-[280px] truncate" title={item.body}>
                    {item.body}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                    {item.publishedDate || 'Recently'}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                    {item.audience || 'All Teams'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#9D8F82]/15 text-[var(--text-primary)] border border-[#9D8F82]/30 capitalize">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9D8F82]" />
                      {item.status || 'published'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedAnnouncement(item)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-[11px] inline-flex items-center gap-1 transition"
                      >
                        <Eye size={12} /> View
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAnnouncement(item)}
                        className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition"
                        title="Delete announcement from PostgreSQL"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {announcements.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                    No announcements published yet. Click "Broadcast Announcement" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2: Scheduled Organization Meetings ── */}
      <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] font-display flex items-center gap-2">
              <Calendar size={18} className="text-[#9D8F82]" />
              <span>Scheduled Organization Meetings ({meetings.length})</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Video conferences and sync sessions displayed to employees
            </p>
          </div>
          <button
            onClick={() => setShowMeetingModal(true)}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-xs flex items-center gap-1 transition"
          >
            <Plus size={14} /> Schedule Meeting
          </button>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {meetings.map((m) => (
            <div key={m.id} className="py-3.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]">
                  <Video size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">{m.title}</h4>
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                    <span className="font-semibold text-[#9D8F82]">{m.platform}</span>
                    <span>•</span>
                    <span>{m.duration}</span>
                    {m.description && (
                      <>
                        <span>•</span>
                        <span className="text-[var(--text-muted)] truncate max-w-sm">{m.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)] font-display">{m.time}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">{m.date}</div>
                </div>
                <div className="flex items-center gap-2">
                  {m.link && (
                    <a
                      href={m.link}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center gap-1 transition"
                    >
                      Join <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    onClick={() => setConfirmDeleteMeeting(m)}
                    className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition"
                    title="Delete scheduled meeting from PostgreSQL"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {meetings.length === 0 && (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No meetings scheduled yet. Click "Schedule Meeting" to arrange one.
            </div>
          )}
        </div>
      </section>

      {/* ── Compose Announcement Modal ── */}
      {showComposeModal && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-lg w-full">
            <button
              onClick={() => setShowComposeModal(false)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-[var(--active-bg)] text-[var(--active-text)] flex items-center justify-center mb-4">
              <Bell size={20} />
            </div>

            <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
              Broadcast Company Announcement
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
              Compose an announcement to be saved in PostgreSQL and distributed to all employee portals.
            </p>

            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Announcement Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Organization Strategy & Holiday Schedule"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Announcement Content / Message
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Write announcement details..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                >
                  <option value="Important">Important</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="px-5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  {publishing ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={13} /> Publish Announcement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Dedicated Schedule Meeting Modal (Phase 8) ── */}
      {showMeetingModal && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-lg w-full">
            <button
              onClick={() => setShowMeetingModal(false)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-[var(--active-bg)] text-[var(--active-text)] flex items-center justify-center mb-4">
              <Calendar size={20} />
            </div>

            <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
              Schedule Company Meeting
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
              Create and synchronize a scheduled video meeting or all-hands session in PostgreSQL.
            </p>

            <form onSubmit={handleScheduleMeeting} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sprint Architecture Sync & Team Review"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Agenda / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Meeting agenda and topics..."
                  value={meetingAgenda}
                  onChange={(e) => setMeetingAgenda(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
                  >
                    <option value="Google Meet">Google Meet</option>
                    <option value="Zoom">Zoom</option>
                    <option value="Microsoft Teams">Microsoft Teams</option>
                    <option value="In-Person">In-Person</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Audience / Department
                  </label>
                  <input
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="All Teams or Department"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Meeting Link / URL
                </label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/... or https://zoom.us/..."
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMeetingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduling}
                  className="px-5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  {scheduling ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Calendar size={13} /> Confirm Schedule
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Details Modal ── */}
      {selectedAnnouncement && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-md w-full">
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#9D8F82]/20 text-[var(--text-primary)] border border-[#9D8F82]/30 inline-block mb-3">
              {selectedAnnouncement.priority || 'Company Update'}
            </span>
            <h3 className="font-display font-bold text-lg text-[var(--text-primary)] mb-2">
              {selectedAnnouncement.title}
            </h3>
            <div className="text-[11px] text-[var(--text-secondary)] mb-4">
              Published: {selectedAnnouncement.publishedDate} • Audience: {selectedAnnouncement.audience || 'All Teams'}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {selectedAnnouncement.body}
            </p>

            <div className="flex justify-end pt-5 mt-4 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Announcement Modal ── */}
      {confirmDeleteAnnouncement && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-sm w-full">
            <button
              onClick={() => setConfirmDeleteAnnouncement(null)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle size={20} />
            </div>

            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Delete Announcement?
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-[var(--text-primary)]">"{confirmDeleteAnnouncement.title}"</strong>? This will remove it from the PostgreSQL database and all employee portals.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmDeleteAnnouncement(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAnnouncement}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Meeting Modal ── */}
      {confirmDeleteMeeting && (
        <div className="modal-backdrop">
          <div className="auth-modal max-w-sm w-full">
            <button
              onClick={() => setConfirmDeleteMeeting(null)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle size={20} />
            </div>

            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Delete Scheduled Meeting?
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-[var(--text-primary)]">"{confirmDeleteMeeting.title}"</strong> scheduled for {confirmDeleteMeeting.date}? This will cancel and remove the meeting from PostgreSQL and employee calendars.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmDeleteMeeting(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteMeeting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
