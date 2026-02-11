'use client';

import { InputHTMLAttributes, useState, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerClassName = '',
  className = '',
  id,
  type = 'text',
  disabled,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium uppercase tracking-wider text-ink-500 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-300">
            {leftIcon as any}
          </div>
        )}
        <input
          id={inputId}
          type={inputType}
          disabled={disabled}
          className={`
            block w-full rounded-sm border bg-white
            text-ink-900 placeholder-ink-300
            transition-colors duration-100
            focus:outline-none focus:ring-1 focus:ring-field-500 focus:border-field-500
            disabled:bg-ink-50 disabled:text-ink-500 disabled:cursor-not-allowed
            ${error ? 'border-signal-red focus:ring-signal-red' : 'border-ink-200'}
            ${leftIcon ? 'pl-10' : 'pl-3'}
            ${rightIcon || isPassword ? 'pr-10' : 'pr-3'}
            py-2 text-sm
            ${className}
          `}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...(props as any)}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-300 hover:text-ink-500"
            tabIndex={-1}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        )}
        {rightIcon && !isPassword && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-ink-300">
            {rightIcon as any}
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-signal-red">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Input };
export type { InputProps };
