import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  Filter,
  Kanban,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEmployee } from '../context/EmployeeContext';

export function TasksPage() {
  const { tasks, addTask, updateTask, deleteTask, showToast } = useEmployee();

  // View mode: 'table' (date-wise) or 'board' (status columns)
  const [viewMode, setViewMode] = useState('table');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('all');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project: 'Crew Core',
    priority: 'Medium',
    due: 'Today',
    date: new Date().toISOString().split('T')[0],
    status: 'in_progress',
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesDesc = t.description?.toLowerCase().includes(query);
        const matchesProj = t.project.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesProj) return false;
      }

      // Status
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }

      // Date
      if (selectedDateFilter === 'today' && t.date !== todayStr) return false;
      if (selectedDateFilter === 'yesterday' && t.date !== yesterdayStr) return false;
      if (selectedDateFilter === 'custom' && customDate && t.date !== customDate) return false;

      return true;
    });
  }, [tasks, searchTerm, statusFilter, selectedDateFilter, customDate, todayStr, yesterdayStr]);

  const handleOpenCreate = () => {
    setEditingTaskId(null);
    setFormData({
      title: '',
      description: '',
      project: 'Crew Core',
      priority: 'Medium',
      due: 'Today',
      date: new Date().toISOString().split('T')[0],
      status: 'in_progress',
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (task) => {
    setEditingTaskId(task.id);
    setFormData({
      title: task.title,
      description: task.description || '',
      project: task.project,
      priority: task.priority,
      due: task.due || 'Today',
      date: task.date || todayStr,
      status: task.status,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('Please enter a task title', 'error');
      return;
    }

    if (editingTaskId) {
      updateTask(editingTaskId, {
        title: formData.title,
        description: formData.description,
        project: formData.project,
        priority: formData.priority,
        due: formData.due,
        date: formData.date,
        status: formData.status,
      });
      showToast('Daily work update saved successfully!', 'success');
    } else {
      addTask({
        title: formData.title,
        description: formData.description,
        project: formData.project,
        priority: formData.priority,
        due: formData.due,
        date: formData.date,
        status: formData.status,
      });
      showToast('New daily work update logged!', 'success');
    }

    setIsFormOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight font-display">
            My Tasks – Daily Work Updates
          </h2>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Log, track and report what you worked on each day with date-wise filtering
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle view mode */}
          <div className="flex rounded-xl bg-[var(--bg-surface-hover)] p-1 border border-[var(--border-subtle)]">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Date-wise Table View"
            >
              <List size={14} /> Date-wise Table
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'board'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Kanban Board View"
            >
              <Kanban size={14} /> Status Board
            </button>
          </div>

          {/* Add Task Button */}
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Plus size={16} /> Add Daily Update
          </button>
        </div>
      </div>

      {/* ── Filter Controls Row ── */}
      <div className="card p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search updates or project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface-hover)] focus:outline-none focus:border-[var(--border-strong)] w-48 sm:w-60"
            />
          </div>

          {/* Date Filter */}
          <select
            value={selectedDateFilter}
            onChange={(e) => setSelectedDateFilter(e.target.value)}
            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
          >
            <option value="all">All Dates</option>
            <option value="today">Today's Updates</option>
            <option value="yesterday">Yesterday's Updates</option>
            <option value="custom">Custom Date Pick</option>
          </select>

          {selectedDateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
            />
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="todo">Not Started / To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="text-xs text-[var(--text-secondary)] font-medium">
          Showing <strong className="text-[var(--text-primary)]">{filteredTasks.length}</strong> updates
        </div>
      </div>

      {/* ── VIEW 1: Date-wise Table ── */}
      {viewMode === 'table' && (
        <section className="card p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Task Title</th>
                  <th className="py-3 px-4">Work Description</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-[var(--bg-surface-hover)] transition">
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)] whitespace-nowrap flex items-center gap-1.5">
                      <Calendar size={13} className="text-[var(--text-secondary)]" />
                      <span>{task.date || 'Today'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[var(--text-primary)] max-w-xs truncate">
                      {task.title}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-secondary)] max-w-sm truncate">
                      {task.description || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-[11px]">
                        {task.project}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          task.priority === 'High'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25'
                            : task.priority === 'Medium'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25'
                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={task.status}
                        onChange={(e) => updateTask(task.id, { status: e.target.value })}
                        className={`text-[10px] font-bold rounded-full px-2.5 py-1 border focus:outline-none cursor-pointer ${
                          task.status === 'completed'
                            ? 'bg-[#9D8F82]/15 text-[var(--text-primary)] border-[#9D8F82]/30'
                            : task.status === 'in_progress'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                            : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <option value="todo">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(task)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition"
                          title="Edit Task Update"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-600 hover:bg-rose-500/10 transition"
                          title="Delete Task Update"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                      No daily work updates match the selected filters. Click "Add Daily Update" to record your work!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── VIEW 2: Kanban Board Columns ── */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {['todo', 'in_progress', 'completed'].map((colStatus) => {
            const colTasks = filteredTasks.filter((t) => t.status === colStatus);
            const colLabel =
              colStatus === 'todo'
                ? 'Not Started / To Do'
                : colStatus === 'in_progress'
                ? 'In Progress'
                : 'Completed';

            return (
              <div
                key={colStatus}
                className="card p-4 rounded-2xl bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex flex-col gap-3 min-h-[400px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        colStatus === 'completed'
                          ? 'bg-[#9D8F82]'
                          : colStatus === 'in_progress'
                          ? 'bg-amber-500'
                          : 'bg-[var(--text-muted)]'
                      }`}
                    />
                    <span className="font-bold text-xs text-[var(--text-primary)]">{colLabel}</span>
                  </div>
                  <span className="text-[10px] bg-[var(--bg-surface)] font-bold text-[var(--text-primary)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm flex flex-col gap-2 hover:border-[var(--border-strong)] transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[var(--text-primary)] bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-md">
                          {task.project}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(task)}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-rose-600"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="font-bold text-xs text-[var(--text-primary)] leading-snug">{task.title}</div>
                      {task.description && (
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-1 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px]">
                        <span className="text-[var(--text-muted)] flex items-center gap-1">
                          <Calendar size={11} /> {task.date || 'Today'}
                        </span>
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded ${
                            task.priority === 'High'
                              ? 'text-rose-600 bg-rose-500/10'
                              : task.priority === 'Medium'
                              ? 'text-amber-600 bg-amber-500/10'
                              : 'text-sky-600 bg-sky-500/10'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  ))}

                  {colTasks.length === 0 && (
                    <div className="h-32 rounded-xl border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-muted)] font-medium">
                      No tasks in this column
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Task Modal Form ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-w-lg w-full p-6 relative">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">
                {editingTaskId ? 'Edit Daily Work Update' : 'Record Daily Work Update'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
              {/* Date selection */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">
                  Update Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                  required
                />
              </div>

              {/* Task Title */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Completed frontend authentication layout & responsive drawer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)]"
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">
                  Work Description / Details
                </label>
                <textarea
                  placeholder="Detailed notes, accomplishments, tickets closed, blockers resolved..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full p-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
                />
              </div>

              {/* Project & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-primary)] mb-1">Project</label>
                  <select
                    value={formData.project}
                    onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
                  >
                    <option value="Crew Core">Crew Core</option>
                    <option value="Frontend Development">Frontend Development</option>
                    <option value="Design System">Design System</option>
                    <option value="Analytics">Analytics & Reports</option>
                    <option value="General">General / Operations</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-primary)] mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] font-medium"
                >
                  <option value="todo">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] font-bold transition active:scale-95"
                >
                  {editingTaskId ? 'Save Changes' : 'Record Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
