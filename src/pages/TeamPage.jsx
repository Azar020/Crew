import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Coffee,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Search,
  Shield,
  User,
  Users,
  X,
} from 'lucide-react';
import api from '../services/api';
import { UserAvatar } from '../components/UserAvatar';
import {
  fetchEmployees,
  fetchEmployeeAttendance,
  fetchEmployeeLeaves,
  fetchEmployeeDailyUpdates,
  normalizeEmployee,
} from '../services/employeeService';
import { useEmployee } from '../context/EmployeeContext';
import { formatTimeInTz } from '../utils/dateUtils';

const PAGE_SIZE = 8;

export function TeamPage() {
  const { profile, showToast } = useEmployee();

  // ── Directory List State ───────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  // ── Selected Employee Detail View State ────────────────────────────────────
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'attendance' | 'leaves' | 'updates'

  // Edit Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    gender: '',
    mobileNumber: '',
    phone: '',
    department: '',
    designation: '',
    workLocation: '',
    workHours: '',
    timezone: '',
    residentAddress: '',
    permanentAddress: '',
  });

  // Expandable row in attendance table for individual break logs
  const [expandedAttendanceId, setExpandedAttendanceId] = useState(null);

  // Detail tab async data
  const [tabLoading, setTabLoading] = useState(false);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [dailyUpdates, setDailyUpdates] = useState([]);

  // Detail tab sub-filters
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [leaveFilter, setLeaveFilter] = useState('');
  const [updateFilter, setUpdateFilter] = useState('');

  const handleOpenEditProfile = () => {
    if (!selectedEmployee) return;
    setEditForm({
      firstName: selectedEmployee.firstName || '',
      lastName: selectedEmployee.lastName === '—' ? '' : (selectedEmployee.lastName || ''),
      nickname: selectedEmployee.nickname || '',
      gender: selectedEmployee.gender === 'Not specified' ? '' : (selectedEmployee.gender || ''),
      mobileNumber: selectedEmployee.mobileNumber === '—' ? '' : (selectedEmployee.mobileNumber || ''),
      phone: selectedEmployee.phone === '—' ? '' : (selectedEmployee.phone || ''),
      department: selectedEmployee.department === '—' ? '' : (selectedEmployee.department || ''),
      designation: selectedEmployee.position || '',
      workLocation: selectedEmployee.workLocation || '',
      workHours: selectedEmployee.workHours || '09:00 AM — 06:00 PM (IST)',
      timezone: selectedEmployee.timezone || 'Asia/Kolkata',
      residentAddress: selectedEmployee.residentAddress === '—' ? '' : (selectedEmployee.residentAddress || ''),
      permanentAddress: selectedEmployee.permanentAddress === '—' ? '' : (selectedEmployee.permanentAddress || ''),
    });
    setIsEditingProfile(true);
  };

  const handleSaveEmployeeProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const fullName = `${editForm.firstName.trim()} ${editForm.lastName.trim()}`.trim() || selectedEmployee.name;
      const payload = {
        name: fullName,
        department: editForm.department?.trim() || null,
        designation: editForm.designation?.trim() || null,
        phoneNumber: editForm.phone?.trim() || editForm.mobileNumber?.trim() || null,
        address: editForm.residentAddress?.trim() || editForm.permanentAddress?.trim() || null,
        timezone: editForm.timezone || selectedEmployee.timezone || 'Asia/Kolkata',
      };
      const empUuid = selectedEmployee.id || selectedEmployee.employeeId;
      const res = await api.patch(`/employees/${empUuid}`, payload);
      const updated = res.data?.employee;
      const merged = normalizeEmployee({
        ...selectedEmployee,
        ...updated,
        ...editForm,
        name: fullName,
      });
      setSelectedEmployee(merged);
      setEmployees((prev) => prev.map((emp) => (emp.id === merged.id ? merged : emp)));
      showToast?.('Employee profile updated successfully in PostgreSQL.', 'success');
      setIsEditingProfile(false);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update employee profile.';
      showToast?.(msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const tabListRef = useRef(null);

  // Load employee directory
  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployees();
      if (res.success && Array.isArray(res.data)) {
        setEmployees(res.data);
      } else {
        setError('Failed to load employee records from backend.');
      }
    } catch (err) {
      setError('An unexpected error occurred while communicating with the service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // Load employee details sub-data when selected
  useEffect(() => {
    if (!selectedEmployee) return;

    let isMounted = true;
    const loadDetailData = async () => {
      setTabLoading(true);
      try {
        const empUuid = selectedEmployee.id || selectedEmployee.employeeId;
        const [attRes, leaveRes, updateRes] = await Promise.all([
          fetchEmployeeAttendance(empUuid),
          fetchEmployeeLeaves(empUuid),
          fetchEmployeeDailyUpdates(empUuid),
        ]);

        if (isMounted) {
          if (attRes.success) setAttendanceLogs(attRes.data);
          if (leaveRes.success) setLeaveRequests(leaveRes.data);
          if (updateRes.success) setDailyUpdates(updateRes.data);
        }
      } catch (err) {
        console.error('Error fetching employee sub-records:', err);
      } finally {
        if (isMounted) setTabLoading(false);
      }
    };

    loadDetailData();
    return () => {
      isMounted = false;
    };
  }, [selectedEmployee]);

  // Derive department options dynamically from active directory
  const departmentOptions = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Search by name, email or employee ID
      if (searchTerm) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = (emp.name || '').toLowerCase().includes(q);
        const matchesEmail = (emp.email || '').toLowerCase().includes(q);
        const matchesId = (emp.employeeId || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesId) return false;
      }

      // Department filter
      if (selectedDept !== 'All' && emp.department !== selectedDept) {
        return false;
      }

      // Role filter
      if (selectedRole !== 'All' && emp.role !== selectedRole.toLowerCase()) {
        return false;
      }

      // Account status filter
      if (selectedStatus !== 'All' && emp.status !== selectedStatus.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [employees, searchTerm, selectedDept, selectedRole, selectedStatus]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredEmployees.length / PAGE_SIZE) || 1;
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDept, selectedRole, selectedStatus]);

  // Keyboard navigation for accessible tabs (Left/Right arrows)
  const handleTabKeyDown = (e) => {
    const tabs = ['profile', 'attendance', 'leaves', 'updates'];
    const currentIndex = tabs.indexOf(activeTab);

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextTab = tabs[(currentIndex + 1) % tabs.length];
      setActiveTab(nextTab);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      setActiveTab(prevTab);
    }
  };

  // ── Render: Employee Details View ──────────────────────────────────────────
  if (selectedEmployee) {
    const isOnline = selectedEmployee.todayAttendance === 'working';
    const isOnBreak = selectedEmployee.todayAttendance === 'break';
    const isCheckedOut = selectedEmployee.todayAttendance === 'checked_out';
    const isActiveAccount = selectedEmployee.status === 'active';

    // Filtered attendance records in Tab 2
    const filteredAttendance = attendanceLogs.filter((log) => {
      if (!attendanceDateFilter) return true;
      return (log.date || '').toLowerCase().includes(attendanceDateFilter.toLowerCase());
    });

    // Filtered leaves in Tab 3
    const filteredLeaves = leaveRequests.filter((leave) => {
      if (!leaveFilter) return true;
      const q = leaveFilter.toLowerCase();
      return (
        (leave.reason || '').toLowerCase().includes(q) ||
        (leave.startDate || '').includes(q) ||
        (leave.leaveType || '').toLowerCase().includes(q)
      );
    });

    // Filtered and grouped daily updates in Tab 4
    const filteredUpdates = dailyUpdates.filter((up) => {
      if (!updateFilter) return true;
      const q = updateFilter.toLowerCase();
      return (
        (up.description || '').toLowerCase().includes(q) ||
        (up.updateDate || '').includes(q) ||
        (up.project || '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="flex flex-col gap-6 select-none animate-fadeIn">
        {/* Back navigation bar */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setSelectedEmployee(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition py-1.5 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-sm"
          >
            <ArrowLeft size={14} />
            <span>Back to People & Directory</span>
          </button>

          <span className="text-[11px] font-mono text-[var(--text-secondary)]">
            Viewing Record: <strong className="text-[var(--text-primary)]">{selectedEmployee.employeeId}</strong>
          </span>
        </div>

        {/* Employee Summary Banner */}
        <div className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4">
              <UserAvatar
                name={selectedEmployee.name}
                avatarUrl={selectedEmployee.avatarUrl}
                status={selectedEmployee.todayAttendance}
                size="xl"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] font-display tracking-tight truncate">
                    {selectedEmployee.name}
                  </h2>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                    {selectedEmployee.employeeId}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      selectedEmployee.role === 'admin'
                        ? 'bg-[var(--border-strong)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                        : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {selectedEmployee.role}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-1 flex-wrap">
                  <span className="font-medium text-[var(--text-primary)]">{selectedEmployee.position}</span>
                  <span>•</span>
                  <span>{selectedEmployee.department}</span>
                  <span>•</span>
                  <span className="truncate">{selectedEmployee.email}</span>
                </div>
              </div>
            </div>

            {/* Quick Status Indicators */}
            <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
              <div className="flex flex-col items-end text-right">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Today's Attendance
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                    isOnline
                      ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/30'
                      : isOnBreak
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      : isCheckedOut
                      ? 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: isOnline
                        ? '#9D8F82'
                        : isOnBreak
                        ? '#F59E0B'
                        : isCheckedOut
                        ? '#566167'
                        : '#EF4444',
                    }}
                  />
                  <span>
                    {isOnline ? 'Online' : isOnBreak ? 'On Break' : isCheckedOut ? 'Checked Out' : 'Offline'}
                  </span>
                </span>
              </div>

              <div className="flex flex-col items-end text-right pl-3 border-l border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Account Status
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    isActiveAccount
                      ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  }`}
                >
                  {isActiveAccount ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Accessible Tabs Header */}
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Employee Details Sections"
            onKeyDown={handleTabKeyDown}
            className="flex items-center gap-2 mt-8 pt-4 border-t border-[var(--border-subtle)] overflow-x-auto no-scrollbar"
          >
            {[
              { id: 'profile', label: '1. Profile Information', icon: User },
              { id: 'attendance', label: '2. Check-In & Check-Out Log', icon: Clock },
              { id: 'leaves', label: '3. Leave Status', icon: Calendar },
              { id: 'updates', label: '4. Daily Updates', icon: FileText },
            ].map(({ id, label, icon: Icon }) => {
              const isSelected = activeTab === id;
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  role="tab"
                  tabIndex={isSelected ? 0 : -1}
                  aria-selected={isSelected}
                  aria-controls={`panel-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-[var(--border-strong)] ${
                    isSelected
                      ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                      : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/40'
                  }`}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab 1: Profile ── */}
        {activeTab === 'profile' && (
          <div
            id="panel-profile"
            role="tabpanel"
            aria-labelledby="tab-profile"
            className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm animate-fadeIn"
          >
            {/* Header with Title & Edit Profile Button */}
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[var(--border-subtle)] flex-wrap gap-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display flex items-center gap-2">
                  <User size={18} className="text-[#9D8F82]" />
                  <span>Employee Profile Information</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Official personnel record synchronized with PostgreSQL
                </p>
              </div>

              <button
                onClick={handleOpenEditProfile}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
              >
                <Edit3 size={14} /> Edit Profile
              </button>
            </div>

            <div className="space-y-6 text-xs">
              {/* 1. Personal Information */}
              <div>
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#9D8F82]">
                    Personal Information
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      First Name
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.firstName || <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Last Name
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.lastName && selectedEmployee.lastName !== '—'
                        ? selectedEmployee.lastName
                        : <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Nickname
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.nickname || <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Gender
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.gender && selectedEmployee.gender !== 'Not specified'
                        ? selectedEmployee.gender
                        : <span className="text-[var(--text-muted)] italic font-normal">Not specified</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Mobile Number
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block font-mono">
                      {selectedEmployee.mobileNumber && selectedEmployee.mobileNumber !== '—'
                        ? selectedEmployee.mobileNumber
                        : selectedEmployee.phone && selectedEmployee.phone !== '—'
                        ? selectedEmployee.phone
                        : <span className="text-[var(--text-muted)] italic font-normal font-sans">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Phone Number
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block font-mono">
                      {selectedEmployee.phone && selectedEmployee.phone !== '—'
                        ? selectedEmployee.phone
                        : <span className="text-[var(--text-muted)] italic font-normal font-sans">Not provided</span>}
                    </span>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Email Address
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block font-mono">
                      {selectedEmployee.email}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Work Information */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#9D8F82]">
                    Work Information
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Employee ID
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.employeeId}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Designation
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.position || <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Department
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.department && selectedEmployee.department !== '—'
                        ? selectedEmployee.department
                        : <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Work Location
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.workLocation || 'Executive Bay'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Working Hours
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.workHours || '09:00 AM — 06:00 PM (IST)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Time Zone
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] mt-1 block">
                      {selectedEmployee.timezone || 'Asia/Kolkata (UTC+5:30)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Address Information */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#9D8F82]">
                    Address Information
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Residential Address
                    </span>
                    <p className="text-xs text-[var(--text-primary)] mt-1 leading-relaxed m-0 font-medium">
                      {selectedEmployee.residentAddress && selectedEmployee.residentAddress !== '—'
                        ? selectedEmployee.residentAddress
                        : <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                      Permanent Address
                    </span>
                    <p className="text-xs text-[var(--text-primary)] mt-1 leading-relaxed m-0 font-medium">
                      {selectedEmployee.permanentAddress && selectedEmployee.permanentAddress !== '—'
                        ? selectedEmployee.permanentAddress
                        : <span className="text-[var(--text-muted)] italic font-normal">Not provided</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 2: Check-In & Check-Out Log ── */}
        {activeTab === 'attendance' && (
          <div
            id="panel-attendance"
            role="tabpanel"
            aria-labelledby="tab-attendance"
            className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm animate-fadeIn"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Attendance &amp; Shift Audit Log
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Complete timestamps rendered in Asia/Kolkata (IST • UTC+5:30) with individual break logs
                </p>
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Filter by date..."
                  value={attendanceDateFilter}
                  onChange={(e) => setAttendanceDateFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] w-48"
                />
              </div>
            </div>

            {filteredAttendance.length === 0 ? (
              <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                <Clock size={28} className="mx-auto mb-2 opacity-40" />
                <p className="font-semibold text-[var(--text-primary)]">No attendance records found</p>
                <p className="mt-1">No check-in or shift sessions match the selected filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="py-3 px-4 min-w-[120px]">Date</th>
                      <th className="py-3 px-4 min-w-[110px]">Check-In</th>
                      <th className="py-3 px-4 min-w-[110px]">Check-Out</th>
                      <th className="py-3 px-4 min-w-[110px]">Break Count</th>
                      <th className="py-3 px-4 min-w-[130px]">Total Break Duration</th>
                      <th className="py-3 px-4 min-w-[130px]">Net Working Hours</th>
                      <th className="py-3 px-4 min-w-[110px]">Status</th>
                      <th className="py-3 px-4 min-w-[110px] text-right">Break Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredAttendance.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-[var(--bg-surface-hover)] transition">
                          <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">{row.date}</td>
                          <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{row.checkIn}</td>
                          <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{row.checkOut}</td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-[11px]">
                              <Coffee size={11} className="text-[#9D8F82]" />
                              <span>{row.breakCount ?? 0}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)] font-semibold">
                            {row.totalBreakDuration || '—'}
                          </td>
                          <td className="py-3 px-4 font-bold text-[var(--text-primary)] font-display">
                            {row.netHours}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                                row.status === 'present'
                                  ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/30'
                                  : row.status === 'working'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  : row.status === 'half_day'
                                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  row.status === 'present'
                                    ? 'bg-[#9D8F82]'
                                    : row.status === 'working'
                                    ? 'bg-amber-500 animate-pulse'
                                    : row.status === 'half_day'
                                    ? 'bg-sky-500'
                                    : 'bg-rose-500'
                                }`}
                              />
                              <span>
                                {row.status === 'present'
                                  ? 'Full Day'
                                  : row.status === 'working'
                                  ? 'In Progress'
                                  : row.status === 'half_day'
                                  ? 'Half Day'
                                  : 'Absent'}
                              </span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {row.breaks && row.breaks.length > 0 ? (
                              <button
                                onClick={() =>
                                  setExpandedAttendanceId(expandedAttendanceId === row.id ? null : row.id)
                                }
                                className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-[11px] inline-flex items-center gap-1 transition"
                              >
                                <span>{expandedAttendanceId === row.id ? 'Hide' : 'Logs'}</span>
                                {expandedAttendanceId === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)] italic">None</span>
                            )}
                          </td>
                        </tr>

                        {/* Individual break breakdown row */}
                        {expandedAttendanceId === row.id && row.breaks && row.breaks.length > 0 && (
                          <tr className="bg-[var(--bg-surface-hover)]/40">
                            <td colSpan={8} className="p-4">
                              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
                                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Coffee size={12} className="text-[#9D8F82]" />
                                  <span>Individual Break Logs for {row.date} ({row.breaks.length})</span>
                                </div>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-[var(--border-subtle)] text-[9px] font-bold text-[var(--text-secondary)] uppercase">
                                      <th className="py-1.5 px-3">Break</th>
                                      <th className="py-1.5 px-3">Break Start</th>
                                      <th className="py-1.5 px-3">Break End</th>
                                      <th className="py-1.5 px-3 text-right">Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {row.breaks.map((b) => (
                                      <tr key={b.id} className="text-[11px] hover:bg-[var(--bg-surface-hover)] transition">
                                        <td className="py-2 px-3 font-bold text-[var(--text-primary)]">
                                          Break #{b.breakNumber}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                                          {b.startTime}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                                          {b.endTime}
                                        </td>
                                        <td className="py-2 px-3 font-semibold text-[#9D8F82] text-right">
                                          {b.duration}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Leave Status ── */}
        {activeTab === 'leaves' && (
          <div
            id="panel-leaves"
            role="tabpanel"
            aria-labelledby="tab-leaves"
            className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm animate-fadeIn"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Leave Applications & Status
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Review employee leave requests and historical submissions
                </p>
              </div>

              {/* Leave search filter */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Filter leaves..."
                  value={leaveFilter}
                  onChange={(e) => setLeaveFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] w-48"
                />
              </div>
            </div>

            {filteredLeaves.length === 0 ? (
              <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                <Calendar size={28} className="mx-auto mb-2 opacity-40" />
                <p className="font-semibold text-[var(--text-primary)]">No leave records</p>
                <p className="mt-1">This employee has no leave applications on record.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="py-3 px-4 min-w-[130px]">Leave Type</th>
                      <th className="py-3 px-4 min-w-[110px]">Start Date</th>
                      <th className="py-3 px-4 min-w-[110px]">End Date</th>
                      <th className="py-3 px-4 min-w-[200px]">Reason</th>
                      <th className="py-3 px-4 min-w-[110px]">Request Date</th>
                      {filteredLeaves.some((l) => l.status) && (
                        <th className="py-3 px-4 min-w-[120px] text-right">Approval Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredLeaves.map((leave) => (
                      <tr key={leave.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                        <td className="py-3 px-4 font-bold text-[var(--text-primary)]">{leave.leaveType}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{leave.startDate}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{leave.endDate}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs">{leave.reason}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{leave.requestDate}</td>
                        {leave.status && (
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                                leave.status === 'approved'
                                  ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/30'
                                  : leave.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                              }`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    leave.status === 'approved'
                                      ? '#9D8F82'
                                      : leave.status === 'pending'
                                      ? '#F59E0B'
                                      : '#EF4444',
                                }}
                              />
                              <span>{leave.status}</span>
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 4: Daily Updates ── */}
        {activeTab === 'updates' && (
          <div
            id="panel-updates"
            role="tabpanel"
            aria-labelledby="tab-updates"
            className="card p-6 md:p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm animate-fadeIn"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Daily Work Updates Log
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Employee daily standup notes, progress updates, and activity logs
                </p>
              </div>

              {/* Date / keyword search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Filter updates..."
                  value={updateFilter}
                  onChange={(e) => setUpdateFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] w-48"
                />
              </div>
            </div>

            {filteredUpdates.length === 0 ? (
              <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                <FileText size={28} className="mx-auto mb-2 opacity-40" />
                <p className="font-semibold text-[var(--text-primary)]">No daily updates</p>
                <p className="mt-1">No submitted daily work updates found for this employee.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredUpdates.map((update) => (
                  <div
                    key={update.id}
                    className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          {update.updateDate}
                        </span>
                        {update.project && (
                          <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                            #{update.project}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        Submitted: {update.submittedDate}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-primary)] leading-relaxed m-0 whitespace-pre-line">
                      {update.description}
                    </p>

                    {update.lastUpdatedDate && update.lastUpdatedDate !== update.submittedDate && (
                      <div className="mt-2 text-[10px] text-[var(--text-secondary)] italic">
                        Last edited: {update.lastUpdatedDate}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Edit Employee Profile Modal ── */}
        {isEditingProfile && (
          <div className="modal-backdrop">
            <div className="auth-modal max-w-xl w-full max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="modal-close"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--active-bg)] text-[var(--active-text)] flex items-center justify-center">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
                    Edit Employee Profile
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Update official personnel details for <strong className="text-[var(--text-primary)]">{selectedEmployee.name}</strong> ({selectedEmployee.employeeId})
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveEmployeeProfile} className="space-y-4 text-xs">
                {/* Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.firstName}
                      onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>

                {/* Nickname & Gender */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Nickname
                    </label>
                    <input
                      type="text"
                      value={editForm.nickname}
                      onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))}
                      placeholder="e.g. Alex"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Gender
                    </label>
                    <select
                      value={editForm.gender}
                      onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    >
                      <option value="">Not specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>

                {/* Mobile & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      value={editForm.mobileNumber}
                      onChange={(e) => setEditForm((f) => ({ ...f, mobileNumber: e.target.value }))}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+91 44 2345 6789"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
                    />
                  </div>
                </div>

                {/* Designation & Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Designation / Role
                    </label>
                    <input
                      type="text"
                      value={editForm.designation}
                      onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={editForm.department}
                      onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                      placeholder="e.g. Engineering"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>

                {/* Work Location & Timezone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Work Location
                    </label>
                    <input
                      type="text"
                      value={editForm.workLocation}
                      onChange={(e) => setEditForm((f) => ({ ...f, workLocation: e.target.value }))}
                      placeholder="e.g. Chennai HQ / Remote"
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Time Zone
                    </label>
                    <select
                      value={editForm.timezone}
                      onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST • UTC+5:30)</option>
                      <option value="UTC">UTC (UTC+0)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    </select>
                  </div>
                </div>

                {/* Residential Address */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Residential Address
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.residentAddress}
                    onChange={(e) => setEditForm((f) => ({ ...f, residentAddress: e.target.value }))}
                    placeholder="Enter current residential address..."
                    className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                  />
                </div>

                {/* Permanent Address */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Permanent Address
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.permanentAddress}
                    onChange={(e) => setEditForm((f) => ({ ...f, permanentAddress: e.target.value }))}
                    placeholder="Enter permanent address..."
                    className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {savingProfile ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={14} /> Save Profile to Database
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Main Directory List ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 select-none animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Workforce Management
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display flex items-center gap-2.5">
            <span>People & Directory</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--border-strong)] text-[var(--text-primary)]">
              {employees.length} Employees
            </span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Manage and monitor your workforce across corporate departments and office locations
          </p>
        </div>

        <button
          onClick={loadEmployees}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          title="Refresh directory"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Toolbar: Search & Dynamic Filters */}
      <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by name, email or Employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition"
          />
        </div>

        {/* Filters Group */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Department Filter */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--border-strong)] cursor-pointer"
            >
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept === 'All' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
            />
          </div>

          {/* Role Filter */}
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--border-strong)] cursor-pointer"
            >
              <option value="All">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Employee">Employee</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
            />
          </div>

          {/* Account Status Filter */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--border-strong)] cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
            />
          </div>

          {/* Reset button */}
          {(searchTerm || selectedDept !== 'All' || selectedRole !== 'All' || selectedStatus !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDept('All');
                setSelectedRole('All');
                setSelectedStatus('All');
              }}
              className="px-3 py-2 rounded-xl bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw size={12} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={loadEmployees} className="font-bold underline hover:opacity-80">
            Try again
          </button>
        </div>
      )}

      {/* Employee List Table */}
      <section className="card rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3.5 px-5 min-w-[220px]">1. Employee</th>
                <th className="py-3.5 px-5 min-w-[120px]">2. Employee ID</th>
                <th className="py-3.5 px-5 min-w-[170px]">3. Department</th>
                <th className="py-3.5 px-5 min-w-[180px]">4. Designation / Job Title</th>
                <th className="py-3.5 px-5 min-w-[140px]">5. Today's Attendance</th>
                <th className="py-3.5 px-5 min-w-[110px]">6. Account Status</th>
                <th className="py-3.5 px-5 min-w-[110px] text-right">7. Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-muted)]">
                    <div className="inline-block w-6 h-6 border-2 border-[var(--border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin mb-2" />
                    <p className="font-semibold text-[var(--text-primary)]">Loading employee directory...</p>
                  </td>
                </tr>
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-muted)]">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-[var(--text-primary)] text-sm">No employees match criteria</p>
                    <p className="mt-1">Try adjusting your search terms or clearing active filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const isOnline = emp.todayAttendance === 'working';
                  const isOnBreak = emp.todayAttendance === 'break';
                  const isCheckedOut = emp.todayAttendance === 'checked_out';
                  const isActive = emp.status === 'active';

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className="hover:bg-[var(--bg-surface-hover)] transition cursor-pointer group"
                    >
                      {/* 1. Employee Full Name + Avatar */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={emp.name}
                            avatarUrl={emp.avatarUrl}
                            status={emp.todayAttendance}
                            size="md"
                          />
                          <div className="min-w-0">
                            <strong className="block text-xs sm:text-sm font-bold text-[var(--text-primary)] group-hover:underline truncate">
                              {emp.name}
                            </strong>
                            <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                              {emp.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Employee ID */}
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)] px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]">
                          {emp.employeeId}
                        </span>
                      </td>

                      {/* 3. Department */}
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-[var(--text-primary)]">{emp.department}</span>
                      </td>

                      {/* 4. Designation / Job Title */}
                      <td className="py-3.5 px-5">
                        <span className="text-[var(--text-secondary)]">{emp.position}</span>
                      </td>

                      {/* 5. Today's Attendance Status */}
                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isOnline
                              ? 'bg-[#9D8F82]/10 text-[var(--text-primary)] border-[#9D8F82]/30'
                              : isOnBreak
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                              : isCheckedOut
                              ? 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: isOnline
                                ? '#9D8F82'
                                : isOnBreak
                                ? '#F59E0B'
                                : isCheckedOut
                                ? '#566167'
                                : '#EF4444',
                            }}
                          />
                          <span>
                            {isOnline ? 'Online' : isOnBreak ? 'Break' : isCheckedOut ? 'Checked Out' : 'Offline'}
                          </span>
                        </span>
                      </td>

                      {/* 6. Account Status */}
                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isActive
                              ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* 7. Action: View Details */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployee(emp);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <div>
            Showing{' '}
            <strong className="text-[var(--text-primary)]">
              {filteredEmployees.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-[var(--text-primary)]">
              {Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)}
            </strong>{' '}
            of <strong className="text-[var(--text-primary)]">{filteredEmployees.length}</strong> employees
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-hover)] transition"
              title="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-semibold text-[var(--text-primary)] px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-hover)] transition"
              title="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
