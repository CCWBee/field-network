'use client';

import { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  containerClassName = '',
  className = '',
  id,
  disabled,
  ...props
}: SelectProps) {
  const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          disabled={disabled}
          className={`
            block w-full rounded-lg border bg-white
            text-slate-800 appearance-none
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent
            disabled:bg-surface-50 disabled:text-slate-500 disabled:cursor-not-allowed
            ${error ? 'border-red-300 focus:ring-red-500' : 'border-surface-300'}
            pl-3 pr-10 py-2 text-sm
            ${className}
          `}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && (
        <p id={`${selectId}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Select };
export type { SelectProps, SelectOption };
