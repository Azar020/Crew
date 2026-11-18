export function StatCard({ label, value, trend, icon: Icon, tone = 'blue' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      {trend && <span className="stat-trend">{trend}</span>}
    </div>
  );
}
