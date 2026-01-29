'use client';

interface ReputationMeterProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPercentage?: boolean;
  className?: string;
}

function getScoreColor(score: number): { bg: string; fill: string; text: string; label: string } {
  if (score >= 95) {
    return {
      bg: 'bg-green-100',
      fill: 'bg-green-500',
      text: 'text-green-700',
      label: 'Excellent',
    };
  }
  if (score >= 85) {
    return {
      bg: 'bg-teal-100',
      fill: 'bg-teal-500',
      text: 'text-teal-700',
      label: 'Very Good',
    };
  }
  if (score >= 70) {
    return {
      bg: 'bg-yellow-100',
      fill: 'bg-yellow-500',
      text: 'text-yellow-700',
      label: 'Good',
    };
  }
  if (score >= 50) {
    return {
      bg: 'bg-orange-100',
      fill: 'bg-orange-500',
      text: 'text-orange-700',
      label: 'Fair',
    };
  }
  return {
    bg: 'bg-red-100',
    fill: 'bg-red-500',
    text: 'text-red-700',
    label: 'Needs Improvement',
  };
}

export function ReputationMeterBar({
  score,
  size = 'md',
  showLabel = true,
  showPercentage = true,
  className = '',
}: ReputationMeterProps) {
  const colors = getScoreColor(score);

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={className}>
      {(showLabel || showPercentage) && (
        <div className="flex items-center justify-between mb-1">
          {showLabel && (
            <span className={`text-xs font-medium ${colors.text}`}>{colors.label}</span>
          )}
          {showPercentage && (
            <span className={`text-sm font-semibold ${colors.text}`}>{score.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className={`${heights[size]} ${colors.bg} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${colors.fill} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

export function ReputationMeterCircle({
  score,
  size = 'md',
  showLabel = true,
  showPercentage = true,
  className = '',
}: ReputationMeterProps) {
  const colors = getScoreColor(score);

  const sizes = {
    sm: { width: 60, stroke: 4, text: 'text-sm', label: 'text-xs' },
    md: { width: 80, stroke: 5, text: 'text-lg', label: 'text-xs' },
    lg: { width: 120, stroke: 8, text: 'text-2xl', label: 'text-sm' },
  };

  const config = sizes[size];
  const radius = (config.width - config.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative">
        <svg width={config.width} height={config.width} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            className="text-slate-200"
          />
          {/* Progress circle */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={colors.fill.replace('bg-', 'text-')}
            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          />
        </svg>
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-bold ${colors.text} ${config.text}`}>
              {score.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
      {showLabel && (
        <span className={`mt-2 font-medium ${colors.text} ${config.label}`}>
          {colors.label}
        </span>
      )}
    </div>
  );
}

export default function ReputationMeter(props: ReputationMeterProps & { variant?: 'bar' | 'circle' }) {
  const { variant = 'bar', ...rest } = props;

  if (variant === 'circle') {
    return <ReputationMeterCircle {...rest} />;
  }

  return <ReputationMeterBar {...rest} />;
}
