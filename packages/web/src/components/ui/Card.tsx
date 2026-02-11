'use client';

import { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'elevated';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantStyles = {
  default: 'bg-paper border border-ink-200',
  glass: 'bg-paper border border-ink-200',       // glass is now just default
  elevated: 'bg-paper border border-ink-200 shadow-sm',
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

function Card({
  variant = 'default',
  hoverable = false,
  padding = 'none',
  className = '',
  children,
  ...props
}: CardProps) {
  const baseClasses = `rounded-sm overflow-hidden ${variantStyles[variant]} ${paddingStyles[padding]} ${hoverable ? 'hover:border-ink-300 transition-colors cursor-pointer' : ''} ${className}`;

  return (
    <div className={baseClasses} {...props}>
      {children as any}
    </div>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}

function CardHeader({
  title,
  description,
  action,
  className = '',
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={`p-4 border-b border-ink-100 ${className}`}
      {...props}
    >
      {(title || description || action) ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-900">{title}</h3>}
            {description && <p className="text-sm text-ink-500 mt-1">{description}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action as any}</div>}
        </div>
      ) : (children as any)}
    </div>
  );
}

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function CardBody({ className = '', children, ...props }: CardBodyProps) {
  return (
    <div className={`p-4 ${className}`} {...props}>
      {children as any}
    </div>
  );
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function CardFooter({ className = '', children, ...props }: CardFooterProps) {
  return (
    <div
      className={`p-4 border-t border-ink-100 bg-ink-50/50 ${className}`}
      {...props}
    >
      {children as any}
    </div>
  );
}

export { Card, CardHeader, CardBody, CardFooter };
export type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps };
