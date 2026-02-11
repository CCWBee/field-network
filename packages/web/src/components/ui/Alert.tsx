'use client';

import { useState, ReactNode } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string }> = {
  info: {
    container: 'bg-paper border-signal-blue text-ink-900',
    icon: 'text-signal-blue',
  },
  success: {
    container: 'bg-paper border-signal-green text-ink-900',
    icon: 'text-signal-green',
  },
  warning: {
    container: 'bg-paper border-signal-amber text-ink-900',
    icon: 'text-signal-amber',
  },
  error: {
    container: 'bg-paper border-signal-red text-ink-900',
    icon: 'text-signal-red',
  },
};

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

function Alert({
  variant = 'info',
  title,
  dismissible = false,
  onDismiss,
  icon,
  className = '',
  children,
}: AlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const styles = variantStyles[variant];
  const displayIcon = icon ?? defaultIcons[variant];

  if (!isVisible) return null;

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-sm border
        ${styles.container}
        ${className}
      `}
      role="alert"
    >
      {displayIcon && (
        <span className={`flex-shrink-0 ${styles.icon}`}>
          {displayIcon as any}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="font-medium text-ink-900 mb-1">{title}</h4>
        )}
        <div className="text-sm text-ink-700">{children as any}</div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-sm hover:bg-ink-50 transition-colors"
          aria-label="Dismiss"
        >
          <svg
            className="w-4 h-4 text-ink-500"
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
    </div>
  );
}

export { Alert };
export type { AlertProps, AlertVariant };
