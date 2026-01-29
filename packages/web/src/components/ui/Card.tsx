'use client';

import { HTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'elevated';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantStyles = {
  default: 'bg-white border border-surface-200',
  glass: 'glass',
  elevated: 'bg-white border border-surface-200 shadow-md',
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
  const baseClasses = `rounded-lg overflow-hidden ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`;

  if (hoverable) {
    return (
      <motion.div
        whileHover={{ y: -2, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
        transition={{ duration: 0.2 }}
        className={`${baseClasses} cursor-pointer`}
      >
        {children as any}
      </motion.div>
    );
  }

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
      className={`p-4 border-b border-surface-200 ${className}`}
      {...props}
    >
      {(title || description || action) ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-lg font-medium text-slate-800">{title}</h3>}
            {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
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
      className={`p-4 border-t border-surface-200 bg-surface-50 ${className}`}
      {...props}
    >
      {children as any}
    </div>
  );
}

export { Card, CardHeader, CardBody, CardFooter };
export type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps };
