'use client';

import { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

function Textarea({
  label,
  error,
  hint,
  containerClassName = '',
  className = '',
  id,
  disabled,
  rows = 4,
  ...props
}: TextareaProps) {
  const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        disabled={disabled}
        rows={rows}
        className={`
          block w-full rounded-lg border bg-white
          text-slate-800 placeholder-slate-400
          transition-colors duration-150 resize-y
          focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent
          disabled:bg-surface-50 disabled:text-slate-500 disabled:cursor-not-allowed
          ${error ? 'border-red-300 focus:ring-red-500' : 'border-surface-300'}
          px-3 py-2 text-sm
          ${className}
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...(props as any)}
      />
      {error && (
        <p id={`${textareaId}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${textareaId}-hint`} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Textarea };
export type { TextareaProps };
