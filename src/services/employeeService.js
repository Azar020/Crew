// ─── Crew Employee Management Service ──────────────────────────────────────────
import api from './api';
import { formatTimeInTz } from '../utils/dateUtils';

/**
 * Normalizes an employee record strictly from backend database data
 */
export function normalizeEmployee(user) {
  if (!user) return null;
  const name = user.name || 'Employee';
  const nameParts = name.trim().split(/\s+/);
  const firstName = user.firstName || nameParts[0] || 'Employee';
  const lastName = user.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '—');

  const empId =
    user.employeeId ||
    user.employeeCode ||
    (user.role === 'admin' ? 'ADM-001' : user.id ? `EMP-${user.id.slice(0, 6).toUpperCase()}` : '—');

  return {
    ...user,
    id: user.id,
    name,
    firstName,
    lastName,
    nickname: user.nickname || firstName,
    gender: user.gender || 'Not specified',
    phone: user.phoneNumber || user.phone || '—',
    phoneNumber: user.phoneNumber || user.phone || '—',
    mobileNumber: user.mobileNumber || user.phoneNumber || user.phone || '—',
    timezone: user.timezone || 'Asia/Kolkata',
    workLocation: user.workLocation || (user.role === 'admin' ? 'Executive HQ' : 'Engineering Bay'),
    workHours: '09:00 AM — 06:00 PM (IST • UTC+5:30)',
    residentAddress: user.address || user.residentAddress || '—',
    permanentAddress: user.address || user.permanentAddress || '—',
    joiningDate: user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '—',
    department: user.department || '—',
    position: user.designation || (user.role === 'admin' ? 'System Administrator' : 'Software Engineer'),
    status: user.isActive !== undefined ? (user.isActive ? 'active' : 'inactive') : user.status || 'active',
    role: user.role || 'employee',
    employeeId: empId,
    todayAttendance: user.isActive === false ? 'offline' : 'working',
  };
}

/**
 * Fetch all employees from backend database (Admin only)
 * @returns {Promise<{success: boolean, data: Array, source: string}>}
 */
export async function fetchEmployees() {
  try {
    const res = await api.get('/employees');
    const employees = res.data?.employees || res.data || [];
    if (Array.isArray(employees)) {
      return {
        success: true,
        data: employees.map(normalizeEmployee),
        source: 'backend',
      };
    }
  } catch (err) {
    console.warn('Failed to fetch employees from backend:', err);
  }

  return {
    success: true,
    data: [],
    source: 'empty',
  };
}

/**
 * Fetch single employee by ID from backend database
 */
export async function fetchEmployeeById(idOrEmpId) {
  try {
    const endpoint = idOrEmpId === 'me' ? '/employees/me' : `/employees/${idOrEmpId}`;
    const res = await api.get(endpoint);
    const emp = res.data?.employee || res.data;
    if (emp) {
      return {
        success: true,
        data: normalizeEmployee(emp),
      };
    }
  } catch (err) {
    console.warn(`Failed to fetch employee ${idOrEmpId}:`, err);
  }

  return {
    success: false,
    data: null,
  };
}

/**
 * Fetch real employee attendance history with breaks from PostgreSQL
 */
export async function fetchEmployeeAttendance(employeeId) {
  try {
    const res = await api.get(`/attendance?employeeId=${employeeId}`);
    const list = res.data?.attendance || [];
    if (Array.isArray(list)) {
      const logs = await Promise.all(
        list.map(async (item) => {
          const inDate = new Date(item.checkedInAt);
          const outDate = item.checkedOutAt ? new Date(item.checkedOutAt) : null;

          let breaks = [];
          let totalBreakSeconds = 0;
          let breakCount = 0;

          try {
            const breakRes = await api.get(`/attendance/${item.id}/breaks`);
            const rawBreaks = breakRes.data?.breaks || [];
            totalBreakSeconds = breakRes.data?.totalBreakDurationSeconds || 0;
            breakCount = rawBreaks.length;

            breaks = rawBreaks.map((b, idx) => {
              const start = new Date(b.startedAt);
              const end = b.endedAt ? new Date(b.endedAt) : null;
              const durSecs = b.durationSeconds != null
                ? b.durationSeconds
                : end
                ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
                : null;

              let durLabel = 'Active';
              if (durSecs != null) {
                const mins = Math.round(durSecs / 60);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                durLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
              }

              return {
                id: b.id,
                breakNumber: idx + 1,
                startedAt: b.startedAt,
                endedAt: b.endedAt,
                startTime: formatTimeInTz(start, 'Asia/Kolkata'),
                endTime: end ? formatTimeInTz(end, 'Asia/Kolkata') : 'In progress',
                duration: durLabel,
                durationSeconds: durSecs,
              };
            });
          } catch {
            // breaks fetch fallback
          }

          // Format total break duration
          let totalBreakLabel = '—';
          if (totalBreakSeconds > 0) {
            const totalMins = Math.round(totalBreakSeconds / 60);
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;
            totalBreakLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
          } else if (breakCount > 0) {
            totalBreakLabel = '0m';
          }

          // Calculate net working hours: (checkout - checkin) - total break duration
          let netHours = 'In progress';
          let status = 'working';
          if (outDate) {
            const grossMs = Math.max(0, outDate.getTime() - inDate.getTime());
            const netMs = Math.max(0, grossMs - totalBreakSeconds * 1000);
            const netHoursNum = netMs / 3600000;
            netHours = `${netHoursNum.toFixed(1)}h`;
            if (netHoursNum >= 8) status = 'present';
            else if (netHoursNum >= 4) status = 'half_day';
            else status = 'absent';
          }

          return {
            id: item.id,
            date: inDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: 'Asia/Kolkata',
            }),
            isoDate: item.workDate,
            checkIn: formatTimeInTz(inDate, 'Asia/Kolkata'),
            checkOut: outDate ? formatTimeInTz(outDate, 'Asia/Kolkata') : '—',
            breakCount,
            totalBreakDuration: totalBreakLabel,
            totalBreakSeconds,
            netHours,
            status,
            breaks,
          };
        })
      );

      return {
        success: true,
        data: logs,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch employee attendance:', err);
  }

  return {
    success: true,
    data: [],
  };
}

/**
 * Fetch real employee leave requests from PostgreSQL
 */
export async function fetchEmployeeLeaves(employeeId) {
  try {
    const res = await api.get(`/leave-requests?employeeId=${employeeId}&scope=all`);
    const list = res.data?.leaveRequests || [];
    if (Array.isArray(list)) {
      const leaves = list.map((l) => ({
        id: l.id,
        leaveType: l.leaveType ? l.leaveType.charAt(0).toUpperCase() + l.leaveType.slice(1) : 'Casual',
        startDate: l.startDate,
        endDate: l.endDate,
        reason: l.reason || 'Personal time-off',
        requestDate: l.createdAt ? l.createdAt.split('T')[0] : l.startDate,
        status: l.status,
      }));

      return {
        success: true,
        data: leaves,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch employee leaves:', err);
  }

  return {
    success: true,
    data: [],
  };
}

/**
 * Fetch real employee daily updates / tasks from PostgreSQL
 */
export async function fetchEmployeeDailyUpdates(employeeId) {
  try {
    const res = await api.get(`/daily-updates?employeeId=${employeeId}`);
    const list = res.data?.dailyUpdates || [];
    if (Array.isArray(list)) {
      const updates = list.map((d) => ({
        id: d.id,
        updateDate: d.workDate,
        description: d.content,
        submittedDate: formatTimeInTz(d.createdAt, 'Asia/Kolkata'),
        lastUpdatedDate: formatTimeInTz(d.updatedAt, 'Asia/Kolkata'),
        project: 'Work Log',
      }));

      return {
        success: true,
        data: updates,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch employee daily updates:', err);
  }

  return {
    success: true,
    data: [],
  };
}
