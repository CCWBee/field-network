'use client';

import { HTMLAttributes, ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  children?: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'text-ink-500 border-ink-200',
  success: 'text-signal-green border-signal-green/30',
  warning: 'text-signal-amber border-signal-amber/30',
  error: 'text-signal-red border-signal-red/30',
  info: 'text-signal-blue border-signal-blue/30',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-ink-300',
  success: 'bg-signal-green',
  warning: 'bg-signal-amber',
  error: 'bg-signal-red',
  info: 'bg-signal-blue',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-sm border uppercase tracking-wider
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children as any}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-1 p-0.5 rounded-sm hover:bg-black/10 transition-colors"
          aria-label="Remove"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant, BadgeSize };
