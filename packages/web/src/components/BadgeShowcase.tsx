'use client';

interface Badge {
  badge_type: string;
  tier: string;
  title: string;
  description: string;
  icon_url?: string | null;
  category?: string;
  earned_at: string;
}

interface BadgeShowcaseProps {
  badges: Badge[];
  maxDisplay?: number;
  showAll?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const tierColors = {
  platinum: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    icon: 'bg-purple-100 text-purple-600',
    ring: 'ring-purple-200',
  },
  gold: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: 'bg-yellow-100 text-yellow-600',
    ring: 'ring-yellow-200',
  },
  silver: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    icon: 'bg-slate-100 text-slate-600',
    ring: 'ring-slate-200',
  },
  bronze: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: 'bg-orange-100 text-orange-600',
    ring: 'ring-orange-200',
  },
};

const sizeClasses = {
  sm: {
    grid: 'grid-cols-2 sm:grid-cols-3 gap-2',
    card: 'p-2',
    icon: 'w-8 h-8 text-sm',
    title: 'text-xs',
    desc: 'text-xs hidden',
    tier: 'text-xs',
  },
  md: {
    grid: 'grid-cols-2 sm:grid-cols-3 gap-3',
    card: 'p-3',
    icon: 'w-10 h-10 text-base',
    title: 'text-sm',
    desc: 'text-xs',
    tier: 'text-xs',
  },
  lg: {
    grid: 'grid-cols-1 sm:grid-cols-2 gap-4',
    card: 'p-4',
    icon: 'w-12 h-12 text-lg',
    title: 'text-base',
    desc: 'text-sm',
    tier: 'text-xs',
  },
};

function BadgeIcon({ icon_url, title, tier, size }: { icon_url?: string | null; title: string; tier: string; size: 'sm' | 'md' | 'lg' }) {
  const colors = tierColors[tier as keyof typeof tierColors] || tierColors.bronze;
  const classes = sizeClasses[size];

  if (icon_url) {
    return (
      <img
        src={icon_url}
        alt={title}
        className={`${classes.icon} rounded-full object-cover ring-2 ${colors.ring}`}
      />
    );
  }

  return (
    <div className={`${classes.icon} rounded-full ${colors.icon} flex items-center justify-center font-bold`}>
      {title[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function BadgeShowcase({
  badges,
  maxDisplay = 6,
  showAll = false,
  size = 'md',
  className = '',
}: BadgeShowcaseProps) {
  const displayBadges = showAll ? badges : badges.slice(0, maxDisplay);
  const hasMore = !showAll && badges.length > maxDisplay;
  const classes = sizeClasses[size];

  if (badges.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed border-surface-300 p-6 text-center ${className}`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">No badges earned yet</p>
        <p className="text-xs text-slate-400 mt-1">Complete tasks and maintain reliability to earn badges</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={`grid ${classes.grid}`}>
        {displayBadges.map((badge, index) => {
          const colors = tierColors[badge.tier as keyof typeof tierColors] || tierColors.bronze;

          return (
            <div
              key={`${badge.badge_type}-${badge.tier}-${index}`}
              className={`${classes.card} rounded-lg border ${colors.border} ${colors.bg} flex items-start gap-3 transition-all hover:shadow-sm`}
            >
              <BadgeIcon
                icon_url={badge.icon_url}
                title={badge.title}
                tier={badge.tier}
                size={size}
              />
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${colors.text} truncate ${classes.title}`}>
                  {badge.title}
                </p>
                {size !== 'sm' && (
                  <p className={`text-slate-500 line-clamp-2 ${classes.desc}`}>
                    {badge.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`${classes.tier} px-1.5 py-0.5 rounded ${colors.icon} capitalize`}>
                    {badge.tier}
                  </span>
                  {badge.category && size === 'lg' && (
                    <span className={`${classes.tier} text-slate-400 capitalize`}>
                      {badge.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div className={`${classes.card} rounded-lg border border-dashed border-surface-300 flex items-center justify-center text-slate-500`}>
            <span className="text-sm">+{badges.length - maxDisplay} more</span>
          </div>
        )}
      </div>
    </div>
  );
}
