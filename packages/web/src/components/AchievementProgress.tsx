'use client';

type Achievement = {
  id: string;
  name: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  icon?: string;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlocked?: boolean;
  unlockedAt?: string;
};

type AchievementProgressProps = {
  achievements: Achievement[];
  title?: string;
  className?: string;
  showCompleted?: boolean;
  compact?: boolean;
};

const tierColors = {
  bronze: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
    progress: 'bg-amber-500',
  },
  silver: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    progress: 'bg-slate-500',
  },
  gold: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    progress: 'bg-yellow-500',
  },
  platinum: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-300',
    progress: 'bg-purple-500',
  },
};

const defaultIcons: Record<string, string> = {
  tasks: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  streak: 'M13 10V3L4 14h7v7l9-11h-7z',
  earnings: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  reliability: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
  default: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
};

function AchievementIcon({ icon, className }: { icon?: string; className?: string }) {
  const path = icon || defaultIcons.default;
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export default function AchievementProgress({
  achievements,
  title = 'Achievement Progress',
  className = '',
  showCompleted = true,
  compact = false,
}: AchievementProgressProps) {
  const displayAchievements = showCompleted
    ? achievements
    : achievements.filter((a) => !a.unlocked);

  const completedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const overallProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (compact) {
    return (
      <div className={`glass rounded-lg border border-surface-200 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-slate-400">{title}</span>
          <span className="text-xs text-slate-500">{completedCount}/{totalCount}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3">
          <div
            className="h-full bg-field-500 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="space-y-2">
          {displayAchievements.slice(0, 3).map((achievement) => {
            const progress = Math.min(100, (achievement.current / achievement.target) * 100);
            const tier = achievement.tier || 'bronze';
            const colors = tierColors[tier];

            return (
              <div key={achievement.id} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                  {achievement.unlocked ? (
                    <svg className={`w-3.5 h-3.5 ${colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className={`text-xs font-bold ${colors.text}`}>{Math.round(progress)}%</span>
                  )}
                </div>
                <span className="text-sm text-slate-600 truncate flex-1">{achievement.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass rounded-lg border border-surface-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-surface-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {completedCount} of {totalCount} completed
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-field-600">{Math.round(overallProgress)}%</div>
            <div className="text-xs text-slate-400">Overall</div>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-field-500 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Achievement List */}
      <div className="p-4 space-y-4">
        {displayAchievements.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <p>All achievements completed!</p>
          </div>
        ) : (
          displayAchievements.map((achievement) => {
            const progress = Math.min(100, (achievement.current / achievement.target) * 100);
            const tier = achievement.tier || 'bronze';
            const colors = tierColors[tier];

            return (
              <div
                key={achievement.id}
                className={`rounded-lg border p-4 ${
                  achievement.unlocked
                    ? `${colors.bg} ${colors.border}`
                    : 'bg-white border-surface-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full ${
                    achievement.unlocked ? 'bg-white' : colors.bg
                  } flex items-center justify-center flex-shrink-0`}>
                    {achievement.unlocked ? (
                      <svg className={`w-5 h-5 ${colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <AchievementIcon
                        icon={achievement.icon}
                        className={`w-5 h-5 ${colors.text}`}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`font-medium ${
                        achievement.unlocked ? colors.text : 'text-slate-800'
                      }`}>
                        {achievement.name}
                      </h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} capitalize`}>
                        {tier}
                      </span>
                    </div>
                    <p className={`text-sm mt-1 ${
                      achievement.unlocked ? colors.text : 'text-slate-500'
                    }`}>
                      {achievement.description}
                    </p>

                    {/* Progress bar */}
                    {!achievement.unlocked && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-medium text-slate-700">
                            {achievement.current} / {achievement.target} {achievement.unit}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${colors.progress} transition-all duration-500`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Unlocked date */}
                    {achievement.unlocked && achievement.unlockedAt && (
                      <div className="mt-2 text-xs opacity-70">
                        Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Stat card variant
export function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  className = '',
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
}) {
  return (
    <div className={`glass rounded-lg border border-surface-200 p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        {trend && (
          <div className={`text-sm font-medium mb-0.5 ${
            trend.value >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend.value >= 0 ? '+' : ''}{trend.value.toFixed(1)}%
          </div>
        )}
      </div>
      {subValue && (
        <div className="text-sm text-slate-500 mt-1">{subValue}</div>
      )}
    </div>
  );
}
