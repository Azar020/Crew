import React, { useState, useEffect } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Globe,
  KeyRound,
  Mail,
  Palette,
  Phone,
  Save,
  Shield,
  User,
} from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { UserAvatar } from '../components/UserAvatar';

export function SettingsPage() {
  const { profile, updateProfile, updateNotifications, showToast } = useEmployee();

  const [formName, setFormName] = useState(profile.name);
  const [formEmail, setFormEmail] = useState(profile.email);
  const [formPhone, setFormPhone] = useState(profile.phone);
  const [formDepartment, setFormDepartment] = useState(profile.department);
  const [formPosition, setFormPosition] = useState(profile.position);
  const [timezone, setTimezone] = useState(profile.timezone);

  useEffect(() => {
    setFormName(profile.name);
    setFormEmail(profile.email);
    setFormPhone(profile.phone);
    setFormDepartment(profile.department);
    setFormPosition(profile.position);
    setTimezone(profile.timezone);
  }, [profile]);

  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateProfile({
      name: formName,
      email: formEmail,
      phone: formPhone,
      timezone,
    });
    showToast('Profile updated successfully!', 'success');
  };

  const handleToggleNotification = (key) => {
    updateNotifications({
      [key]: !profile.notifications[key],
    });
  };

  const handleChangePhoto = () => {
    showToast('Profile photo update dialog simulated.', 'info');
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
          Profile & Account Settings
        </h2>
        <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
          Manage your personal details, notification toggles, and workspace preferences
        </p>
      </div>

      {/* ── Profile Information Card ── */}
      <section className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[var(--border-subtle)]">
          <User size={18} className="text-[var(--text-secondary)]" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Personal Information</h3>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
          {/* Avatar and basic badge */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative group w-16 h-16 shrink-0">
              <UserAvatar
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                size="xl"
                showStatusDot={false}
              />
              <button
                type="button"
                onClick={handleChangePhoto}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-md transition"
                title="Change Profile Photo"
              >
                <Camera size={13} />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-[var(--text-primary)] font-display">{profile.name}</h4>
                <span className="text-[10px] font-bold bg-[var(--bg-surface-hover)] text-[var(--text-primary)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                  {profile.employeeId}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
                {profile.position} • {profile.department}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Joined: {profile.joiningDate} • Status: Active
              </p>
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Full Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Employee ID (Read Only)</label>
              <input
                type="text"
                value={profile.employeeId}
                disabled
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-muted)] cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Email Address</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Phone Number</label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Department</label>
              <input
                type="text"
                value={formDepartment}
                disabled
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-muted)] cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">Position / Role</label>
              <input
                type="text"
                value={formPosition}
                disabled
                className="w-full py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-muted)] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold text-xs flex items-center gap-2 transition active:scale-95"
            >
              <Save size={15} /> Save Profile Changes
            </button>
          </div>
        </form>
      </section>

      {/* ── Notification Preferences Card ── */}
      <section className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[var(--border-subtle)]">
          <Bell size={18} className="text-[var(--text-secondary)]" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Notification Preferences</h3>
        </div>

        <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {/* Email Notifications */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">Email Notifications</div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Receive email alerts for leave approval updates and company announcements.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleNotification('email')}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                profile.notifications.email ? 'bg-[var(--btn-primary-bg)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <div
                className={`bg-[var(--bg-surface)] w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  profile.notifications.email ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Check-In Reminders */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">Shift Check-In Reminders</div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Get notified on mobile and desktop before your standard shift.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleNotification('checkInReminders')}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                profile.notifications.checkInReminders ? 'bg-[var(--btn-primary-bg)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <div
                className={`bg-[var(--bg-surface)] w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  profile.notifications.checkInReminders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Break Alerts */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">Break Limit Notifications</div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Gentle reminder when your current break exceeds 45 minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleNotification('breakAlerts')}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                profile.notifications.breakAlerts ? 'bg-[var(--btn-primary-bg)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <div
                className={`bg-[var(--bg-surface)] w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  profile.notifications.breakAlerts ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Weekly Reports */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">Weekly Productivity Digest</div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Summary of total hours worked, tasks completed, and attendance metrics every Monday.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleNotification('weeklyReports')}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                profile.notifications.weeklyReports ? 'bg-[var(--btn-primary-bg)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <div
                className={`bg-[var(--bg-surface)] w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  profile.notifications.weeklyReports ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── Basic Account & Shift Preferences Card ── */}
      <section className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[var(--border-subtle)]">
          <Clock size={18} className="text-[var(--text-secondary)]" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Shift & Regional Preferences</h3>
        </div>

        <div className="flex flex-col divide-y divide-[var(--border-subtle)] text-xs">
          {/* Schedule */}
          <div className="py-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <strong className="text-[var(--text-primary)] block">Default Work Schedule</strong>
              <span className="text-[var(--text-secondary)] text-[11px]">
                Standard working window configured for attendance and alerts.
              </span>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-bold border border-[var(--border-subtle)]">
              {profile.workSchedule}
            </span>
          </div>

          {/* Timezone */}
          <div className="py-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2">
            <div>
              <strong className="text-[var(--text-primary)] block">Local Timezone</strong>
              <span className="text-[var(--text-secondary)] text-[11px]">
                All check-in, check-out and meeting timestamps render in this timezone.
              </span>
            </div>
            <select
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                updateProfile({ timezone: e.target.value });
              }}
              className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] font-medium focus:outline-none focus:border-[var(--border-strong)]"
            >
              <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST • UTC+5:30)</option>
              <option value="Africa/Lagos (WAT)">Africa/Lagos (WAT • UTC+1:00)</option>
              <option value="America/New_York (EST)">America/New_York (EST • UTC-5:00)</option>
              <option value="Europe/London (GMT)">Europe/London (GMT • UTC+0:00)</option>
              <option value="Asia/Dubai (GST)">Asia/Dubai (GST • UTC+4:00)</option>
            </select>
          </div>

          {/* UI Theme */}
          <div className="py-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <strong className="text-[var(--text-primary)] block">Appearance & Theme</strong>
              <span className="text-[var(--text-secondary)] text-[11px]">
                Transacty Crew Design System (Obsidian Brown & Ivory Dust).
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
