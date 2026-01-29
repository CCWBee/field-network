'use client';

import { HTMLAttributes } from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize;
  color?: 'primary' | 'white' | 'slate';
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const colorStyles = {
  primary: 'border-field-500',
  white: 'border-white',
  slate: 'border-slate-600',
};

function Spinner({
  size = 'md',
  color = 'primary',
  label,
  className = '',
  ...props
}: SpinnerProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-label={label || 'Loading'}
      {...props}
    >
      <div
        className={`
          animate-spin rounded-full border-2 border-b-transparent
          ${sizeStyles[size]}
          ${colorStyles[color]}
        `}
      />
      {label && <span className="text-sm text-slate-600">{label}</span>}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
}

export { Spinner };
export type { SpinnerProps, SpinnerSize };
