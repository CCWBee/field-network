'use client';

import { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

const Skeleton = ({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className = '',
  style,
  ...props
}: SkeletonProps) => {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const defaultHeight = variant === 'text' ? '1em' : undefined;
  const defaultWidth = variant === 'circular' ? height : '100%';

  return (
    <div
      className={`
        bg-surface-200
        ${variantStyles[variant]}
        ${animationStyles[animation]}
        ${className}
      `}
      style={{
        width: width ?? defaultWidth,
        height: height ?? defaultHeight,
        ...style,
      }}
      aria-hidden="true"
      {...(props as any)}
    />
  );
};

// Predefined skeleton components for common use cases
const SkeletonText = ({ lines = 3, className = '' }: { lines?: number; className?: string }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        width={i === lines - 1 ? '75%' : '100%'}
        height={16}
      />
    ))}
  </div>
);

const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`bg-white rounded-lg border border-surface-200 p-4 ${className}`}>
    <div className="flex items-start gap-4">
      <Skeleton variant="circular" width={48} height={48} />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="40%" height={16} />
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <Skeleton variant="text" height={14} />
      <Skeleton variant="text" height={14} />
      <Skeleton variant="text" width="80%" height={14} />
    </div>
  </div>
);

const SkeletonTable = ({ rows = 5, columns = 4, className = '' }: { rows?: number; columns?: number; className?: string }) => (
  <div className={`overflow-hidden ${className}`}>
    <div className="flex gap-4 p-4 border-b border-surface-200 bg-surface-50">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} variant="text" height={16} className="flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex gap-4 p-4 border-b border-surface-200">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} variant="text" height={14} className="flex-1" />
        ))}
      </div>
    ))}
  </div>
);

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable };
export type { SkeletonProps };
