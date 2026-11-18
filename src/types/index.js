// ─── Domain Constants and Enums ──────────────────────────────────────────────

export const ROLES = {
  EMPLOYEE: 'employee',
  ADMIN: 'admin',
};

export const PAGES = [
  'Dashboard',
  'Attendance',
  'Request Leave',
  'My Tasks',
  'Reports',
  'Announcements',
  'Settings',
  'Team',
];

export const ATTENDANCE_STATUS = {
  NOT_STARTED: 'not_started',
  WORKING: 'working',
  BREAK: 'break',
  CHECKED_OUT: 'checked_out',
};

export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

export const TASK_PRIORITIES = ['High', 'Medium', 'Low'];

export const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Unpaid', 'Other'];

export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export default {
  ROLES,
  PAGES,
  ATTENDANCE_STATUS,
  TASK_STATUS,
  TASK_PRIORITIES,
  LEAVE_TYPES,
  LEAVE_STATUS,
};
