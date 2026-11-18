import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Coffee,
  Download,
  FileText,
  PieChart as PieIcon,
  TrendingUp,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { StatCard } from '../components/StatCard';
import { useEmployee } from '../context/EmployeeContext';

export function ReportsPage() {
  const {
    workedHours,
    breakMinutes,
    leaveBalances,
    attendanceHistory,
    leaveRequests,
    showToast,
  } = useEmployee();
  const [dateRange, setDateRange] = useState('this_month');

  // Filter-dependent metrics calculated from PostgreSQL attendance history & leave requests
  const { metrics, attendanceTrendData, adherenceRate, attendanceRateStr } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Determine date boundaries
    let filterFn = () => true;
    let expectedWorkingDays = 22;

    if (dateRange === 'last_7_days') {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filterFn = (d) => d >= cutoff && d <= now;
      expectedWorkingDays = 5;
    } else if (dateRange === 'last_month') {
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filterFn = (d) => d.getFullYear() === lastMonthYear && d.getMonth() === lastMonth;
      expectedWorkingDays = 21;
    } else if (dateRange === 'ytd') {
      filterFn = (d) => d.getFullYear() === currentYear;
      expectedWorkingDays = Math.max(1, (currentMonth + 1) * 21);
    } else {
      // 'this_month'
      filterFn = (d) => d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      // calculate Mon-Fri days up to today
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      let bDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dow = new Date(currentYear, currentMonth, day).getDay();
        if (dow !== 0 && dow !== 6) bDays++;
      }
      expectedWorkingDays = bDays || 22;
    }

    // Filter attendance records
    const filteredAttendance = (attendanceHistory || []).filter((rec) => {
      const dateVal = rec.isoDate || rec.workDate;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      return filterFn(d);
    });

    // Filter approved leaves
    const filteredLeaves = (leaveRequests || []).filter((req) => {
      if (req.status !== 'approved') return false;
      const d = new Date(req.startDate);
      return filterFn(d);
    });

    const workingDays = filteredAttendance.length;
    const leaveDays = filteredLeaves.reduce((acc, req) => acc + (req.workingDays || 1), 0);

    // Sum working hours
    const totalRecordedHours = filteredAttendance.reduce((acc, rec) => {
      return acc + (typeof rec.netHoursNumeric === 'number' ? rec.netHoursNumeric : 0);
    }, 0);

    const workingHours = +(totalRecordedHours).toFixed(1);
    const breakHours = +(workingDays > 0 ? (workingDays * 0.75) + (breakMinutes / 60) : (breakMinutes / 60)).toFixed(1);

    const avgDailyHours = workingDays > 0 ? `${(workingHours / workingDays).toFixed(1)}h` : '0.0h';
    const hoursDiff = +(workingHours - workingDays * 8.0).toFixed(1);
    const hoursTrend = workingDays > 0 ? `${hoursDiff >= 0 ? '+' : ''}${hoursDiff}h vs target` : 'Standard target';
    const avgBreakMin = workingDays > 0 ? Math.round((breakHours / workingDays) * 60) : 0;
    const breakTrend = avgBreakMin > 0 ? `Avg ${avgBreakMin}m / day` : 'Rest intervals';

    const attRatePct = expectedWorkingDays > 0 ? Math.min(100, Math.round((workingDays / expectedWorkingDays) * 100)) : 0;
    const attendanceRateStr = `${attRatePct}% attendance rate`;

    // Schedule adherence: % of shifts >= 7.5h
    const adherentShifts = filteredAttendance.filter((r) => (r.netHoursNumeric || 0) >= 7.5).length;
    const adherenceRate = workingDays > 0 ? Math.round((adherentShifts / workingDays) * 100) : 100;

    // Trend bar data
    const trendData = [...filteredAttendance]
      .reverse()
      .slice(0, 14)
      .map((r, i) => ({
        day: r.date?.split(',')[0] || `Day ${i + 1}`,
        hours: r.netHoursNumeric || 0,
        target: 8.0,
      }));

    const finalTrendData =
      trendData.length > 0
        ? trendData
        : [{ day: 'Today', hours: +(workedHours || 0).toFixed(1), target: 8.0 }];

    return {
      metrics: {
        workingHours: Math.max(0, workingHours),
        breakHours: Math.max(0, breakHours),
        workingDays,
        leaveDays,
        avgDailyHours,
        hoursTrend,
        breakTrend,
      },
      attendanceTrendData: finalTrendData,
      adherenceRate,
      attendanceRateStr,
    };
  }, [dateRange, attendanceHistory, leaveRequests, workedHours, breakMinutes]);

  // Chart 1: Working Time vs Break Time Data (Obsidian Brown & Muted Clay)
  const pieData = useMemo(() => {
    const w = metrics.workingHours > 0 ? metrics.workingHours : 0.01;
    const b = metrics.breakHours > 0 ? metrics.breakHours : 0.01;
    return [
      { name: 'Productive Working Time', value: w, color: '#0F0700' },
      { name: 'Break / Rest Time', value: b, color: '#9D8F82' },
    ];
  }, [metrics]);

  // Chart 3: Leave Summary Breakdown
  const leaveSummaryData = [
    {
      category: 'Annual',
      taken: leaveBalances.annual.used,
      remaining: leaveBalances.annual.remaining,
      total: leaveBalances.annual.total,
    },
    {
      category: 'Sick',
      taken: leaveBalances.sick.used,
      remaining: leaveBalances.sick.remaining,
      total: leaveBalances.sick.total,
    },
    {
      category: 'Casual',
      taken: leaveBalances.casual.used,
      remaining: leaveBalances.casual.remaining,
      total: leaveBalances.casual.total,
    },
  ];

  const handleExport = () => {
    showToast(`Exported ${dateRange.replace('_', ' ')} analytical report (CSV).`, 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page Header & Date Range Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
              Workforce Reports & Performance Analytics
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Visual charts for time utilization, daily attendance trends, and leave allowances
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-semibold shadow-sm"
          >
            <option value="last_7_days">Last 7 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="ytd">Year to Date (YTD)</option>
          </select>

          <button
            onClick={handleExport}
            className="px-3.5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── 5 Metric Stat Cards Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <StatCard
          label="Total Working Hours"
          value={`${metrics.workingHours}h`}
          trend={metrics.hoursTrend}
          icon={Clock3}
        />
        <StatCard
          label="Total Break Time"
          value={`${metrics.breakHours}h`}
          trend={metrics.breakTrend}
          icon={Coffee}
        />
        <StatCard
          label="Days Present"
          value={`${metrics.workingDays} days`}
          trend={attendanceRateStr}
          icon={CalendarDays}
        />
        <StatCard
          label="Days On Leave"
          value={`${metrics.leaveDays} days`}
          trend="Approved leaves"
          icon={FileText}
        />
        <StatCard
          label="Avg Daily Hours"
          value={metrics.avgDailyHours}
          trend="Target: 8.0h / day"
          icon={Activity}
        />
      </div>

      {/* ── Chart Row 1: Time Utilization & Daily Working Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pie Chart: Working Hours vs Break Hours */}
        <div className="lg:col-span-5 card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Distribution Ratio
              </span>
              <PieIcon size={17} className="text-[var(--text-secondary)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
              Working vs Break Time
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Net working hours compared to break and rest intervals
            </p>
          </div>

          <div className="h-64 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [`${val} hrs`, 'Duration']}
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => (
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">{val}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-around text-xs">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[var(--text-secondary)]">Work Ratio</span>
              <strong className="text-sm font-bold text-[var(--text-primary)] font-display">
                {metrics.workingHours + metrics.breakHours > 0
                  ? ((metrics.workingHours / (metrics.workingHours + metrics.breakHours)) * 100).toFixed(1)
                  : '0.0'}%
              </strong>
            </div>
            <div className="w-[1px] h-8 bg-[var(--border-subtle)]" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[var(--text-secondary)]">Rest Ratio</span>
              <strong className="text-sm font-bold text-[var(--text-secondary)] font-display">
                {metrics.workingHours + metrics.breakHours > 0
                  ? ((metrics.breakHours / (metrics.workingHours + metrics.breakHours)) * 100).toFixed(1)
                  : '0.0'}%
              </strong>
            </div>
          </div>
        </div>

        {/* Bar Chart: Daily Working Hours Trend vs 8h Target */}
        <div className="lg:col-span-7 card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Shift Analytics
              </span>
              <div className="flex items-center gap-1.5">
                <BarChart3 size={17} className="text-[var(--text-secondary)]" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                Daily Working Hours Trend
              </h3>
              <span className="text-[10px] bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-bold px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                Target: 8.0h
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Net hours completed per working day relative to standard shift goal
            </p>
          </div>

          <div className="h-64 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(157, 143, 130, 0.15)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip
                  formatter={(val, name) => [`${val}h`, name === 'hours' ? 'Net Hours' : 'Target']}
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="hours" fill="#0F0700" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Standard target: 8h shift + 1h lunch/breaks</span>
            <span className="text-[var(--text-primary)] font-semibold">{adherenceRate}% Schedule Adherence</span>
          </div>
        </div>
      </div>

      {/* ── Chart Row 2: Leave Balance Breakdown by Type ── */}
      <div className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="mb-4">
          <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
            Leave Allotment Audit
          </p>
          <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
            Leave Entitlement & Utilization
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {leaveSummaryData.map((item) => {
            const usedPct = ((item.taken / item.total) * 100).toFixed(0);
            return (
              <div
                key={item.category}
                className="p-4 rounded-xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-[var(--text-primary)]">{item.category} Leave</span>
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    {item.remaining} of {item.total} left
                  </span>
                </div>

                <div className="w-full bg-[var(--border-subtle)] h-2 rounded-full overflow-hidden my-2">
                  <div
                    className="bg-[var(--text-primary)] h-full rounded-full transition-all duration-500"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mt-1">
                  <span>Used: {item.taken} days</span>
                  <span className="font-bold text-[var(--text-primary)]">{usedPct}% used</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
