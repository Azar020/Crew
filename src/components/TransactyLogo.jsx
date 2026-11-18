import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export function TransactyLogo({
  variant = 'auto', // 'auto' | 'light' | 'dark'
  showSubtext = true,
  className = '',
  height = 32,
}) {
  const { isDark } = useTheme();
  const [imgError, setImgError] = useState(false);

  const effectiveVariant = variant === 'auto' ? (isDark ? 'dark' : 'light') : variant;

  const logoSrc =
    effectiveVariant === 'dark'
      ? '/assets/TRENSACTY-LOGO-IVORY-DUST.png'
      : '/assets/TRANSACTY-LOGO-OBSIDIAN-BROWN.png';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {!imgError ? (
        <img
          src={logoSrc}
          alt="Transacty"
          style={{ height: `${height}px`, width: 'auto' }}
          className="object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-hover)] text-[#0F0700] font-black flex items-center justify-center text-base">
            T
          </div>
          <span className="font-display font-extrabold tracking-tight text-lg text-[var(--text-primary)]">
            TRANSACTY
          </span>
        </div>
      )}
      {showSubtext && (
        <div className="flex items-center gap-1.5 border-l border-[var(--border-strong)] pl-2.5">
          <span className="font-display font-black tracking-wider text-xs uppercase px-2 py-0.5 rounded bg-[var(--active-bg)] text-[var(--active-indicator)]">
            CREW
          </span>
        </div>
      )}
    </div>
  );
}
