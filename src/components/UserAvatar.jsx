import React, { useState } from 'react';
import { getInitials } from '../utils/dateUtils';

/**
 * UserAvatar Component
 * Displays a clean user avatar with dynamic initials fallback (e.g. "AZ" for Azar, "AW" for Alex Williams).
 * Styled with a purple/violet circular background matching the Crew design specifications.
 * Supports status dot (Online / Break / Offline) in the bottom-right corner.
 */
export function UserAvatar({
  name = 'User',
  avatarUrl = null,
  status = null, // 'working' | 'break' | 'offline' | 'online'
  showStatusDot = true,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  className = '',
}) {
  const [imageError, setImageError] = useState(false);

  // Filter out dummy/mock unsplash stock images to ensure clean initials are rendered unless user has real photo
  const isStockPlaceholder =
    typeof avatarUrl === 'string' &&
    (avatarUrl.includes('images.unsplash.com') || avatarUrl.includes('placeholder'));

  const hasValidPhoto = Boolean(avatarUrl && !isStockPlaceholder && !imageError);
  const initials = getInitials(name);

  // Status dot color mapping (Muted Clay for Online, Amber for Break, Slate for Offline)
  const isOnline = status === 'working' || status === 'online';
  const isOnBreak = status === 'break';
  const dotColor = isOnline ? '#9D8F82' : isOnBreak ? '#F59E0B' : '#566167';

  // Size mappings
  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-14 h-14 text-base font-bold',
  };

  const dotSizes = {
    sm: 'w-2 h-2 ring-[1.5px]',
    md: 'w-2.5 h-2.5 ring-2',
    lg: 'w-3 h-3 ring-2',
    xl: 'w-3.5 h-3.5 ring-2',
  };

  return (
    <div className={`relative inline-flex shrink-0 select-none ${className}`}>
      <div
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full overflow-hidden flex items-center justify-center font-bold tracking-wider ring-1 ring-[var(--border-strong)] transition-all`}
        style={{
          backgroundColor: '#7C3AED',
          color: '#FFFFFF',
        }}
        title={name}
      >
        {hasValidPhoto ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="font-display uppercase leading-none">{initials}</span>
        )}
      </div>

      {showStatusDot && status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-[var(--bg-surface)] ${dotSizes[size] || dotSizes.md}`}
          style={{ backgroundColor: dotColor }}
          title={`Status: ${isOnline ? 'Online' : isOnBreak ? 'Break' : 'Offline'}`}
        />
      )}
    </div>
  );
}
