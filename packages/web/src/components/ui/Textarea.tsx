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
          className="block text-xs font-medium uppercase tracking-wider text-ink-500 mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        disabled={disabled}
        rows={rows}
        className={`
          block w-full rounded-sm border bg-paper
          text-ink-900 placeholder-ink-300
          transition-colors duration-150 resize-y
          focus:outline-none focus:ring-1 focus:ring-field-500 focus:border-field-500
          disabled:bg-ink-50 disabled:text-ink-300 disabled:cursor-not-allowed
          ${error ? 'border-signal-red focus:ring-signal-red' : 'border-ink-200'}
          px-3 py-2 text-sm
          ${className}
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...(props as any)}
      />
      {error && (
        <p id={`${textareaId}-error`} className="mt-1.5 text-sm text-signal-red">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${textareaId}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Textarea };
export type { TextareaProps };
