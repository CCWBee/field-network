'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-field-500 text-white border-2 border-field-600 hover:bg-field-600 active:bg-field-700',
  secondary: 'bg-transparent text-ink-700 border border-ink-200 hover:bg-ink-50 active:bg-ink-100',
  ghost: 'bg-transparent text-ink-500 hover:bg-ink-50 active:bg-ink-100',
  danger: 'bg-signal-red text-white border-2 border-red-700 hover:bg-red-700 active:bg-red-800',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-sm gap-1.5',
  md: 'px-4 py-2 text-sm rounded-sm gap-2',
  lg: 'px-6 py-3 text-base rounded-sm gap-2.5',
};

function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  className = '',
  type = 'button',
  onClick,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium
        transition-colors duration-100
        focus:outline-none focus-visible:ring-1 focus-visible:ring-field-500 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={isDisabled}
      type={type}
      onClick={onClick}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon as any}</span>}
          {children as any}
          {rightIcon && <span className="flex-shrink-0">{rightIcon as any}</span>}
        </>
      )}
    </button>
  );
}

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
