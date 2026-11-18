import { ArrowUpRight, Check } from 'lucide-react';

export function TaskPreview({ tasks, onNavigate }) {
  return (
    <section className="card tasks-card">
      <div className="card-header">
        <div>
          <p className="section-kicker">Focus list</p>
          <h3>
            My tasks <span className="count-badge">{tasks.length}</span>
          </h3>
        </div>
        <button className="link-btn" onClick={() => onNavigate('My Tasks')}>
          View all <ArrowUpRight size={15} />
        </button>
      </div>

      <div className="task-table">
        <div className="task-table-head">
          <span>Name</span>
          <span>Priority</span>
          <span>Due date</span>
        </div>
        {tasks.slice(0, 4).map((task) => (
          <div className="task-row" key={task.id}>
            <button className={`task-check ${task.status === 'completed' ? 'done' : ''}`}>
              <Check size={13} />
            </button>
            <span className="task-name">
              {task.title}
              <small>{task.project}</small>
            </span>
            <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
            <span className={task.due === 'Today' ? 'due-today' : ''}>{task.due}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
