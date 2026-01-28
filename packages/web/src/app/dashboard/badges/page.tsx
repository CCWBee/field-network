'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface BadgeDefinition {
  type: string;
  name: string;
  description: string;
  category: string;
  icon_url: string | null;
}

interface EarnedBadge {
  badge_type: string;
  tier: string;
  title: string;
  description: string;
  icon_url: string | null;
  earned_at: string;
}

export default function BadgesPage() {
  const { token } = useAuthStore();
  const [definitions, setDefinitions] = useState<BadgeDefinition[]>([]);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBadges = async () => {
      try {
        api.setToken(token);
        const [defs, mine] = await Promise.all([api.getBadges(), api.getMyBadges()]);
        setDefinitions(defs.badges);
        setEarned(mine.badges);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load badges');
      } finally {
        setIsLoading(false);
      }
    };

    loadBadges();
  }, [token]);

  const earnedMap = useMemo(() => {
    const map = new Map<string, EarnedBadge>();
    earned.forEach((badge) => map.set(badge.badge_type, badge));
    return map;
  }, [earned]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-semibold text-slate-800">Badge Vault</h1>
          <p className="text-slate-500 mt-2">Every badge is a real signal of field performance.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-md">
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="glass rounded-lg border border-surface-200 p-6 text-sm text-slate-500">
          Loading badge vault...
        </div>
      ) : definitions.length === 0 ? (
        <div className="glass rounded-lg border border-surface-200 p-6 text-sm text-slate-500">
          No badges available yet. Check back after your next mission.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {definitions.map((badge) => {
            const owned = earnedMap.get(badge.type);
            return (
              <div
                key={badge.type}
                className={`glass rounded-lg border p-6 transition ${
                  owned
                    ? 'border-field-200 bg-white shadow-md'
                    : 'border-surface-200 bg-white/80 shadow-sm opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {badge.icon_url ? (
                      <div className="h-10 w-10 rounded-full bg-slate-100 border border-surface-200 overflow-hidden">
                        <img
                          src={badge.icon_url}
                          alt={badge.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-slate-100 border border-surface-200 flex items-center justify-center text-sm font-semibold text-slate-500">
                        {badge.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800">{badge.name}</h2>
                      <p className="text-sm text-slate-500 mt-1">How to earn: {badge.description}</p>
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {badge.category}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    owned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {owned ? `Earned ${new Date(owned.earned_at).toLocaleDateString()}` : 'Locked'}
                  </span>
                  {owned && (
                    <span className="text-xs text-slate-400">Tier {owned.tier}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
