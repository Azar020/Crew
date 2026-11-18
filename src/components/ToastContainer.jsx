import React from 'react';
import { useEmployee } from '../context/EmployeeContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useEmployee();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-slide-up ${
              isSuccess
                ? 'bg-[var(--bg-surface)] border-[#9D8F82]/30 text-[var(--text-primary)]'
                : isError
                ? 'bg-[var(--bg-surface)] border-rose-500/30 text-[var(--text-primary)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-primary)]'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess ? (
                <CheckCircle2 size={18} className="text-[#9D8F82]" />
              ) : isError ? (
                <AlertCircle size={18} className="text-rose-500" />
              ) : (
                <Info size={18} className="text-[var(--text-secondary)]" />
              )}
            </div>
            <div className="flex-1 text-xs font-medium leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-black/5 transition"
              aria-label="Dismiss toast"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
