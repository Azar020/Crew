import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';
import { formatTimeInTz } from '../utils/dateUtils';

const EmployeeContext = createContext(undefined);

function calculateWorkingDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return isNaN(diffDays) ? 1 : diffDays;
}

export const EmployeeProvider = ({ children }) => {
  const { user } = useAuth();

  // ── Attendance & Breaks State ───────────────────────────────────────────────
  const [attendance, setAttendance] = useState('not_started'); // 'not_started' | 'working' | 'break' | 'checked_out'
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [currentAttendanceId, setCurrentAttendanceId] = useState(null);
  const [breaks, setBreaks] = useState([]);
  const [currentBreak, setCurrentBreak] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  // ── Tasks & Daily Updates State ─────────────────────────────────────────────
  const [tasks, setTasks] = useState([]);

  // ── Leave Requests State ───────────────────────────────────────────────────
  const [leaveRequests, setLeaveRequests] = useState([]);

  // ── Announcements & Meetings State ──────────────────────────────────────────
  const [announcements, setAnnouncements] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [holidays, setHolidays] = useState([]);

  // ── Profile State ───────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(() => ({
    name: user?.name || '',
    employeeId: user?.employeeId || '',
    email: user?.email || '',
    department: user?.department || '',
    position: user?.designation || (user?.role === 'admin' ? 'System Administrator' : 'Software Engineer'),
    avatarUrl: null,
    timezone: user?.timezone || 'Asia/Kolkata',
    role: user?.role || 'employee',
    notifications: {
      email: true,
      checkInReminders: true,
      breakAlerts: true,
      weeklyReports: false,
    },
  }));

  // ── Attendance Thresholds (Admin-configurable, persisted in localStorage) ───
  const [attendanceThresholds, setAttendanceThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem('crew_attendance_thresholds');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { fullDay: 8.0, halfDay: 4.0 }; // defaults
  });

  const updateAttendanceThresholds = useCallback((thresholds) => {
    const updated = {
      fullDay: parseFloat(thresholds.fullDay) || 8.0,
      halfDay: parseFloat(thresholds.halfDay) || 4.0,
    };
    setAttendanceThresholds(updated);
    try { localStorage.setItem('crew_attendance_thresholds', JSON.stringify(updated)); } catch { /* ignore */ }
  }, []);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Update profile whenever user identity changes
  useEffect(() => {
    if (user) {
      setProfile((prev) => ({
        ...prev,
        name: user.name || prev.name,
        employeeId: user.employeeId || prev.employeeId,
        email: user.email || prev.email,
        department: user.department || prev.department,
        position: user.designation || prev.position,
        timezone: user.timezone || 'Asia/Kolkata',
        role: user.role || prev.role,
        joiningDate: user.createdAt
          ? new Date(user.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
          : '—',
        workSchedule: '09:00 AM – 06:00 PM (IST)',
      }));
    }
  }, [user]);

  // ── 1. Fetch Attendance Status & Active Breaks ───────────────────────────────
  const fetchAttendanceStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/attendance/status');
      const data = res.data;

      if (data?.state === 'checked_in' && data.openSession) {
        const session = data.openSession;
        setCurrentAttendanceId(session.id);
        setCheckIn(new Date(session.checkedInAt));
        setCheckOut(null);

        // Fetch breaks for this active attendance session
        try {
          const breakRes = await api.get(`/attendance/${session.id}/breaks`);
          const breakData = breakRes.data;

          if (breakData?.breaks) {
            const mappedBreaks = breakData.breaks.map((b) => ({
              id: b.id,
              startTime: new Date(b.startedAt),
              endTime: b.endedAt ? new Date(b.endedAt) : null,
              durationMinutes: b.durationSeconds
                ? Math.round(b.durationSeconds / 60)
                : b.endedAt
                  ? Math.round((new Date(b.endedAt) - new Date(b.startedAt)) / 60000)
                  : 0,
            }));
            setBreaks(mappedBreaks);
          }

          if (breakData?.activeBreak) {
            setCurrentBreak({
              id: breakData.activeBreak.id,
              startTime: new Date(breakData.activeBreak.startedAt),
              endTime: null,
            });
            setAttendance('break');
          } else {
            setCurrentBreak(null);
            setAttendance('working');
          }
        } catch {
          // If break fetch fails, default to working
          setAttendance('working');
        }
      } else if (data?.state === 'checked_out' && data.todayCompletedRecord) {
        const record = data.todayCompletedRecord;
        setCurrentAttendanceId(record.id);
        setCheckIn(new Date(record.checkedInAt));
        setCheckOut(new Date(record.checkedOutAt));
        setAttendance('checked_out');
        setCurrentBreak(null);

        // Fetch completed breaks
        try {
          const breakRes = await api.get(`/attendance/${record.id}/breaks`);
          if (breakRes.data?.breaks) {
            setBreaks(
              breakRes.data.breaks.map((b) => ({
                id: b.id,
                startTime: new Date(b.startedAt),
                endTime: b.endedAt ? new Date(b.endedAt) : null,
                // Use backend-computed durationSeconds when available; otherwise derive from timestamps
                durationMinutes: b.durationSeconds != null
                  ? Math.round(b.durationSeconds / 60)
                  : b.endedAt
                  ? Math.round((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 60000)
                  : 0,
              }))
            );
          }
        } catch {
          // non-blocking
        }
      } else {
        setAttendance('not_started');
        setCheckIn(null);
        setCheckOut(null);
        setCurrentAttendanceId(null);
        setCurrentBreak(null);
        setBreaks([]);
      }
    } catch (err) {
      console.warn('Attendance status check error:', err);
    }
  }, [user]);

  // ── 2. Fetch Attendance History ─────────────────────────────────────────────
  const fetchAttendanceHistory = useCallback(async () => {
    if (!user) return;
    try {
      const endpoint = user.role === 'admin' ? '/attendance' : '/attendance/me';
      const res = await api.get(endpoint);
      const list = res.data?.attendance || [];

      // Helper: format break duration label from seconds
      const fmtBreakDuration = (totalSecs) => {
        if (!totalSecs || totalSecs <= 0) return '—';
        const totalMins = Math.round(totalSecs / 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      };

      // Classify status using configurable thresholds
      const { fullDay, halfDay } = attendanceThresholds;
      const calcStatus = (outDate, netHoursNum) => {
        if (!outDate) return 'working';          // shift still open → In Progress
        if (netHoursNum >= fullDay) return 'present';    // Full Day
        if (netHoursNum >= halfDay) return 'half_day';   // Half Day
        return 'absent';                                  // Below threshold
      };

      // Fetch breaks for every session in parallel, then compute fields
      const formatted = await Promise.all(
        list.map(async (item) => {
          const inDate = new Date(item.checkedInAt);
          const outDate = item.checkedOutAt ? new Date(item.checkedOutAt) : null;

          const dateStr = inDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Kolkata',
          });

          // Base record fields
          const base = {
            id: item.id,
            employeeId: item.employeeId,
            date: dateStr,
            workDate: item.workDate,
            isoDate: item.workDate,
            checkIn: formatTimeInTz(inDate, 'Asia/Kolkata'),
            checkOut: outDate ? formatTimeInTz(outDate, 'Asia/Kolkata') : '—',
            checkedInAtRaw: item.checkedInAt,
            checkedOutAtRaw: item.checkedOutAt || null,
            isDemo: false,
          };

          try {
            const breakRes = await api.get(`/attendance/${item.id}/breaks`);
            const breakList = breakRes.data?.breaks || [];
            const activeBreak = breakRes.data?.activeBreak || null;
            // Backend returns pre-computed total for completed breaks only
            const totalBreakSecs = breakRes.data?.totalBreakDurationSeconds || 0;

            // Count: all recorded breaks (completed + active)
            const breakCount = breakList.length;

            // Net hours: (checkout − checkin) − completed break seconds
            let netHoursNumeric = 0;
            let netHoursLabel = 'In progress';
            if (outDate) {
              const grossMs = outDate.getTime() - inDate.getTime();
              const netMs = Math.max(0, grossMs - totalBreakSecs * 1000);
              netHoursNumeric = netMs / 3600000;
              netHoursLabel = `${netHoursNumeric.toFixed(1)}h`;
            }

            const status = calcStatus(outDate, netHoursNumeric);

            return {
              ...base,
              breakCount,
              breakDuration: fmtBreakDuration(totalBreakSecs),
              activeBreak,
              netHours: netHoursLabel,
              netHoursNumeric,
              status,
            };
          } catch {
            // If per-session break fetch fails, fall back to gross hours
            const grossMs = outDate ? outDate.getTime() - inDate.getTime() : 0;
            const netHoursNumeric = outDate ? Math.max(0, grossMs / 3600000) : 0;
            return {
              ...base,
              breakCount: 0,
              breakDuration: '—',
              netHours: outDate ? `${netHoursNumeric.toFixed(1)}h` : 'In progress',
              netHoursNumeric,
              status: calcStatus(outDate, netHoursNumeric),
            };
          }
        })
      );

      setAttendanceHistory(formatted);
    } catch (err) {
      console.warn('Attendance history fetch error:', err);
    }
  }, [user, attendanceThresholds]);

  // ── 3. Fetch Leave Requests ─────────────────────────────────────────────────
  const fetchLeaveRequests = useCallback(async () => {
    if (!user) return;
    try {
      const endpoint = user.role === 'admin' ? '/leave-requests?scope=all' : '/leave-requests?scope=mine';
      const res = await api.get(endpoint);
      const list = res.data?.leaveRequests || [];

      const mapped = list.map((req) => ({
        id: req.id,
        leaveType: req.leaveType
          ? req.leaveType.charAt(0).toUpperCase() + req.leaveType.slice(1)
          : 'Casual',
        startDate: req.startDate,
        endDate: req.endDate,
        workingDays: calculateWorkingDays(req.startDate, req.endDate),
        reason: req.reason || 'Personal time-off',
        status: req.status || 'pending',
        appliedOn: req.createdAt ? req.createdAt.split('T')[0] : req.startDate,
        reviewedBy: req.reviewedBy ? 'Administrator' : null,
        rejectionReason: req.rejectionReason,
        employee: req.employee || {
          id: req.employeeId,
          name: req.employeeName || 'Employee',
          email: req.employeeEmail || '',
        },
        employeeName: req.employee?.name || req.employeeName || 'Employee',
        employeeId: req.employee?.id || req.employeeId,
      }));

      setLeaveRequests(mapped);
    } catch (err) {
      console.warn('Leave requests fetch error:', err);
    }
  }, [user]);

  // ── 4. Fetch Announcements ──────────────────────────────────────────────────
  const fetchAnnouncements = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/announcements');
      const list = res.data?.announcements || [];

      const mapped = list.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.content,
        content: a.content,
        publishedDate: a.publishedAt
          ? formatTimeInTz(a.publishedAt, 'Asia/Kolkata')
          : 'Draft',
        priority: 'Important',
        read: false,
        category: 'Company Update',
        status: a.status,
        audience: 'All Teams',
        createdAt: a.createdAt,
      }));

      setAnnouncements(mapped);
    } catch (err) {
      console.warn('Announcements fetch error:', err);
    }
  }, [user]);

  // ── 5. Fetch Meetings ───────────────────────────────────────────────────────
  const fetchMeetings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/meetings');
      const list = res.data?.meetings || [];

      const mapped = list.map((m) => {
        const platform = m.meetingLink?.includes('zoom')
          ? 'Zoom'
          : m.meetingLink?.includes('teams')
            ? 'Microsoft Teams'
            : 'Google Meet';

        return {
          id: m.id,
          title: m.title,
          description: m.description || '',
          date: m.meetingDate,
          time: m.startTime,
          duration: `${m.startTime} — ${m.endTime}`,
          platform,
          link: m.meetingLink || '',
          meetingLink: m.meetingLink || '',
          location: m.location || '',
          status: m.status,
        };
      });

      setMeetings(mapped);
    } catch (err) {
      console.warn('Meetings fetch error:', err);
    }
  }, [user]);

  // ── 6. Fetch Daily Updates (Tasks) ──────────────────────────────────────────
  const fetchDailyUpdates = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/daily-updates');
      const list = res.data?.dailyUpdates || [];

      const mapped = list.map((d) => ({
        id: d.id,
        title: d.content.slice(0, 50),
        description: d.content,
        project: 'Work Log',
        priority: 'Medium',
        due: d.workDate,
        date: d.workDate,
        status: 'completed',
      }));

      setTasks(mapped);
    } catch (err) {
      console.warn('Daily updates fetch error:', err);
    }
  }, [user]);

  // ── 7. Fetch Holidays ───────────────────────────────────────────────────────
  const fetchHolidays = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/holidays');
      const list = res.data?.holidays || [];
      setHolidays(list);
    } catch (err) {
      console.warn('Holidays fetch error:', err);
    }
  }, [user]);

  // Load all initial data on mount and whenever user logs in
  useEffect(() => {
    if (user) {
      fetchAttendanceStatus();
      fetchAttendanceHistory();
      fetchLeaveRequests();
      fetchAnnouncements();
      fetchMeetings();
      fetchDailyUpdates();
      fetchHolidays();
    }
  }, [
    user,
    fetchAttendanceStatus,
    fetchAttendanceHistory,
    fetchLeaveRequests,
    fetchAnnouncements,
    fetchMeetings,
    fetchDailyUpdates,
    fetchHolidays,
  ]);

  // ── Calculated Break Minutes ────────────────────────────────────────────────
  const breakMinutes = useMemo(() => {
    const completedBreaksMinutes = breaks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
    const activeBreakMinutes = currentBreak
      ? Math.max(0, Math.round((Date.now() - currentBreak.startTime.getTime()) / 60000))
      : 0;
    return completedBreaksMinutes + activeBreakMinutes;
  }, [breaks, currentBreak]);

  // ── Calculated Live Worked Hours ────────────────────────────────────────────
  const workedHours = useMemo(() => {
    if (!checkIn) return 0;
    const endTime = checkOut ? checkOut.getTime() : Date.now();
    const totalElapsedHours = (endTime - checkIn.getTime()) / 3600000;
    const netHours = totalElapsedHours - breakMinutes / 60;
    return Math.max(0, netHours);
  }, [checkIn, checkOut, breakMinutes]);

  // ── Attendance Handlers ─────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (attendance === 'working' || attendance === 'break') {
      showToast('You are already checked in for today!', 'error');
      return { success: false, message: 'Already checked in' };
    }
    if (attendance === 'checked_out') {
      showToast('You have already checked out for today. Duplicate check-in is prevented.', 'error');
      return { success: false, message: 'Already checked out today' };
    }

    try {
      const res = await api.post('/attendance/check-in');
      const att = res.data?.attendance;
      if (att) {
        const now = new Date(att.checkedInAt);
        setCurrentAttendanceId(att.id);
        setCheckIn(now);
        setCheckOut(null);
        setBreaks([]);
        setCurrentBreak(null);
        setAttendance('working');
        showToast(
          `Checked in successfully at ${formatTimeInTz(now, 'Asia/Kolkata')}. Have a productive day!`,
          'success'
        );
        fetchAttendanceStatus();
        fetchAttendanceHistory();
        return { success: true };
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Check-in failed. Please try again.';
      showToast(message, 'error');
      return { success: false, message };
    }
    return { success: false, message: 'Check-in failed' };
  };

  const handleStartBreak = async () => {
    if (attendance !== 'working' || !currentAttendanceId) {
      if (attendance === 'break') {
        showToast('You are already on a break!', 'error');
      } else {
        showToast('Please check in first before taking a break.', 'error');
      }
      return { success: false, message: 'Cannot start break' };
    }

    try {
      const res = await api.post(`/attendance/${currentAttendanceId}/breaks/start`);
      const b = res.data?.break;
      if (b) {
        const start = new Date(b.startedAt);
        setCurrentBreak({ id: b.id, startTime: start, endTime: null });
        setAttendance('break');
        showToast('Break started. Enjoy your rest! Click "End Break" when you return.', 'info');
        return { success: true };
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to start break.';
      showToast(message, 'error');
      return { success: false, message };
    }
    return { success: false, message: 'Failed to start break' };
  };

  const handleEndBreak = async () => {
    if (attendance !== 'break' || !currentBreak || !currentAttendanceId) {
      showToast('You are not currently on an active break.', 'error');
      return { success: false, message: 'Not on break' };
    }

    try {
      const res = await api.post(`/attendance/${currentAttendanceId}/breaks/${currentBreak.id}/end`);
      const b = res.data?.break;
      const durationSec = res.data?.durationSeconds || 0;
      const durationMins = Math.max(1, Math.round(durationSec / 60));

      setBreaks((prev) => [
        ...prev,
        {
          id: b.id,
          startTime: new Date(b.startedAt),
          endTime: new Date(b.endedAt),
          durationMinutes: durationMins,
        },
      ]);
      setCurrentBreak(null);
      setAttendance('working');
      showToast(`Break ended (${durationMins}m). Welcome back!`, 'success');
      fetchAttendanceStatus();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to end break.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const handleCheckOut = async () => {
    if (attendance === 'break') {
      showToast('Cannot check out while currently on break. Please click "End Break" first.', 'error');
      return { success: false, message: 'Cannot check out while on break' };
    }
    if (attendance === 'not_started') {
      showToast('You have not checked in today yet.', 'error');
      return { success: false, message: 'Not checked in' };
    }
    if (attendance === 'checked_out') {
      showToast('You are already checked out for today.', 'error');
      return { success: false, message: 'Already checked out' };
    }

    try {
      const res = await api.post('/attendance/check-out');
      const att = res.data?.attendance;
      const now = att ? new Date(att.checkedOutAt) : new Date();

      setCheckOut(now);
      setAttendance('checked_out');
      setCurrentBreak(null);
      showToast(
        `Checked out at ${formatTimeInTz(now, 'Asia/Kolkata')}. Total worked: ${workedHours.toFixed(1)}h. Great job!`,
        'success'
      );
      fetchAttendanceStatus();
      fetchAttendanceHistory();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Checkout failed. Please try again.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  // ── Leave Handlers ──────────────────────────────────────────────────────────
  const leaveBalances = useMemo(() => {
    const base = {
      annual: { total: 15, used: 0, remaining: 15 },
      sick: { total: 10, used: 0, remaining: 10 },
      casual: { total: 7, used: 0, remaining: 7 },
      unpaid: { used: 0 },
    };

    for (const req of leaveRequests) {
      if (req.status === 'approved') {
        const key = req.leaveType.toLowerCase();
        if (key in base && key !== 'unpaid') {
          base[key].used += req.workingDays;
          base[key].remaining = Math.max(0, base[key].total - base[key].used);
        } else if (key === 'unpaid') {
          base.unpaid.used += req.workingDays;
        }
      }
    }
    return base;
  }, [leaveRequests]);

  const pendingLeaveDays = useMemo(() => {
    return leaveRequests
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + r.workingDays, 0);
  }, [leaveRequests]);

  const addLeaveRequest = async (data) => {
    if (!data.startDate || !data.endDate) {
      showToast('Please specify both a start date and an end date.', 'error');
      return { success: false, message: 'Dates missing' };
    }
    if (!data.reason?.trim()) {
      showToast('Please provide a reason for your leave request.', 'error');
      return { success: false, message: 'Reason missing' };
    }

    try {
      await api.post('/leave-requests', {
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason.trim(),
        leaveType: (data.leaveType || 'casual').toLowerCase(),
      });

      showToast(
        `Leave request submitted for ${data.startDate} to ${data.endDate}. Pending approval.`,
        'success'
      );
      fetchLeaveRequests();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to submit leave request.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const approveLeaveRequest = async (id) => {
    try {
      await api.patch(`/leave-requests/${id}/approve`);
      showToast('Leave request approved successfully.', 'success');
      fetchLeaveRequests();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to approve request.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const rejectLeaveRequest = async (id, reason = 'Request declined by administrator') => {
    try {
      await api.patch(`/leave-requests/${id}/reject`, { reason });
      showToast('Leave request rejected.', 'info');
      fetchLeaveRequests();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to reject request.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const cancelLeaveRequest = async (id) => {
    setLeaveRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r))
    );
    showToast('Leave request cancelled.', 'info');
    return { success: true };
  };

  const getDateLeaveStatus = (dateStr) => {
    const today = new Date().toISOString().split('T')[0];

    for (const req of leaveRequests) {
      if (req.status === 'cancelled' || req.status === 'rejected') continue;
      if (dateStr >= req.startDate && dateStr <= req.endDate) {
        if (req.status === 'pending') return 'pending';
        if (req.status === 'approved') return dateStr >= today ? 'approved-upcoming' : 'approved-past';
      }
    }
    return null;
  };

  // ── Daily Work Updates Handlers ─────────────────────────────────────────────
  const addTask = async (data) => {
    try {
      const content = `${data.title}${data.description ? ': ' + data.description : ''}`;
      const workDate = data.date || new Date().toISOString().split('T')[0];
      await api.post('/daily-updates', { workDate, content });
      showToast(`Daily work update saved successfully!`, 'success');
      fetchDailyUpdates();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save daily update.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const updateTask = (id, data) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    showToast('Task updated successfully.', 'info');
  };

  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast('Task removed.', 'info');
  };

  // ── Announcements & Meetings Handlers ───────────────────────────────────────
  const createAnnouncement = async (data) => {
    try {
      await api.post('/announcements', {
        title: data.title.trim(),
        content: data.content.trim(),
        status: 'published',
      });
      showToast(`Announcement "${data.title}" published to all employees!`, 'success');
      fetchAnnouncements();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to publish announcement.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const createMeeting = async (data) => {
    try {
      await api.post('/meetings', {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        meetingDate: data.meetingDate,
        startTime: data.startTime,
        endTime: data.endTime,
        timezone: 'Asia/Kolkata',
        location: data.location || null,
        meetingLink: data.meetingLink || null,
      });
      showToast(`Meeting "${data.title}" scheduled successfully!`, 'success');
      fetchMeetings();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to schedule meeting.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const deleteAnnouncement = async (id) => {
    try {
      await api.delete(`/announcements/${id}`);
      showToast('Announcement deleted successfully.', 'success');
      fetchAnnouncements();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete announcement.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const deleteMeeting = async (id) => {
    try {
      await api.delete(`/meetings/${id}`);
      showToast('Scheduled meeting removed successfully.', 'success');
      fetchMeetings();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete meeting.';
      showToast(message, 'error');
      return { success: false, message };
    }
  };

  const toggleAnnouncementRead = (id) => {
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: !a.read } : a))
    );
  };

  const markAllAnnouncementsRead = () => {
    setAnnouncements((prev) => prev.map((a) => ({ ...a, read: true })));
    showToast('All announcements marked as read.', 'success');
  };

  const unreadAnnouncementsCount = useMemo(
    () => announcements.filter((a) => !a.read).length,
    [announcements]
  );

  // ── Profile Updates ─────────────────────────────────────────────────────────
  const updateProfile = async (updated) => {
    try {
      await api.patch('/employees/me', {
        name: updated.name,
        phoneNumber: updated.phone || updated.phoneNumber,
        address: updated.address || updated.residentAddress,
      });
      setProfile((prev) => ({ ...prev, ...updated }));
      showToast('Profile information saved to database.', 'success');
    } catch (err) {
      setProfile((prev) => ({ ...prev, ...updated }));
      showToast('Profile updated.', 'info');
    }
  };

  const updateNotifications = (notifications) => {
    setProfile((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...notifications },
    }));
    showToast('Notification preferences updated.', 'success');
  };

  return (
    <EmployeeContext.Provider
      value={{
        attendance,
        checkIn,
        checkOut,
        currentBreak,
        breaks,
        breakMinutes,
        workedHours,
        attendanceHistory,
        handleCheckIn,
        handleStartBreak,
        handleEndBreak,
        handleCheckOut,
        leaveBalances,
        leaveRequests,
        pendingLeaveDays,
        addLeaveRequest,
        cancelLeaveRequest,
        approveLeaveRequest,
        rejectLeaveRequest,
        getDateLeaveStatus,
        tasks,
        addTask,
        updateTask,
        deleteTask,
        announcements,
        unreadAnnouncementsCount,
        toggleAnnouncementRead,
        markAllAnnouncementsRead,
        createAnnouncement,
        deleteAnnouncement,
        meetings,
        createMeeting,
        deleteMeeting,
        holidays,
        profile,
        updateProfile,
        updateNotifications,
        attendanceThresholds,
        updateAttendanceThresholds,
        toasts,
        showToast,
        removeToast,
        refreshData: () => {
          fetchAttendanceStatus();
          fetchAttendanceHistory();
          fetchLeaveRequests();
          fetchAnnouncements();
          fetchMeetings();
          fetchDailyUpdates();
          fetchHolidays();
        },
      }}
    >
      {children}
    </EmployeeContext.Provider>
  );
};

export const useEmployee = () => {
  const context = useContext(EmployeeContext);
  if (!context) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
};
