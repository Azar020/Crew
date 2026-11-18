import React from 'react';
import { AlertTriangle, LogOut, X } from 'lucide-react';

/**
 * CheckOutConfirmModal
 * Confirmation popup before checking out.
 * Does NOT log the user out of the application.
 */
export function CheckOutConfirmModal({ isOpen, onCancel, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      {/* Click outside to cancel */}
      <div className="absolute inset-0" onClick={onCancel} aria-hidden="true" />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-6 flex flex-col gap-4">
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        {/* Warning Icon */}
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto text-amber-500">
          <AlertTriangle size={22} />
        </div>

        {/* Text */}
        <div className="text-center">
          <h3
            id="checkout-modal-title"
            className="text-base font-bold text-[var(--text-primary)] font-display"
          >
            Are you sure you want to check out?
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            Your current attendance session will be completed. Make sure you have finished your work for today.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-3 rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 px-3 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <LogOut size={13} />
            Confirm Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
