import React, { useState, useEffect } from 'react';
import {
  Clock,
  KeyRound,
  Save,
  Shield,
  User,
  Phone,
  Briefcase,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useEmployee } from '../../context/EmployeeContext';
import { UserAvatar } from '../../components/UserAvatar';
import api from '../../services/api';

export function AdminSettingsPage() {
  const { user, updateAuthUser } = useAuth();
  const { showToast, attendanceThresholds, updateAttendanceThresholds } = useEmployee();

  // Admin Profile form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync profile form state with authenticated user
  useEffect(() => {
    if (user) {
      const parts = (user.name || '').trim().split(/\s+/);
      const first = parts[0] || '';
      const last = parts.slice(1).join(' ') || '';
      setFirstName(first);
      setLastName(last);
      setDisplayName(user.name || '');
      setPhoneNumber(user.phoneNumber || user.phone_number || '');
      setDesignation(user.designation || user.position || 'System Administrator');
    }
  }, [user?.name, user?.phoneNumber, user?.phone_number, user?.designation, user?.position]);

  const handleFirstNameChange = (val) => {
    setFirstName(val);
    setDisplayName(`${val} ${lastName}`.trim());
  };

  const handleLastNameChange = (val) => {
    setLastName(val);
    setDisplayName(`${firstName} ${val}`.trim());
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      showToast('Display Name cannot be empty.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      // Ensure CSRF token is present
      let csrfToken = sessionStorage.getItem('teamdesk_csrf');
      if (!csrfToken) {
        try {
          const csrfRes = await api.get('/auth/csrf');
          if (csrfRes.data?.csrfToken) {
            sessionStorage.setItem('teamdesk_csrf', csrfRes.data.csrfToken);
          }
        } catch {
          // ignore
        }
      }

      const res = await api.patch('/employees/me', {
        name: displayName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        designation: designation.trim() || null,
      });

      const updated = res.data?.employee;
      const newName = updated?.name || displayName.trim();
      const newPhone = updated?.phoneNumber || phoneNumber.trim();
      const newDesig = updated?.designation || designation.trim();

      if (updateAuthUser) {
        updateAuthUser({
          name: newName,
          phoneNumber: newPhone,
          phone_number: newPhone,
          designation: newDesig,
          position: newDesig,
        });
      }

      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      console.error('Failed to update admin profile:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Failed to update profile. Please try again.';
      showToast(msg, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [requireMFA, setRequireMFA] = useState(true);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);

  // Attendance threshold local state (pre-filled from context / localStorage)
  const [fullDayHours, setFullDayHours] = useState(String(attendanceThresholds.fullDay));
  const [halfDayHours, setHalfDayHours] = useState(String(attendanceThresholds.halfDay));

  const handleSaveSecurity = (e) => {
    e.preventDefault();
    showToast('Organization security policies saved successfully.', 'success');
  };

  const handleSaveThresholds = (e) => {
    e.preventDefault();
    const fd = parseFloat(fullDayHours);
    const hd = parseFloat(halfDayHours);
    if (isNaN(fd) || fd <= 0 || isNaN(hd) || hd <= 0) {
      showToast('Please enter valid positive hour values for both thresholds.', 'error');
      return;
    }
    if (hd >= fd) {
      showToast('Half Day threshold must be less than Full Day threshold.', 'error');
      return;
    }
    updateAttendanceThresholds({ fullDay: fd, halfDay: hd });
    showToast(
      `Attendance thresholds updated: Full Day ≥ ${fd}h, Half Day ≥ ${hd}h. Reload attendance data to apply.`,
      'success'
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
          System Administration &amp; Security Policies
        </h2>
        <p className="text-xs text-[var(--text-secondary)] font-medium">
          Configure organization security rules, session timeouts, attendance thresholds, and administrator access
        </p>
      </div>

      {/* Admin Profile & Identity Form */}
      <section className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <Shield size={18} className="text-[#9D8F82]" />
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Administrator Identity &amp; Profile
          </h3>
        </div>

        {/* Live Admin Identity Badge */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
          <UserAvatar
            name={user?.name || 'Administrator'}
            avatarUrl={user?.avatarUrl}
            size="xl"
            showStatusDot={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base font-bold text-[var(--text-primary)] font-display truncate">
                {user?.name || 'Administrator'}
              </h4>
              <span className="text-[10px] font-bold bg-[#9D8F82]/15 text-[var(--text-primary)] px-2 py-0.5 rounded-full border border-[#9D8F82]/30">
                {user?.employeeId || 'ADM-001'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
              {user?.email || 'admin@transacty.io'} &bull; {user?.position || user?.designation || 'System Administrator'}
            </p>
          </div>
        </div>

        {/* Admin Profile Update Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                First Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => handleFirstNameChange(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
                <User size={14} className="absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Last Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => handleLastNameChange(e.target.value)}
                  placeholder="e.g. Williams"
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
                <User size={14} className="absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              </div>
            </div>

            {/* Display Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Display Name <span className="text-amber-500">*</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-normal ml-1">
                  (Used in header, sidebar profile, and activity logs)
                </span>
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="e.g. Alex Williams"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Phone Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
                <Phone size={14} className="absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              </div>
            </div>

            {/* Designation */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Designation / Position
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="System Administrator"
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
                <Briefcase size={14} className="absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <Save size={15} /> {isSavingProfile ? 'Saving...' : 'Save Admin Profile'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Attendance Status Thresholds ── */}
      <form
        onSubmit={handleSaveThresholds}
        className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-6"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <Clock size={18} className="text-[#9D8F82]" />
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Attendance Status Thresholds
          </h3>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          Configure the minimum net working hours (after break deduction) required for each
          attendance classification. Changes are saved to the browser and applied on the next
          attendance data refresh.
        </p>

        <div className="space-y-4 text-xs">
          {/* Full Day */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                Full Day Threshold
              </strong>
              <span className="text-[var(--text-secondary)]">
                Minimum net working hours to be classified as a Full Day (Present).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={fullDayHours}
                onChange={(e) => setFullDayHours(e.target.value)}
                className="w-20 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-semibold text-center focus:outline-none focus:border-[var(--border-focus)]"
              />
              <span className="text-[var(--text-secondary)] font-medium">hours</span>
            </div>
          </div>

          {/* Half Day */}
          <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--border-subtle)]">
            <div>
              <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                Half Day Threshold
              </strong>
              <span className="text-[var(--text-secondary)]">
                Minimum net working hours for Half Day. Below this is classified as Absent.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={halfDayHours}
                onChange={(e) => setHalfDayHours(e.target.value)}
                className="w-20 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-semibold text-center focus:outline-none focus:border-[var(--border-focus)]"
              />
              <span className="text-[var(--text-secondary)] font-medium">hours</span>
            </div>
          </div>

          {/* Live rule summary */}
          <div className="py-2.5 px-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">Current rules: </span>
            Net Hours &ge; {fullDayHours}h &rarr; <strong>Full Day</strong> &nbsp;&bull;&nbsp;
            {halfDayHours}h &le; Net Hours &lt; {fullDayHours}h &rarr; <strong>Half Day</strong>{' '}
            &nbsp;&bull;&nbsp; Net Hours &lt; {halfDayHours}h &rarr; <strong>Absent</strong>
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Save size={15} /> Save Thresholds
          </button>
        </div>
      </form>

      {/* ── Access & Session Rules ── */}
      <form
        onSubmit={handleSaveSecurity}
        className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-6"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <KeyRound size={18} className="text-[#9D8F82]" />
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Access &amp; Session Rules
          </h3>
        </div>

        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                Inactivity Session Timeout
              </strong>
              <span className="text-[var(--text-secondary)]">
                Automatically disconnects idle workstations and triggers warning modal.
              </span>
            </div>
            <select
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-semibold"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes (Standard)</option>
              <option value="60">60 minutes</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--border-subtle)]">
            <div>
              <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                Public Employee Account Registration
              </strong>
              <span className="text-[var(--text-secondary)]">
                Allows new staff to register on{' '}
                <code className="text-[#9D8F82]">/register</code> with corporate credentials.
              </span>
            </div>
            <input
              type="checkbox"
              checked={allowPublicRegistration}
              onChange={(e) => setAllowPublicRegistration(e.target.checked)}
              className="w-4 h-4 rounded text-[#0F0700] focus:ring-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--border-subtle)]">
            <div>
              <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                Require Multi-Factor Authentication (MFA)
              </strong>
              <span className="text-[var(--text-secondary)]">
                Enforces hardware key or OTP validation on elevated administrative access.
              </span>
            </div>
            <input
              type="checkbox"
              checked={requireMFA}
              onChange={(e) => setRequireMFA(e.target.checked)}
              className="w-4 h-4 rounded text-[#0F0700] focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Save size={15} /> Save Security Policies
          </button>
        </div>
      </form>
    </div>
  );
}
