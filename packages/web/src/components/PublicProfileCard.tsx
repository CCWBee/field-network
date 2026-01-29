'use client';

import Link from 'next/link';

interface PublicProfileCardProps {
  user: {
    id: string;
    username: string | null;
    avatar_url?: string | null;
    ens_name?: string | null;
    ens_avatar_url?: string | null;
    location?: string | null;
    stats?: {
      reliability_score?: number;
      tasks_completed?: number;
      tasks_accepted?: number;
    } | null;
    rating?: {
      average: number | null;
      count: number;
    };
    badges?: Array<{
      badge_type: string;
      tier: string;
      title: string;
    }>;
  };
  size?: 'sm' | 'md' | 'lg';
  showRating?: boolean;
  showStats?: boolean;
  showBadges?: boolean;
  linkToProfile?: boolean;
  className?: string;
}

export default function PublicProfileCard({
  user,
  size = 'md',
  showRating = true,
  showStats = true,
  showBadges = true,
  linkToProfile = true,
  className = '',
}: PublicProfileCardProps) {
  const displayName = user.username || user.ens_name || 'Anonymous';
  const avatarUrl = user.ens_avatar_url || user.avatar_url;
  const reliabilityScore = user.stats?.reliability_score ?? 0;

  const sizeClasses = {
    sm: {
      container: 'p-3',
      avatar: 'w-10 h-10 text-lg',
      name: 'text-sm',
      stats: 'text-xs',
    },
    md: {
      container: 'p-4',
      avatar: 'w-12 h-12 text-xl',
      name: 'text-base',
      stats: 'text-xs',
    },
    lg: {
      container: 'p-6',
      avatar: 'w-16 h-16 text-2xl',
      name: 'text-lg',
      stats: 'text-sm',
    },
  };

  const classes = sizeClasses[size];

  const CardContent = () => (
    <div className={`flex items-center gap-4 ${classes.container} ${className}`}>
      {/* Avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`${classes.avatar} rounded-full object-cover border border-surface-200`}
        />
      ) : (
        <div className={`${classes.avatar} rounded-full bg-field-100 flex items-center justify-center text-field-600 font-semibold`}>
          {displayName[0]?.toUpperCase() || '?'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-slate-800 truncate ${classes.name}`}>
            {displayName}
          </span>
          {user.ens_name && user.username && (
            <span className="text-xs text-field-600">{user.ens_name}</span>
          )}
        </div>

        {user.location && (
          <p className={`text-slate-500 ${classes.stats}`}>{user.location}</p>
        )}

        {/* Stats Row */}
        {showStats && user.stats && (
          <div className={`flex items-center gap-3 mt-1 ${classes.stats} text-slate-500`}>
            <span className="flex items-center gap-1">
              <span className={reliabilityScore >= 90 ? 'text-green-600' : reliabilityScore >= 70 ? 'text-yellow-600' : 'text-red-600'}>
                {reliabilityScore.toFixed(0)}%
              </span>
              <span>reliable</span>
            </span>
            {user.stats.tasks_accepted != null && user.stats.tasks_accepted > 0 && (
              <span>{user.stats.tasks_accepted} completed</span>
            )}
          </div>
        )}

        {/* Rating */}
        {showRating && user.rating && user.rating.count > 0 && (
          <div className={`flex items-center gap-1 mt-1 ${classes.stats}`}>
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-3 h-3 ${
                    star <= (user.rating?.average ?? 0)
                      ? 'text-yellow-400 fill-current'
                      : 'text-slate-300'
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-slate-500">
              {user.rating.average?.toFixed(1)} ({user.rating.count})
            </span>
          </div>
        )}
      </div>

      {/* Badges Preview */}
      {showBadges && user.badges && user.badges.length > 0 && size !== 'sm' && (
        <div className="flex -space-x-1">
          {user.badges.slice(0, 3).map((badge, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white ${
                badge.tier === 'platinum' ? 'bg-purple-100 text-purple-600' :
                badge.tier === 'gold' ? 'bg-yellow-100 text-yellow-600' :
                badge.tier === 'silver' ? 'bg-slate-100 text-slate-600' :
                'bg-orange-100 text-orange-600'
              }`}
              title={badge.title}
            >
              {badge.title[0]}
            </div>
          ))}
          {user.badges.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 border-2 border-white">
              +{user.badges.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (linkToProfile && user.username) {
    return (
      <Link
        href={`/users/${user.username}`}
        className="block rounded-lg bg-white border border-surface-200 hover:border-field-300 hover:shadow-sm transition-all"
      >
        <CardContent />
      </Link>
    );
  }

  return (
    <div className="rounded-lg bg-white border border-surface-200">
      <CardContent />
    </div>
  );
}
